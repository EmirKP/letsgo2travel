import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
  const { data: expired, error: lookupError } = await supabase
    .from("travel_verifications")
    .select("id,evidence_path")
    .eq("status", "pending")
    .not("evidence_path", "is", null)
    .lte("evidence_expires_at", now)
    .order("evidence_expires_at", { ascending: true })
    .limit(100);

  if (lookupError) {
    return NextResponse.json({ error: "Süresi dolan belgeler kontrol edilemedi." }, { status: 500 });
  }
  if (!expired?.length) {
    return NextResponse.json({ success: true, purged: 0, checkedAt: now });
  }

  const paths = expired.map((item) => item.evidence_path).filter((value): value is string => typeof value === "string" && Boolean(value));
  const { error: storageError } = await supabase.storage.from("travel-evidence").remove(paths);
  if (storageError) {
    return NextResponse.json({ error: "Süresi dolan özel belgeler silinemedi; kayıtlar değiştirilmedi." }, { status: 500 });
  }

  const ids = expired.map((item) => item.id);
  const { error: updateError } = await supabase
    .from("travel_verifications")
    .update({
      evidence_path: null,
      proof_deleted_at: now,
      status: "rejected",
      admin_note: "Özel belgenin 30 günlük azami saklama süresi dolduğu için başvuru kapatıldı.",
      reviewed_at: now,
    })
    .in("id", ids)
    .eq("status", "pending");
  if (updateError) {
    return NextResponse.json({ error: "Belgeler silindi ancak kayıtların durumu güncellenemedi." }, { status: 500 });
  }

  return NextResponse.json({ success: true, purged: ids.length, checkedAt: now });
}
