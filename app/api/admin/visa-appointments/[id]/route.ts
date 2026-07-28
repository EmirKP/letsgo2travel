import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ACTIONS = ["activate_demo", "activate_idata", "simulate_match", "reset_pending"] as const;
type Action = (typeof ACTIONS)[number];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const { id } = await params;
  const body = (await request.json()) as { action?: Action };
  if (!body.action || !ACTIONS.includes(body.action)) return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });

  const { data: track } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_code,earliest_date,latest_date")
    .eq("id", id)
    .maybeSingle();
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

  if (body.action === "activate_demo") {
    const { error } = await supabase.from("visa_appointment_tracks").update({
      provider_code: "demo",
      provider_name: "LetsGo2Travel Test Sağlayıcısı",
      status: "active",
      next_check_at: new Date().toISOString(),
      last_result: "Demo worker kontrolüne hazır",
      locked_until: null,
      locked_by: null,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "Demo görev etkinleştirilemedi." }, { status: 500 });
    return NextResponse.json({ message: "Takip demo worker için etkinleştirildi." });
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

  if (body.action === "simulate_match") {
    const suggestedDate = track.earliest_date;
    await supabase.from("visa_appointment_matches").insert({
      track_id: id,
      user_id: track.user_id,
      available_dates: [suggestedDate],
      provider_message: "Yönetim panelinden oluşturulan test uygunluk kaydı.",
      status: "new",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const { error } = await supabase.from("visa_appointment_tracks").update({
      status: "match_found",
      last_checked_at: new Date().toISOString(),
      next_check_at: null,
      last_result: `Test uygunluk tarihi: ${suggestedDate}`,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: "Test sonucu oluşturulamadı." }, { status: 500 });
    return NextResponse.json({ message: "Test uygun tarih sonucu oluşturuldu." });
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
  return NextResponse.json({ message: "Takip bekleme durumuna alındı." });
}
