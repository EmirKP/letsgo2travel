import { NextResponse } from "next/server";
import { deactivateLiveActivityInstallation, registerLiveActivityToken } from "@/lib/live-activity-tokens";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Live Activity push token kaydı ve ÇIKIŞ temizliği. İş mantığı
// lib/live-activity-tokens.ts'tedir (birim testli). Kurallar:
// - Yalnız giriş yapmış kullanıcı (Bearer) KENDİ tokenlarını yönetebilir.
// - Token değeri hiçbir yanıt/log/hata mesajına yazılmaz.
// - POST: kayıt + push-to-start rotasyonu + hesaplar-arası tekil sahiplik.
// - DELETE: çıkışta BU kurulumun (fiziksel cihaz) tüm LA tokenlarını
//   kapatır; kullanıcının diğer cihazları (iPad) ETKİLENMEZ. Mobil bunu
//   oturum silinmeden ÖNCE çağırır — hesaplar arası sızıntı koruması.
// - Tablo RLS default-deny + service-role kilitlidir.

async function requireUser(request: Request, supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  return error ? null : user;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const result = await registerLiveActivityToken(supabase, user.id, body || {});
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const user = await requireUser(request, supabase);
  if (!user) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

  const body = await request.json().catch(() => null) as { installationId?: unknown } | null;
  const result = await deactivateLiveActivityInstallation(supabase, user.id, body?.installationId);
  return NextResponse.json(result.body, { status: result.status });
}
