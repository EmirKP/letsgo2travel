import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin", "moderator"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const { data, error } = await supabase
    .from("visa_appointment_tracks")
    .select("id,user_id,country_code,country_name,provider_code,provider_name,application_city,alternative_city,visa_category,applicants_count,earliest_date,latest_date,status,access_expires_at,last_checked_at,next_check_at,last_result,error_count,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ error: "Takip tabloları kurulmamış olabilir." }, { status: 500 });

  const rows = data || [];
  const stats = {
    total: rows.length,
    active: rows.filter((row) => ["active", "pending_activation"].includes(row.status)).length,
    found: rows.filter((row) => row.status === "match_found").length,
    errors: rows.filter((row) => row.status === "error").length,
    expiringSoon: rows.filter((row) => {
      const remaining = new Date(row.access_expires_at).getTime() - Date.now();
      return remaining > 0 && remaining < 6 * 60 * 60 * 1000;
    }).length,
  };

  return NextResponse.json({ data: rows, stats }, { headers: { "Cache-Control": "no-store" } });
}
