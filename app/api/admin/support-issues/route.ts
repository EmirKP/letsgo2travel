import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { boundedJson } from "@/lib/travel-assistant/http";
import { SUPPORT_PRIVATE_HEADERS, SUPPORT_UUID } from "@/lib/support-issues";

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: SUPPORT_PRIVATE_HEADERS });

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const supabase = getSupabaseAdmin();
  if (!supabase) return reply({ error: "Destek servisi yapılandırılmamış." }, 503);
  const url = new URL(request.url);
  const imageId = url.searchParams.get("image");
  if (imageId) {
    if (!SUPPORT_UUID.test(imageId)) return reply({ error: "Geçersiz bildirim." }, 400);
    const { data, error } = await supabase.from("support_issues").select("screenshot_base64").eq("id", imageId).maybeSingle();
    if (error) return reply({ error: "Görsel yüklenemedi." }, 503);
    if (!data?.screenshot_base64) return reply({ error: "Görsel bulunamadı." }, 404);
    return new Response(Buffer.from(data.screenshot_base64, "base64"), { headers: { ...SUPPORT_PRIVATE_HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": "inline" } });
  }
  const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get("offset")) || 0));
  const status = url.searchParams.get("status") === "resolved" ? "resolved" : "open";
  const { data, count, error } = await supabase.from("support_issues")
    .select("id,description,reply_email,screen,locale,app_version,build_number,status,created_at,has_screenshot", { count: "exact" })
    .eq("status", status).order("created_at", { ascending: false }).range(offset, offset + 24);
  if (error) return reply({ error: "Bildirimler yüklenemedi." }, 503);
  return reply({ data, count });
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const supabase = getSupabaseAdmin();
  if (!supabase) return reply({ error: "Destek servisi yapılandırılmamış." }, 503);
  const body = await boundedJson(request, 1024).catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (!body || typeof body.id !== "string" || !SUPPORT_UUID.test(body.id) || !["open", "resolved"].includes(String(body.status))) return reply({ error: "Geçersiz işlem." }, 400);
  const { data, error } = await supabase.from("support_issues").update({ status: body.status }).eq("id", body.id).select("id").maybeSingle();
  if (error) return reply({ error: "Bildirim güncellenemedi." }, 503);
  if (!data) return reply({ error: "Bildirim bulunamadı." }, 404);
  return reply({ id: data.id });
}
