import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const EVIDENCE_BUCKET = "visa-appointment-evidence";

type LatestLog = {
  track_id: string;
  outcome: string;
  message: string | null;
  evidence_url: string | null;
  checked_at: string;
  worker_name: string | null;
};

async function signedEvidenceUrl(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  reference: string | null,
) {
  if (!reference) return null;
  if (!reference.startsWith("storage:")) return reference;
  const path = reference.slice("storage:".length);
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 600);
  if (error) return null;
  return data.signedUrl;
}

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
  const latestByTrack = new Map<string, LatestLog>();
  const ids = rows.map((row) => row.id);

  if (ids.length > 0) {
    const { data: logs } = await supabase
      .from("visa_appointment_check_logs")
      .select("track_id,outcome,message,evidence_url,checked_at,worker_name")
      .in("track_id", ids)
      .order("checked_at", { ascending: false })
      .limit(Math.min(1000, Math.max(50, ids.length * 5)));

    for (const log of (logs || []) as LatestLog[]) {
      if (!latestByTrack.has(log.track_id)) latestByTrack.set(log.track_id, log);
    }
  }

  const enriched = await Promise.all(rows.map(async (row) => {
    const latest = latestByTrack.get(row.id) || null;
    return {
      ...row,
      latest_outcome: latest?.outcome || null,
      latest_message: latest?.message || null,
      latest_checked_at: latest?.checked_at || row.last_checked_at,
      latest_worker_name: latest?.worker_name || null,
      latest_evidence_url: await signedEvidenceUrl(supabase, latest?.evidence_url || null),
    };
  }));

  const stats = {
    total: rows.length,
    active: rows.filter((row) => ["active", "pending_activation"].includes(row.status)).length,
    found: rows.filter((row) => row.status === "match_found").length,
    verification: rows.filter((row) => row.status === "verification_required").length,
    errors: rows.filter((row) => row.status === "error").length,
    expiringSoon: rows.filter((row) => {
      const remaining = new Date(row.access_expires_at).getTime() - Date.now();
      return remaining > 0 && remaining < 6 * 60 * 60 * 1000;
    }).length,
  };

  return NextResponse.json({ data: enriched, stats }, { headers: { "Cache-Control": "no-store" } });
}
