import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { adminSessionFromRequest, isAdminRole } from "@/lib/admin-session";
import { flightSourceRuntimeReady } from "@/lib/flights/server/source-domains";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const suppliedOrigin = new URL(origin).origin;
    const allowedOrigins = new Set([new URL(request.url).origin]);
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      allowedOrigins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
    }
    return allowedOrigins.has(suppliedOrigin);
  } catch {
    return false;
  }
}

async function mutationPrincipal(
  request: Request,
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
) {
  const signedSession = await adminSessionFromRequest(request);
  if (signedSession) {
    if (!/^[0-9a-f-]{36}$/i.test(signedSession.subject)) {
      return { actorId: null, role: signedSession.role };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", signedSession.subject)
      .maybeSingle();
    return isAdminRole(profile?.role) && ["admin", "super_admin"].includes(profile.role)
      ? { actorId: signedSession.subject, role: profile.role }
      : null;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const { data: authData } = await supabase.auth.getUser(authorization.slice(7).trim());
  if (!authData.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  return isAdminRole(profile?.role) && ["admin", "super_admin"].includes(profile.role)
    ? { actorId: authData.user.id, role: profile.role }
    : null;
}

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });

  const [{ data: sources, error }, { data: heartbeats }] = await Promise.all([
    supabase
      .from("flight_sources")
      .select("id,name,source_type,official_domain,integration_method,integration_status,permission_status,enabled,supports_one_way,supports_round_trip,supports_multi_city,supports_baggage,supports_fare_rules,supports_revalidation,supports_installments,supported_currencies,last_success_at,last_error_at,last_error_code,last_error_message,average_response_ms,success_rate,searches_today,offers_today,updated_at")
      .order("name", { ascending: true }),
    supabase
      .from("flight_worker_heartbeats")
      .select("worker_name,worker_version,status,last_seen_at,last_error")
      .order("last_seen_at", { ascending: false })
      .limit(20),
  ]);
  if (error) {
    return NextResponse.json(
      { error: "Uçuş kaynakları tablosu bulunamadı. Faz 1 migration'ını uygulayın." },
      { status: 503 },
    );
  }

  const data = (sources || []).map((source) => ({
    ...source,
    runtime_ready: flightSourceRuntimeReady(source.id)
      && source.integration_status === "active"
      && ["approved", "public_documented"].includes(source.permission_status),
  }));
  return NextResponse.json(
    { data, workers: heartbeats || [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 5_000) {
    return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as { sourceId?: unknown; enabled?: unknown } | null;
  const sourceId = String(body?.sourceId || "");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(sourceId) || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Geçersiz kaynak güncellemesi." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });
  const principal = await mutationPrincipal(request, supabase);
  if (!principal) return NextResponse.json({ error: "Yönetici yetkisi yeniden doğrulanamadı." }, { status: 403 });
  const { data: source, error: sourceError } = await supabase
    .from("flight_sources")
    .select("id,name,enabled,integration_status,permission_status")
    .eq("id", sourceId)
    .maybeSingle();
  if (sourceError) return NextResponse.json({ error: "Kaynak okunamadı." }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Kaynak bulunamadı." }, { status: 404 });

  if (body.enabled && (
    source.integration_status !== "active"
    || !["approved", "public_documented"].includes(source.permission_status)
    || !flightSourceRuntimeReady(source.id)
  )) {
    return NextResponse.json({
      error: "Bu kaynak etkinleştirilemez. Resmî izin, aktif entegrasyon ve kod connector'ı birlikte gerekli.",
      code: "SOURCE_NOT_READY",
    }, { status: 409 });
  }
  if (source.enabled === body.enabled) return NextResponse.json({ data: source, message: "Kaynak zaten bu durumda." });

  const { data: updated, error: updateError } = await supabase
    .from("flight_sources")
    .update({ enabled: body.enabled })
    .eq("id", source.id)
    .select("id,name,enabled,integration_status,permission_status,updated_at")
    .single();
  if (updateError) return NextResponse.json({ error: "Kaynak durumu güncellenemedi." }, { status: 500 });

  const { error: auditError } = await supabase.from("flight_source_audit_logs").insert({
    source_id: source.id,
    actor_id: principal.actorId,
    actor_role: principal.role,
    action: body.enabled ? "enabled" : "disabled",
    old_enabled: source.enabled,
    new_enabled: body.enabled,
  });
  if (auditError) {
    await supabase.from("flight_sources").update({ enabled: source.enabled }).eq("id", source.id);
    return NextResponse.json({ error: "Denetim kaydı yazılamadığı için değişiklik geri alındı." }, { status: 500 });
  }

  return NextResponse.json({ data: updated, message: body.enabled ? "Kaynak etkinleştirildi." : "Kaynak duraklatıldı." });
}
