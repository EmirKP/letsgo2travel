// =====================================================================
// Live Activity cron çekirdeği (saf; birim testli — ağ/DB importu YOK).
// Teslim modeli: (trip, token/cihaz, event) başına TEK satır.
//   pending → sent
//           → transient_failed (≤ MAX_ATTEMPTS deneme, geri çekilmeli)
//           → permanent_failed (kalıcı APNs hatası / deneme tükendi / stale)
// Eşzamanlılık: atomik claim (lease + fencing claim_token + attempt
// guard'ı). Atomik claim, PARALEL cron'ların aynı teslimi AYNI ANDA
// göndermesini engeller; eski bir worker'ın gecikmiş sonucu yeni claim'in
// yazdığını EZEMEZ (fenced settle).
// DÜRÜST GARANTİ SINIRI: teslim "en az bir kez"dir — APNs gönderimi
// BAŞARILI olduktan sonra süreç settle yazamadan çökerse, lease süresi
// dolunca aynı teslim yeniden gönderilebilir. Bu pencereyi küçültmek için
// APNs isteklerine trip+event tabanlı apns-collapse-id eklenir (cihazda
// yinelenen push tek görünür). "Asla iki kez göndermez" İDDİA EDİLMEZ.
// Süre: soft deadline sonrası YENİ claim/seed açılmaz; kalan iş sonraki
// cron'a kalır (deferred). Gönderimler kontrollü paralel (küçük gruplar).
// =====================================================================

import { randomUUID } from "node:crypto";

export const LIVE_ACTIVITY_LEAD_MS = 3 * 60 * 60 * 1000; // kalkışa 3 saat kala start
export const LIVE_ACTIVITY_TAIL_MS = 60 * 60 * 1000; // kalkıştan 1 saat sonra end
export const LIVE_ACTIVITY_ARRIVAL_GRACE_MS = 20 * 60 * 1000;
export const LIVE_ACTIVITY_MAX_ATTEMPTS = 3; // en fazla 3 transient deneme
export const LIVE_ACTIVITY_LEASE_MS = 60 * 1000;
export const LIVE_ACTIVITY_RETRY_BACKOFF_MS = 5 * 60 * 1000;
export const LIVE_ACTIVITY_END_SEED_HORIZON_MS = 48 * 60 * 60 * 1000;
export const LIVE_ACTIVITY_SEND_CONCURRENCY = 4;
export const LIVE_ACTIVITY_SOFT_DEADLINE_MS = 45 * 1000; // maxDuration=60 için pay

export type CronTrip = {
  id: string;
  userId: string;
  title: string;
  originIata: string;
  destinationIata: string;
  departureAtMs: number;
  /** Planlanan varış; eski kayıtlarda yoksa güvenli +1 saat fallback kullanılır. */
  arrivalAtMs?: number;
  language?: "tr" | "en";
};

export type CronToken = {
  id: string;
  token: string;
  enabled: boolean;
};

export type DeliveryStatus = "pending" | "sent" | "transient_failed" | "permanent_failed";

export type DeliveryRow = {
  id: string;
  tripId: string;
  tokenId: string;
  event: "start" | "end";
  status: DeliveryStatus;
  attemptCount: number;
  claimToken: string | null;
  claimedUntilMs: number | null;
  nextRetryAtMs: number;
};

export type SettlePatch = {
  status: DeliveryStatus;
  attemptCount: number;
  nextRetryAtMs?: number;
  lastError?: string;
};

export type LiveActivityStore = {
  tripsDepartingBetween(fromMs: number, toMs: number, limit: number): Promise<CronTrip[]>;
  tripsEndDue(nowMs: number, horizonMs: number, limit: number): Promise<CronTrip[]>;
  pushToStartTokensByUser(userIds: string[]): Promise<Map<string, CronToken[]>>;
  activityUpdateTokensByTrip(tripIds: string[]): Promise<Map<string, CronToken[]>>;
  /** (trip, token, event) satırlarını yoksa açar; ÇAKIŞANI SESSİZCE ATLAR. */
  seedDeliveries(rows: Array<{ tripId: string; tokenId: string; event: "start" | "end" }>): Promise<void>;
  dueDeliveries(nowMs: number, limit: number): Promise<DeliveryRow[]>;
  /**
   * ATOMİK claim. Yalnız şu koşullarda başarılıdır (tek atomik yazım):
   * status ∈ {pending, transient_failed} VE attempt_count beklenen değerde
   * VE lease yok/bitmiş. Başarıda claim_token + claimed_until yazılır.
   */
  claimDelivery(id: string, expectedAttemptCount: number, claimToken: string, leaseUntilMs: number, nowMs: number): Promise<boolean>;
  /** FENCED settle: yalnız satırdaki claim_token eşleşiyorsa yazar. */
  settleDelivery(id: string, claimToken: string, patch: SettlePatch): Promise<boolean>;
  tripsByIds(ids: string[]): Promise<Map<string, CronTrip>>;
  tokensByIds(ids: string[]): Promise<Map<string, CronToken>>;
  /** Kalıcı APNs hatasında YALNIZ ilgili token kapatılır. */
  disableToken(tokenId: string): Promise<void>;
};

export type LiveActivityPushOutcome = {
  ok: boolean;
  shouldDisableToken: boolean;
  reason?: string;
};

export type LiveActivitySendPayload =
  | {
    event: "start";
    tripId: string;
    attributes: { tripId: string; title: string; originIata: string; destinationIata: string; deepLink: string; language: string };
    departureAtMs: number;
    arrivalAtMs: number;
    alert: { title: string; body: string };
  }
  | { event: "end"; tripId: string; departureAtMs: number; arrivalAtMs: number };

export type LiveActivityTransport = (token: string, payload: LiveActivitySendPayload) => Promise<LiveActivityPushOutcome>;

export type LiveActivityCronSummary = {
  seededStarts: number;
  seededEnds: number;
  processed: number;
  sent: number;
  transientFailed: number;
  permanentFailed: number;
  tokensDisabled: number;
  fenced: number;
  claimLost: number;
  deferred: number;
  deadlineReached: boolean;
};

export type LiveActivityCronOptions = {
  nowMs?: number;
  softDeadlineMs?: number;
  seedTripLimit?: number;
  sendLimit?: number;
  concurrency?: number;
  makeClaimToken?: () => string;
};

// DB kolonu UUID'dir: UUID olmayan bir claim token gerçek Supabase'de
// 22P02 (invalid_text_representation) ile reddedilir ve HİÇBİR teslim
// yapılamazdı (v3'teki üretim hatası). Node 18+ her ortamda mevcuttur.
export function defaultClaimToken() {
  return randomUUID();
}

export function cockpitDeepLinkFor(tripId: string) {
  return `letsgo2travel://cockpit?tripId=${encodeURIComponent(tripId)}`;
}

export function activityArrivalAtMs(trip: Pick<CronTrip, "departureAtMs" | "arrivalAtMs">) {
  return Number.isFinite(trip.arrivalAtMs) && Number(trip.arrivalAtMs) > trip.departureAtMs
    ? Number(trip.arrivalAtMs)
    : trip.departureAtMs + LIVE_ACTIVITY_TAIL_MS;
}

export function buildStartPayload(trip: CronTrip): LiveActivitySendPayload {
  const english = trip.language === "en";
  return {
    event: "start",
    tripId: trip.id,
    attributes: {
      tripId: trip.id,
      title: trip.title || (english ? "Upcoming flight" : "Yaklaşan uçuş"),
      originIata: trip.originIata || "",
      destinationIata: trip.destinationIata || "",
      deepLink: cockpitDeepLinkFor(trip.id),
      language: english ? "en" : "tr",
    },
    departureAtMs: trip.departureAtMs,
    arrivalAtMs: activityArrivalAtMs(trip),
    alert: {
      title: english ? "Your flight is coming up ✈️" : "Uçuşun yaklaşıyor ✈️",
      body: english
        ? `3 hours until your ${trip.title || "upcoming"} flight.`
        : `${trip.title || "Yaklaşan uçuş"} uçuşuna 3 saat kaldı.`,
    },
  };
}

async function seedPhase(
  store: LiveActivityStore,
  nowMs: number,
  seedTripLimit: number,
  summary: LiveActivityCronSummary,
) {
  // START: kalkışa ≤3 saat kalan uçuşlar × kullanıcının push-to-start
  // tokenları. Seed idempotenttir (unique constraint + çakışanı atla).
  const startTrips = await store.tripsDepartingBetween(nowMs, nowMs + LIVE_ACTIVITY_LEAD_MS, seedTripLimit);
  const startTokenMap = await store.pushToStartTokensByUser(
    Array.from(new Set(startTrips.map((trip) => trip.userId))),
  );
  const startRows = startTrips.flatMap((trip) =>
    (startTokenMap.get(trip.userId) || [])
      .filter((token) => token.enabled)
      .map((token) => ({ tripId: trip.id, tokenId: token.id, event: "start" as const })),
  );
  if (startRows.length) await store.seedDeliveries(startRows);
  summary.seededStarts = startRows.length;

  // END: planlanan varış + karşılama payı geçmiş uçuşlar × o kaydın activity_update
  // tokenları. Token YOKSA satır açılmaz → end "tamamlanmış" SAYILMAZ;
  // token sonradan kaydolursa bir sonraki cron satırı açar.
  const endTrips = await store.tripsEndDue(nowMs, LIVE_ACTIVITY_END_SEED_HORIZON_MS, seedTripLimit);
  const endTokenMap = await store.activityUpdateTokensByTrip(endTrips.map((trip) => trip.id));
  const endRows = endTrips.flatMap((trip) =>
    (endTokenMap.get(trip.id) || [])
      .filter((token) => token.enabled)
      .map((token) => ({ tripId: trip.id, tokenId: token.id, event: "end" as const })),
  );
  if (endRows.length) await store.seedDeliveries(endRows);
  summary.seededEnds = endRows.length;
}

async function processDelivery(
  store: LiveActivityStore,
  transport: LiveActivityTransport,
  row: DeliveryRow,
  trip: CronTrip | undefined,
  token: CronToken | undefined,
  claimToken: string,
  nowMs: number,
  summary: LiveActivityCronSummary,
) {
  const settle = async (patch: SettlePatch) => {
    const applied = await store.settleDelivery(row.id, claimToken, patch);
    if (!applied) summary.fenced += 1;
    return applied;
  };

  // Bağlam eksikse (trip/token silinmiş, token kapatılmış): gönderim yok,
  // deneme sayısı ARTMAZ, satır kalıcı kapatılır.
  if (!trip || !token || !token.enabled) {
    if (await settle({ status: "permanent_failed", attemptCount: row.attemptCount, lastError: "context_missing" })) {
      summary.permanentFailed += 1;
    }
    return;
  }

  // Push-to-start kalkıştan sonra ulaşırsa "3 saat kaldı" bildirimi yanlış
  // olur. Uygulama içindeki yerel aktivite uçuş görünümünü ayrıca yönetir.
  if (row.event === "start" && nowMs >= trip.departureAtMs) {
    if (await settle({ status: "permanent_failed", attemptCount: row.attemptCount, lastError: "stale_start" })) {
      summary.permanentFailed += 1;
    }
    return;
  }

  const payload: LiveActivitySendPayload = row.event === "start"
    ? buildStartPayload(trip)
    : { event: "end", tripId: trip.id, departureAtMs: trip.departureAtMs, arrivalAtMs: activityArrivalAtMs(trip) };

  let outcome: LiveActivityPushOutcome;
  try {
    outcome = await transport(token.token, payload);
  } catch {
    outcome = { ok: false, shouldDisableToken: false, reason: "transport_exception" };
  }

  const attempts = row.attemptCount + 1;
  if (outcome.ok) {
    if (await settle({ status: "sent", attemptCount: attempts })) summary.sent += 1;
    return;
  }
  if (outcome.shouldDisableToken) {
    // Kalıcı APNs hatası: YALNIZ bu token kapatılır; kullanıcının diğer
    // cihazlarının teslim satırları etkilenmez.
    await store.disableToken(token.id);
    summary.tokensDisabled += 1;
    if (await settle({ status: "permanent_failed", attemptCount: attempts, lastError: outcome.reason || "permanent" })) {
      summary.permanentFailed += 1;
    }
    return;
  }
  // Transient: en fazla MAX_ATTEMPTS deneme; sonra kalıcı başarısız.
  if (attempts >= LIVE_ACTIVITY_MAX_ATTEMPTS) {
    if (await settle({ status: "permanent_failed", attemptCount: attempts, lastError: outcome.reason || "attempts_exhausted" })) {
      summary.permanentFailed += 1;
    }
    return;
  }
  if (await settle({
    status: "transient_failed",
    attemptCount: attempts,
    nextRetryAtMs: nowMs + LIVE_ACTIVITY_RETRY_BACKOFF_MS,
    lastError: outcome.reason || "transient",
  })) {
    summary.transientFailed += 1;
  }
}

export async function runLiveActivityCron(
  store: LiveActivityStore,
  transport: LiveActivityTransport,
  options: LiveActivityCronOptions = {},
): Promise<LiveActivityCronSummary> {
  const startedAtMs = options.nowMs ?? Date.now();
  const softDeadlineMs = options.softDeadlineMs ?? LIVE_ACTIVITY_SOFT_DEADLINE_MS;
  const seedTripLimit = options.seedTripLimit ?? 40;
  const sendLimit = options.sendLimit ?? 60;
  const concurrency = Math.max(1, options.concurrency ?? LIVE_ACTIVITY_SEND_CONCURRENCY);
  const makeClaimToken = options.makeClaimToken ?? defaultClaimToken;
  // Testlerde sabit "şimdi" kullanılabilsin; üretimde gerçek saat ilerler.
  const clock = options.nowMs === undefined ? () => Date.now() : () => options.nowMs as number;
  const pastDeadline = () => clock() - startedAtMs > softDeadlineMs;

  const summary: LiveActivityCronSummary = {
    seededStarts: 0,
    seededEnds: 0,
    processed: 0,
    sent: 0,
    transientFailed: 0,
    permanentFailed: 0,
    tokensDisabled: 0,
    fenced: 0,
    claimLost: 0,
    deferred: 0,
    deadlineReached: false,
  };

  await seedPhase(store, startedAtMs, seedTripLimit, summary);

  const due = await store.dueDeliveries(clock(), sendLimit);
  const tripMap = await store.tripsByIds(Array.from(new Set(due.map((row) => row.tripId))));
  const tokenMap = await store.tokensByIds(Array.from(new Set(due.map((row) => row.tokenId))));

  for (let index = 0; index < due.length; index += concurrency) {
    // Soft deadline: yeni claim AÇILMAZ; kalan işler sonraki cron'a kalır.
    if (pastDeadline()) {
      summary.deadlineReached = true;
      summary.deferred += due.length - index;
      break;
    }
    const chunk = due.slice(index, index + concurrency);
    // Önce claim'ler (atomik, sıralı — DB'de tek satır yazımı), sonra
    // gönderimler KONTROLLÜ PARALEL: bir cihazın yavaşlığı diğerini bekletmez.
    const claimed: Array<{ row: DeliveryRow; claimToken: string }> = [];
    for (const row of chunk) {
      const claimToken = makeClaimToken();
      const nowMs = clock();
      const ok = await store.claimDelivery(row.id, row.attemptCount, claimToken, nowMs + LIVE_ACTIVITY_LEASE_MS, nowMs);
      if (ok) claimed.push({ row, claimToken });
      else summary.claimLost += 1; // başka worker aldı veya claim yazımı hata verdi
    }
    await Promise.allSettled(claimed.map(({ row, claimToken }) => {
      summary.processed += 1;
      return processDelivery(
        store,
        transport,
        row,
        tripMap.get(row.tripId),
        tokenMap.get(row.tokenId),
        claimToken,
        clock(),
        summary,
      );
    }));
  }

  return summary;
}
