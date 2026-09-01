import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: [], logs: [] });

  const { data, error } = await supabase
    .from("flight_price_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const alertIds = (data || []).map((alert: any) => alert.id);
  let logs: any[] = [];
  if (alertIds.length > 0) {
    const { data: logRows } = await supabase
      .from("flight_price_alert_logs")
      .select("id, alert_id, status, price, currency, error_message, checked_at")
      .in("alert_id", alertIds)
      .order("checked_at", { ascending: false })
      .limit(500);
    logs = logRows || [];
  }

  return NextResponse.json({ data, logs }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function DELETE(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor." }, { status: 500 });
  }

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const { error } = await supabase
    .from("flight_price_alerts")
    .update({ is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Alarm iptal edildi" });
}

export async function PATCH(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Backend entegrasyonu gerekiyor." }, { status: 500 });
  }

  const body = await request.json();
  const { id, is_active, status, target_price, threshold_percent } = body;
  if (!id) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });

  const updatePayload: Record<string, unknown> = {};
  if (is_active !== undefined) {
    updatePayload.is_active = is_active;
    updatePayload.status = is_active ? "active" : "paused";
  }
  if (status) updatePayload.status = status;
  if (target_price !== undefined) updatePayload.target_price = target_price || null;
  if (threshold_percent !== undefined) updatePayload.threshold_percent = threshold_percent;

  const { error } = await supabase.from("flight_price_alerts").update(updatePayload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "Alarm güncellendi" });
}
