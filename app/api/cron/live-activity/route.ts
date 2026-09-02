import { NextResponse } from "next/server";
import {
  LIVE_ACTIVITY_SOFT_DEADLINE_MS,
  runLiveActivityCron,
  type LiveActivitySendPayload,
} from "@/lib/live-activity-cron";
import { createSupabaseLiveActivityStore } from "@/lib/live-activity-store";
import { sendApnsLiveActivity } from "@/lib/push/apns";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live Activity push-to-start / bitirme cron'u (v3 — güvenilir teslim).
// Çekirdek lib/live-activity-cron.ts'tedir (birim testli):
// - Teslim durumu trip + token(cihaz) + event bazında (live_activity_deliveries).
// - Atomik claim: lease + fencing claim_token + attempt guard'ı; paralel
//   cron'lar aynı teslimi AYNI ANDA gönderemez; eski worker yeni claim
//   sonucunu EZEMEZ. DÜRÜST SINIR: teslim "en az bir kez"dir — APNs
//   başarısından sonra settle yazılamadan çökülürse lease bitince yeniden
//   gönderim mümkündür; apns-collapse-id bunun cihazdaki etkisini azaltır.
// - Transient hatada token bazında bağımsız retry (en fazla 3 deneme,
//   geri çekilmeli); kalıcı APNs hatasında YALNIZ ilgili token kapatılır.
// - Soft deadline (maxDuration=60 için ~45sn): sonrasında yeni claim
//   açılmaz, kalan iş sonraki cron'a kalır (deferred/deadlineReached).
// - Gönderimler kontrollü paralel (küçük gruplar, Promise.allSettled).
// - YALNIZ Bearer CRON_SECRET ile çalışır; token değerleri loglanmaz.

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7).trim();
  if (!provided || provided.length !== cronSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cronSecret.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

function transport(token: string, payload: LiveActivitySendPayload) {
  // Trip+event tabanlı collapse id: olası yeniden gönderim (crash-after-
  // send) cihazda tek bildirim olarak görünür.
  const collapseId = `la-${payload.tripId}-${payload.event}`;
  return payload.event === "start"
    ? sendApnsLiveActivity(token, {
      event: "start",
      collapseId,
      attributes: payload.attributes,
      departureAtMs: payload.departureAtMs,
      alert: payload.alert,
    })
    : sendApnsLiveActivity(token, { event: "end", collapseId, departureAtMs: payload.departureAtMs });
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  try {
    const store = createSupabaseLiveActivityStore(supabase);
    const summary = await runLiveActivityCron(store, transport, {
      softDeadlineMs: LIVE_ACTIVITY_SOFT_DEADLINE_MS,
    });
    return NextResponse.json(
      { success: true, ...summary },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    // 42P01: live_activity tabloları üretimde henüz yok (migration bekliyor).
    const message = error instanceof Error ? error.message : "unknown";
    console.error("live_activity_cron_hatasi", { message: message.slice(0, 120) });
    return NextResponse.json(
      { success: false, error: "Live Activity cron çalıştırılamadı." },
      { status: 500 },
    );
  }
}
