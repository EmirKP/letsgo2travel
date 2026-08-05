import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Geçersiz takip kimliği." }, { status: 400 });
  }
  const body = (await request.json()) as { action?: "pause" | "resume" | "retry" };
  if (!body.action || !["pause", "resume", "retry"].includes(body.action)) {
    return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
  }

  const { data: existing } = await auth.supabase
    .from("visa_appointment_tracks")
    .select("id,status,access_expires_at,provider_code")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });
  if (new Date(existing.access_expires_at) <= new Date()) return NextResponse.json({ error: "Takip süresi dolmuş." }, { status: 409 });

  if (body.action === "retry" && existing.status !== "verification_required") {
    return NextResponse.json({ error: "Bu takip doğrulama beklemiyor." }, { status: 409 });
  }
  if ((body.action === "resume" || body.action === "retry") && !existing.provider_code) {
    return NextResponse.json({ error: "Takip sağlayıcısı henüz etkinleştirilmemiş." }, { status: 409 });
  }

  const nextStatus = body.action === "pause" ? "paused" : existing.provider_code ? "active" : "pending_activation";
  const update = {
    status: nextStatus,
    next_check_at: body.action === "pause" ? null : new Date().toISOString(),
    locked_until: null,
    locked_by: null,
    ...(body.action === "retry" ? { last_result: "Kullanıcı doğrulama sonrasında yeniden kontrol istedi", error_count: 0 } : {}),
  };

  const { error } = await auth.supabase
    .from("visa_appointment_tracks")
    .update(update)
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Takip güncellenemedi." }, { status: 500 });
  const messages = {
    pause: "Takip duraklatıldı.",
    resume: "Takip yeniden başlatıldı.",
    retry: "Takip yeniden kontrol kuyruğuna alındı.",
  };
  return NextResponse.json({ message: messages[body.action] });
}
