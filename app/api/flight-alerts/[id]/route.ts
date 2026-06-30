import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAlertToken } from "@/lib/price-alerts";

async function getCurrentUser(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

async function assertAlertAccess(request: Request, supabase: any, id: string, token?: string | null) {
  const { data: alertData, error: fetchError } = await supabase
    .from("flight_price_alerts")
    .select("user_id, manage_token_hash, manage_token_expires_at")
    .eq("id", id)
    .single();

  if (fetchError || !alertData) return { ok: false, status: 404, error: "Alarm bulunamadı." };

  if (alertData.user_id) {
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return { ok: false, status: 401, error: "Oturum gerekli." };
    if (alertData.user_id !== currentUser.id) return { ok: false, status: 403, error: "Yetkisiz işlem." };
    return { ok: true, alertData };
  }

  if (!token) return { ok: false, status: 401, error: "Token eksik." };
  const validToken = verifyAlertToken({
    plainToken: token,
    storedHash: alertData.manage_token_hash,
    expiresAt: alertData.manage_token_expires_at,
  });
  if (!validToken) return { ok: false, status: 401, error: "Geçersiz veya süresi dolmuş token." };
  return { ok: true, alertData };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });

  try {
    const resolvedParams = await params;
    const body = await request.json();
    const { is_active, target_price, threshold_percent, notify_email, notify_push } = body;
    const access = await assertAlertAccess(request, supabase, resolvedParams.id);

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const updatePayload: Record<string, unknown> = {};
    if (is_active !== undefined) {
      updatePayload.is_active = is_active;
      updatePayload.status = is_active ? "active" : "paused";
    }
    if (target_price !== undefined) updatePayload.target_price = target_price;
    if (threshold_percent !== undefined) updatePayload.threshold_percent = threshold_percent;
    if (notify_email !== undefined) updatePayload.notify_email = notify_email;
    if (notify_push !== undefined) updatePayload.notify_push = notify_push;

    const { error: updateError } = await supabase
      .from("flight_price_alerts")
      .update(updatePayload)
      .eq("id", resolvedParams.id);

    if (updateError) {
      return NextResponse.json({ error: "Güncelleme başarısız." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Alarm güncellendi." });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Backend entegrasyonu hatası." }, { status: 500 });

  try {
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const access = await assertAlertAccess(request, supabase, resolvedParams.id, token);

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { error: updateError } = await supabase
      .from("flight_price_alerts")
      .update({ is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", resolvedParams.id);

    if (updateError) {
      return NextResponse.json({ error: "Alarm kapatılamadı." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Alarm kapatıldı." });
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
}
