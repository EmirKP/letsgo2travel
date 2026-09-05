import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanupReviewedEvidence } from "@/lib/verification-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`
    || new URL(request.url).searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 503 });

  const now = new Date().toISOString();
  // Close first. This update serialises with the review transaction's row lock.
  const { error: expireError } = await supabase.from("travel_verifications")
    .update({ status: "rejected", admin_note: "Özel belgenin azami saklama süresi doldu.", reviewed_at: now })
    .eq("status", "pending").lte("evidence_expires_at", now);
  if (expireError) return NextResponse.json({ error: "Başvurular kapatılamadı; belgeler korundu." }, { status: 500 });
  const { data: expired, error: lookupError } = await supabase
    .from("travel_verifications")
    .select("id,status,evidence_path")
    .in("status", ["approved", "rejected"])
    .not("evidence_path", "is", null)
    .order("evidence_expires_at", { ascending: true })
    .limit(100);

  if (lookupError) {
    return NextResponse.json({ error: "Süresi dolan belgeler kontrol edilemedi." }, { status: 500 });
  }
  if (!expired?.length) {
    return NextResponse.json({ success: true, purged: 0, checkedAt: now });
  }

  const results = await Promise.all(expired.map(item => cleanupReviewedEvidence(supabase, { id: item.id, status: item.status, evidencePath: item.evidence_path })));
  return NextResponse.json({ success: results.every(Boolean), purged: results.filter(Boolean).length, retryPending: results.filter(result => !result).length, checkedAt: now });
}
