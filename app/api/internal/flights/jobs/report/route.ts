import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createProductionFlightConnectors } from "@/lib/flights/connectors";
import {
  groupOffersByItinerary,
  normalizeSourceOffer,
  validateFlightSearchRequest,
  type ConnectorSearchResult,
  type FlightSearchRequest,
  type NormalizedFlightOffer,
  type SourceFlightOffer,
} from "@/lib/flights/core";
import { flightSourceRuntimeReady } from "@/lib/flights/server/source-domains";
import { isUuid, tokenHashMatches } from "@/lib/flights/server/tokens";
import { authorizedFlightWorker } from "@/lib/flights/server/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OUTCOMES = new Set<ConnectorSearchResult["outcome"] | "failed">([
  "success",
  "no_results",
  "integration_required",
  "temporarily_unavailable",
  "failed",
]);

const ERROR_CODES = new Set([
  "authorization_failed",
  "quota_exceeded",
  "temporarily_unavailable",
  "format_changed",
  "timeout",
  "network_error",
  "invalid_route",
  "integration_required",
  "unknown",
]);

function moneyToMinor(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

function hashItineraryKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function terminalJobStatus(outcome: string, acceptedOfferCount: number) {
  if (outcome === "success") return acceptedOfferCount > 0 ? "completed" : "no_results";
  if (outcome === "no_results") return "no_results";
  if (outcome === "integration_required") return "integration_required";
  return "failed";
}

function hasOvernightLayover(offers: NormalizedFlightOffer[]) {
  const segments = offers[0]?.segments || [];
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (previous.legIndex !== current.legIndex) continue;
    const waitMinutes = (Date.parse(current.departureUtc) - Date.parse(previous.arrivalUtc)) / 60_000;
    if (waitMinutes >= 360 && current.departureLocal.slice(0, 10) !== previous.arrivalLocal.slice(0, 10)) return true;
  }
  return false;
}

async function persistOffers(params: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  searchId: string;
  sourceId: string;
  reportId: string;
  receivedAt: string;
  offers: NormalizedFlightOffer[];
}) {
  const itineraries = groupOffersByItinerary(params.offers);
  let persistedOffers = 0;

  for (const itinerary of itineraries) {
    const itineraryKey = hashItineraryKey(itinerary.itineraryKey);
    const marketingAirlines = [...new Set(itinerary.segments.map((segment) => segment.marketingCarrierCode))];
    const operatingAirlines = [...new Set(itinerary.segments.map((segment) => segment.operatingCarrierCode))];
    const transferAirports = [...new Set(itinerary.legs.flatMap((leg) => leg.stopAirports))];
    const { data: itineraryRow, error: itineraryError } = await params.supabase
      .from("flight_itineraries")
      .upsert({
        search_id: params.searchId,
        itinerary_key: itineraryKey,
        total_duration_minutes: itinerary.totalDurationMinutes,
        stop_count: itinerary.totalStops,
        marketing_airlines: marketingAirlines,
        operating_airlines: operatingAirlines,
        transfer_airports: transferAirports,
        has_airport_change: false,
        has_self_transfer: itinerary.hasSelfTransfer,
        has_overnight_layover: hasOvernightLayover(itinerary.offers),
      }, { onConflict: "search_id,itinerary_key" })
      .select("id")
      .single();
    if (itineraryError || !itineraryRow) throw new Error("itinerary_persist_failed");

    const segmentRows = itinerary.segments.map((segment, index) => ({
      itinerary_id: itineraryRow.id,
      segment_order: index,
      leg_index: segment.legIndex,
      marketing_airline: segment.marketingCarrierCode,
      marketing_flight_number: segment.flightNumber,
      operating_airline: segment.operatingCarrierCode || null,
      origin_code: segment.origin.code,
      destination_code: segment.destination.code,
      departure_at: segment.departureUtc,
      arrival_at: segment.arrivalUtc,
      departure_local: segment.departureLocal,
      arrival_local: segment.arrivalLocal,
      departure_terminal: segment.origin.terminal,
      arrival_terminal: segment.destination.terminal,
      cabin_class: segment.cabinClass,
      aircraft: segment.aircraft,
      self_transfer: segment.selfTransfer,
    }));
    const { error: segmentsError } = await params.supabase
      .from("flight_segments")
      .upsert(segmentRows, { onConflict: "itinerary_id,segment_order" });
    if (segmentsError) throw new Error("segments_persist_failed");

    for (const offer of itinerary.offers) {
      const passengerCount = Math.max(1, offer.passengerCount);
      const totalPriceMinor = moneyToMinor(offer.price.total);
      if (totalPriceMinor === null || totalPriceMinor <= 0) throw new Error("offer_price_invalid");
      const { error: offerError } = await params.supabase.from("flight_offers").upsert({
        search_id: params.searchId,
        itinerary_id: itineraryRow.id,
        source_id: params.sourceId,
        source_offer_ref: offer.sourceOfferId,
        report_id: params.reportId,
        fare_family: offer.farePackage || "",
        total_price_minor: totalPriceMinor,
        per_person_price_minor: Math.round(totalPriceMinor / passengerCount),
        currency: offer.price.currency,
        taxes_minor: moneyToMinor(offer.price.taxesTotal),
        mandatory_fees_minor: moneyToMinor(offer.price.mandatoryFeesTotal),
        price_completeness: offer.price.includesMandatoryFees ? "complete" : "partial",
        is_conditional_price: false,
        condition_summary: null,
        conditional_prices: offer.price.conditionalPrices,
        baggage: offer.baggage,
        fare_rules: { refundable: offer.refundable, changeable: offer.changeable },
        installment_options: offer.installmentOptions,
        benefits: offer.benefits,
        is_direct_airline: offer.directAirlineSale,
        sponsored: offer.sponsored,
        checkout_url: offer.checkoutUrl,
        available: true,
        observed_at: offer.observedAt,
        received_at: params.receivedAt,
        verified_at: offer.observedAt,
        expires_at: offer.expiresAt,
      }, { onConflict: "search_id,source_id,report_id,source_offer_ref,fare_family,itinerary_id" });
      if (offerError) throw new Error("offer_persist_failed");
      persistedOffers += 1;
    }
  }

  return { itineraryCount: itineraries.length, offerCount: persistedOffers };
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function baggageAdjustedPriceMinor(
  offer: Record<string, any>,
  request: FlightSearchRequest,
) {
  if (offer.sponsored === true || offer.price_completeness !== "complete" || offer.currency !== request.currency) return null;
  let total = Number(offer.total_price_minor);
  if (!Number.isSafeInteger(total) || total <= 0) return null;

  const conditions = Array.isArray(offer.conditional_prices) ? offer.conditional_prices : [];
  const eligible = new Set(request.eligiblePriceConditions);
  for (const condition of conditions) {
    if (!condition || !eligible.has(String(condition.eligibilityKey || ""))) continue;
    if (condition.currency !== request.currency) continue;
    const conditionalMinor = moneyToMinor(numberField(condition.total));
    if (conditionalMinor !== null && conditionalMinor > 0) total = Math.min(total, conditionalMinor);
  }

  const baggage = offer.baggage && typeof offer.baggage === "object" ? offer.baggage : {};
  const cabinIncluded = Number(baggage.cabinBagsPerPassenger) || 0;
  if (cabinIncluded < request.baggage.cabinBagsPerPassenger) {
    const fee = moneyToMinor(numberField(baggage.additionalCabinBagFeeTotal));
    if (fee === null) return null;
    total += fee;
  }

  const checkedIncluded = Number(baggage.checkedBagsPerPassenger) || 0;
  const knownWeight = numberField(baggage.checkedBagWeightKg);
  const missingCount = checkedIncluded < request.baggage.checkedBagsPerPassenger;
  const missingWeight = request.baggage.checkedBagsPerPassenger > 0
    && request.baggage.checkedBagWeightKg !== null
    && (knownWeight === null || knownWeight < request.baggage.checkedBagWeightKg);
  if (missingCount || missingWeight) {
    const fee = moneyToMinor(numberField(baggage.additionalCheckedBagFeeTotal));
    if (fee === null) return null;
    total += fee;
  }
  return total;
}

async function recalculatePersistedRankings(params: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  searchId: string;
  request: FlightSearchRequest;
}) {
  const [
    { data: itineraries, error: itineraryError },
    { data: offers, error: offerError },
    { data: jobs, error: jobsError },
  ] = await Promise.all([
    params.supabase
      .from("flight_itineraries")
      .select("id,total_duration_minutes,stop_count")
      .eq("search_id", params.searchId),
    params.supabase
      .from("flight_offers")
      .select("id,itinerary_id,source_id,report_id,total_price_minor,currency,price_completeness,conditional_prices,baggage,fare_rules,is_direct_airline,sponsored,available,expires_at")
      .eq("search_id", params.searchId)
      .eq("available", true),
    params.supabase
      .from("flight_search_jobs")
      .select("source_id,status,report_idempotency_key")
      .eq("search_id", params.searchId),
  ]);
  if (itineraryError || offerError || jobsError) throw new Error("ranking_read_failed");

  const committedReports = new Map((jobs || []).flatMap((job) => (
    job.status === "completed" && job.report_idempotency_key
      ? [[job.source_id, job.report_idempotency_key] as const]
      : []
  )));
  const now = Date.now();

  const rows = (itineraries || []).flatMap((itinerary) => {
    const eligibleOffers = (offers || []).flatMap((offer) => {
      if (offer.itinerary_id !== itinerary.id) return [];
      if (committedReports.get(offer.source_id) !== offer.report_id) return [];
      if (offer.expires_at && new Date(offer.expires_at).getTime() <= now) return [];
      const effectivePriceMinor = baggageAdjustedPriceMinor(offer, params.request);
      return effectivePriceMinor === null ? [] : [{ ...offer, effectivePriceMinor }];
    }).sort((left, right) => left.effectivePriceMinor - right.effectivePriceMinor);
    const bestOffer = eligibleOffers[0];
    return bestOffer ? [{ itinerary, bestOffer }] : [];
  });
  if (!rows.length) {
    await params.supabase.from("flight_itineraries").update({ ranking_tags: [], ranking_explanation: {} }).eq("search_id", params.searchId);
    return;
  }

  const minimumPrice = Math.min(...rows.map((row) => row.bestOffer.effectivePriceMinor));
  const minimumDuration = Math.min(...rows.map((row) => Number(row.itinerary.total_duration_minutes)));
  let bestValueId = "";
  let bestValueScore = Number.NEGATIVE_INFINITY;

  const scored = rows.map((row) => {
    const priceScore = minimumPrice / row.bestOffer.effectivePriceMinor;
    const durationScore = minimumDuration / Math.max(1, Number(row.itinerary.total_duration_minutes));
    const stopScore = 1 / (1 + Number(row.itinerary.stop_count));
    const rules = row.bestOffer.fare_rules && typeof row.bestOffer.fare_rules === "object" ? row.bestOffer.fare_rules : {};
    const flexibilityScore = (rules.refundable === true ? .5 : 0) + (rules.changeable === true ? .5 : 0);
    const directScore = row.bestOffer.is_direct_airline === true ? 1 : 0;
    const score = priceScore * .50 + durationScore * .20 + stopScore * .12 + flexibilityScore * .10 + directScore * .08;
    if (score > bestValueScore) {
      bestValueScore = score;
      bestValueId = row.itinerary.id;
    }
    return { ...row, score };
  });

  const cheapestId = scored.sort((left, right) => left.bestOffer.effectivePriceMinor - right.bestOffer.effectivePriceMinor)[0].itinerary.id;
  const fastestId = [...scored].sort((left, right) => Number(left.itinerary.total_duration_minutes) - Number(right.itinerary.total_duration_minutes))[0].itinerary.id;

  for (const row of scored) {
    const tags: string[] = [];
    if (row.itinerary.id === cheapestId) tags.push("cheapest");
    if (row.itinerary.id === fastestId) tags.push("fastest");
    if (row.itinerary.id === bestValueId) tags.push("best_value");
    const differenceMinor = row.bestOffer.effectivePriceMinor - minimumPrice;
    const reasons = [
      differenceMinor === 0
        ? "Bilinen zorunlu ücretlerle en düşük toplam fiyat."
        : `En düşük uygun fiyattan ${(differenceMinor / 100).toLocaleString("tr-TR")} ${params.request.currency} daha yüksek.`,
    ];
    const rules = row.bestOffer.fare_rules && typeof row.bestOffer.fare_rules === "object" ? row.bestOffer.fare_rules : {};
    if (rules.refundable === true) reasons.push("İade hakkı kaynak verisinde doğrulandı.");
    if (rules.changeable === true) reasons.push("Değişiklik hakkı kaynak verisinde doğrulandı.");
    if (row.bestOffer.is_direct_airline === true) reasons.push("Doğrudan havayolu satış kanalı.");
    const { error } = await params.supabase.from("flight_itineraries").update({
      ranking_tags: tags,
      ranking_explanation: {
        score: Math.round(row.score * 1000) / 10,
        offerId: row.bestOffer.id,
        reasons,
        sponsoredOffersExcluded: true,
      },
    }).eq("id", row.itinerary.id);
    if (error) throw new Error("ranking_write_failed");
  }
}

export async function POST(request: Request) {
  if (!authorizedFlightWorker(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const text = await request.text().catch(() => "");
  if (!text || text.length > 1_000_000) {
    return NextResponse.json({ error: text ? "Rapor çok büyük." : "Rapor gerekli." }, { status: text ? 413 : 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON raporu." }, { status: 400 });
  }

  const jobId = String(body.jobId || "");
  const reportId = String(body.reportId || "");
  const workerName = String(body.workerName || "").trim();
  const leaseToken = String(body.leaseToken || "");
  const outcome = String(body.outcome || "");
  const durationMs = Math.min(300_000, Math.max(0, Number(body.durationMs) || 0));
  if (!isUuid(jobId) || !isUuid(reportId) || !/^[A-Za-z0-9._-]{1,80}$/.test(workerName)
      || leaseToken.length < 32 || leaseToken.length > 256 || !OUTCOMES.has(outcome as never)) {
    return NextResponse.json({ error: "Rapor kimliği veya sonucu geçersiz." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });
  const { data: job, error: jobError } = await supabase
    .from("flight_search_jobs")
    .select("id,search_id,source_id,status,locked_by,locked_until,lease_token_hash,report_idempotency_key")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: "Görev okunamadı." }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Görev bulunamadı." }, { status: 404 });
  if (job.report_idempotency_key === reportId && ["completed", "no_results", "failed", "integration_required"].includes(job.status)) {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (job.status !== "running" || job.locked_by !== workerName || !job.lease_token_hash
      || !tokenHashMatches(leaseToken, job.lease_token_hash)
      || !job.locked_until || new Date(job.locked_until).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Görev lease'i geçersiz veya süresi dolmuş." }, { status: 409 });
  }

  const [{ data: search, error: searchError }, { data: source, error: sourceError }] = await Promise.all([
    supabase.from("flight_searches").select("id,criteria,status,expires_at").eq("id", job.search_id).maybeSingle(),
    supabase.from("flight_sources").select("id,name,cache_ttl_seconds").eq("id", job.source_id).maybeSingle(),
  ]);
  if (searchError || sourceError || !search || !source) {
    return NextResponse.json({ error: "Arama veya kaynak okunamadı." }, { status: 500 });
  }
  if (new Date(search.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Aramanın süresi dolmuş." }, { status: 410 });
  }
  const requestValidation = validateFlightSearchRequest(search.criteria);
  if (!requestValidation.ok) return NextResponse.json({ error: "Kayıtlı arama kriteri geçersiz." }, { status: 500 });

  const connector = createProductionFlightConnectors().find((item) => item.source.id === job.source_id);
  if (!connector) return NextResponse.json({ error: "Bu kaynak için connector kodu bulunamadı." }, { status: 409 });
  if (outcome === "success" && !flightSourceRuntimeReady(job.source_id)) {
    return NextResponse.json({ error: "Bu kaynak production teklif raporu için etkin değil." }, { status: 409 });
  }

  const receivedAt = new Date().toISOString();
  const renewedUntil = new Date(Date.now() + 90_000).toISOString();
  const { data: renewedLease, error: renewError } = await supabase
    .from("flight_search_jobs")
    .update({ locked_until: renewedUntil })
    .eq("id", job.id)
    .eq("status", "running")
    .eq("locked_by", workerName)
    .eq("lease_token_hash", job.lease_token_hash)
    .gt("locked_until", receivedAt)
    .select("id")
    .maybeSingle();
  if (renewError) return NextResponse.json({ error: "Görev lease'i yenilenemedi." }, { status: 503 });
  if (!renewedLease) return NextResponse.json({ error: "Görev lease'i artık geçerli değil." }, { status: 409 });
  const rawOffers = Array.isArray(body.offers) ? body.offers.slice(0, 200) as SourceFlightOffer[] : [];
  const acceptedOffers: NormalizedFlightOffer[] = [];
  const contradictoryOutcome = outcome !== "success" && rawOffers.length > 0;
  let rejectedOfferCount = contradictoryOutcome ? rawOffers.length : 0;
  const sourceFreshnessMs = Math.min(
    10 * 60_000,
    Math.max(30_000, Number(source.cache_ttl_seconds || 600) * 1_000),
  );
  if (outcome === "success" && !contradictoryOutcome) {
    for (const rawOffer of rawOffers) {
      const observedAt = Date.parse(String(rawOffer?.observedAt || ""));
      const expiresAt = Date.parse(String(rawOffer?.expiresAt || ""));
      const receivedAtMs = Date.parse(receivedAt);
      if (!Number.isFinite(observedAt)
          || !Number.isFinite(expiresAt)
          || observedAt > receivedAtMs + 120_000
          || observedAt < receivedAtMs - sourceFreshnessMs
          || expiresAt <= receivedAtMs
          || expiresAt > observedAt + sourceFreshnessMs + 120_000) {
        rejectedOfferCount += 1;
        continue;
      }
      const normalized = normalizeSourceOffer(rawOffer, connector.source, requestValidation.value);
      if (normalized.ok) acceptedOffers.push(normalized.offer);
      else rejectedOfferCount += 1;
    }
  }

  let persistence = { itineraryCount: 0, offerCount: 0 };
  try {
    if (acceptedOffers.length) {
      persistence = await persistOffers({
        supabase,
        searchId: search.id,
        sourceId: source.id,
        reportId,
        receivedAt,
        offers: acceptedOffers,
      });
    }
  } catch {
    return NextResponse.json({ error: "Normalize uçuş teklifleri kaydedilemedi; görev yeniden denenebilir." }, { status: 503 });
  }

  const finalOutcome = contradictoryOutcome
    ? "failed"
    : outcome === "success" && acceptedOffers.length === 0 && rejectedOfferCount === 0
      ? "no_results"
      : outcome === "success" && acceptedOffers.length === 0
        ? "failed"
        : outcome;
  const jobStatus = terminalJobStatus(finalOutcome, acceptedOffers.length);
  const errorCode = rejectedOfferCount > 0
    ? "format_changed"
    : ERROR_CODES.has(String(body.errorCode || ""))
      ? String(body.errorCode)
      : finalOutcome === "integration_required"
        ? "integration_required"
        : finalOutcome === "temporarily_unavailable"
          ? "temporarily_unavailable"
          : finalOutcome === "failed"
            ? "unknown"
            : null;
  const message = (
    jobStatus === "completed" && rejectedOfferCount > 0
      ? `${persistence.offerCount} teklif doğrulandı; ${rejectedOfferCount} geçersiz teklif reddedildi.`
      : jobStatus === "completed" ? `${persistence.offerCount} teklif doğrulandı.`
      : jobStatus === "no_results" ? "Bu kaynakta uygun uçuş bulunamadı."
        : jobStatus === "integration_required" ? "Resmî partner erişimi gerekli."
          : rejectedOfferCount ? "Kaynak verisi güvenli modele doğrulanamadı."
            : finalOutcome === "temporarily_unavailable" ? "Kaynak geçici olarak kullanılamıyor."
              : "Kaynak araması başarısız."
  );
  const now = new Date().toISOString();
  const { data: finalizedJob, error: updateJobError } = await supabase
    .from("flight_search_jobs")
    .update({
      status: jobStatus,
      result_count: persistence.offerCount,
      response_time_ms: durationMs,
      error_code: errorCode,
      error_message: message,
      report_idempotency_key: reportId,
      completed_at: now,
      locked_by: null,
      locked_until: null,
      lease_token_hash: null,
    })
    .eq("id", job.id)
    .eq("status", "running")
    .eq("locked_by", workerName)
    .eq("lease_token_hash", job.lease_token_hash)
    .gt("locked_until", now)
    .select("id")
    .maybeSingle();
  if (updateJobError) return NextResponse.json({ error: "Görev sonucu tamamlanamadı." }, { status: 500 });
  if (!finalizedJob) {
    return NextResponse.json({ error: "Görev lease'i değişti; bu rapor yayınlanmadı." }, { status: 409 });
  }

  if (jobStatus === "completed") {
    await supabase.from("flight_sources").update({
      last_success_at: now,
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
      average_response_ms: durationMs,
    }).eq("id", source.id);
  } else if (!["no_results"].includes(jobStatus)) {
    await supabase.from("flight_sources").update({
      last_error_at: now,
      last_error_code: errorCode,
      last_error_message: message,
    }).eq("id", source.id);
  }

  const { data: jobs } = await supabase
    .from("flight_search_jobs")
    .select("status,result_count,error_code")
    .eq("search_id", search.id);
  const rows = jobs || [];
  const terminal = rows.filter((row) => ["completed", "no_results", "failed", "integration_required", "dead_letter"].includes(row.status));
  const successful = rows.filter((row) => ["completed", "no_results"].includes(row.status));
  const failed = rows.filter((row) => ["failed", "integration_required", "dead_letter"].includes(row.status));
  const partialIssues = rows.filter((row) => row.error_code === "format_changed");
  const allFinished = rows.length > 0 && terminal.length === rows.length;
  const nextSearchStatus = allFinished
    ? successful.length > 0 && (failed.length > 0 || partialIssues.length > 0) ? "partial" : successful.length > 0 ? "completed" : "failed"
    : "searching";
  let rankingUpdated: boolean | null = null;
  if (allFinished) {
    try {
      await recalculatePersistedRankings({
        supabase,
        searchId: search.id,
        request: requestValidation.value,
      });
      rankingUpdated = true;
    } catch {
      rankingUpdated = false;
      await supabase.from("flight_itineraries").update({
        ranking_tags: [],
        ranking_explanation: { pending: true },
      }).eq("search_id", search.id);
    }
  }
  const { count: itineraryCount } = await supabase
    .from("flight_itineraries")
    .select("id", { count: "exact", head: true })
    .eq("search_id", search.id);
  let searchUpdate = supabase.from("flight_searches").update({
    status: nextSearchStatus,
    completed_source_count: successful.length,
    failed_source_count: failed.length,
    itinerary_count: itineraryCount || 0,
    completed_at: allFinished ? now : null,
  }).eq("id", search.id);
  if (!allFinished) searchUpdate = searchUpdate.in("status", ["queued", "searching"]);
  const { error: searchUpdateError } = await searchUpdate;

  return NextResponse.json({
    ok: true,
    data: {
      jobId: job.id,
      status: jobStatus,
      acceptedOfferCount: acceptedOffers.length,
      rejectedOfferCount,
      itineraryCount: persistence.itineraryCount,
      rankingUpdated,
      searchReconciled: !searchUpdateError,
    },
  });
}
