import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ACTIONS = ["activate_idata", "reset_pending", "retry_check"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { action?: Action } | null;
  if (!body?.action || !ACTIONS.includes(body.action)) return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });

  const { data: track } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_code,earliest_date,latest_date,provider_code,access_expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

  if (body.action === "retry_check") {
    if (!track.provider_code) return NextResponse.json({ error: "Takip için sağlayıcı seçilmemiş." }, { status: 409 });
    if (new Date(track.access_expires_at) <= new Date()) return NextResponse.json({ error: "Takip süresi dolmuş." }, { status: 409 });
    const { error } = await supabase.from("visa_appointment_tracks").update({
      status: "active",
      next_check_at: new Date().toISOString(),
      last_result: "Yönetici tarafından yeniden kontrol kuyruğuna alındı",
      locked_until: null,
      locked_by: null,
      error_count: 0,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "Takip yeniden başlatılamadı." }, { status: 500 });
    return NextResponse.json({ message: "Takip yeniden kontrol kuyruğuna alındı." });
  }

  if (body.action === "activate_idata") {
    if (track.country_code !== "DE") {
      return NextResponse.json({ error: "İlk iDATA adaptörü yalnızca Almanya takiplerinde kullanılabilir." }, { status: 400 });
    }

    const { error } = await supabase.from("visa_appointment_tracks").update({
      provider_code: "idata",
      provider_name: "iDATA Almanya",
      status: "active",
      next_check_at: new Date().toISOString(),
      last_result: "iDATA gerçek bağlantı kontrolüne hazır",
      locked_until: null,
      locked_by: null,
      error_count: 0,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "iDATA görevi etkinleştirilemedi." }, { status: 500 });
    return NextResponse.json({ message: "Takip iDATA Almanya bağlantı kontrolü için etkinleştirildi." });
  }

  const { error } = await supabase.from("visa_appointment_tracks").update({
    provider_code: null,
    provider_name: null,
    status: "pending_activation",
    next_check_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    last_result: "Sağlayıcı aktivasyonu bekleniyor",
    locked_until: null,
    locked_by: null,
    error_count: 0,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: "Takip sıfırlanamadı." }, { status: 500 });
  return NextResponse.json({ message: "Takip sağlayıcı aktivasyonu bekleyecek şekilde sıfırlandı." });
}
