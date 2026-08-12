import { NextResponse } from "next/server";
import { authorizeFlightSearch } from "@/lib/flights/server/search-access";
import {
  flightSourceRuntimeReady,
  flightSourceVisibleInComparison,
} from "@/lib/flights/server/source-domains";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

function priceFromMinor(value: unknown) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount / 100 : null;
}

function numericField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function comparablePrice(offer: Record<string, any>, criteria: Record<string, unknown>) {
  const reasons: string[] = [];
  const requestedCurrency = String(criteria.currency || "TRY");
  const requestedBaggage = criteria.baggage && typeof criteria.baggage === "object"
    ? criteria.baggage as Record<string, unknown>
    : {};
  const baggage = offer.baggage && typeof offer.baggage === "object"
    ? offer.baggage as Record<string, unknown>
    : {};
  let totalMinor = Number(offer.total_price_minor);
  const verifiedAt = typeof offer.verified_at === "string" ? Date.parse(offer.verified_at) : Number.NaN;
  const expiresAt = typeof offer.expires_at === "string" ? Date.parse(offer.expires_at) : Number.NaN;
  const now = Date.now();

  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) reasons.push("invalid_total");
  if (!Number.isFinite(verifiedAt) || verifiedAt > now + 120_000 || now - verifiedAt > 10 * 60 * 1000
      || !Number.isFinite(expiresAt) || expiresAt <= now) {
    reasons.push("stale_price");
  }
  if (offer.currency !== requestedCurrency) reasons.push("currency_mismatch");
  if (offer.price_completeness !== "complete") reasons.push("mandatory_fees_unknown");
  if (offer.is_conditional_price === true) reasons.push("conditional_price");
  if (offer.sponsored === true) reasons.push("sponsored_excluded");

  const cabinRequested = Number(requestedBaggage.cabinBagsPerPassenger) || 0;
  const cabinIncluded = Number(baggage.cabinBagsPerPassenger) || 0;
  if (cabinIncluded < cabinRequested) {
    const fee = numericField(baggage.additionalCabinBagFeeTotal);
    if (fee === null) reasons.push("cabin_baggage_price_unknown");
    else totalMinor += Math.round(fee * 100);
  }

  const checkedRequested = Number(requestedBaggage.checkedBagsPerPassenger) || 0;
  const checkedIncluded = Number(baggage.checkedBagsPerPassenger) || 0;
  const requestedWeight = numericField(requestedBaggage.checkedBagWeightKg);
  const includedWeight = numericField(baggage.checkedBagWeightKg);
  const checkedMissing = checkedIncluded < checkedRequested
    || (checkedRequested > 0 && requestedWeight !== null && (includedWeight === null || includedWeight < requestedWeight));
  if (checkedMissing) {
    const fee = numericField(baggage.additionalCheckedBagFeeTotal);
    if (fee === null) reasons.push("checked_baggage_price_unknown");
    else totalMinor += Math.round(fee * 100);
  }

  return {
    rankingEligible: reasons.length === 0,
    effectiveTotalPrice: reasons.length === 0 ? priceFromMinor(totalMinor) : null,
    eligibilityReasons: reasons,
  };
}

const TERMINAL_JOB_STATES = new Set(["completed", "no_results", "failed", "integration_required", "dead_letter"]);

function publicJobMessage(job: Record<string, unknown>) {
  const status = String(job.status || "");
  const errorCode = String(job.error_code || "");
  if (status === "queued") return "Arama kuyruğunda.";
  if (status === "running") return "Kaynak kontrol ediliyor.";
  if (status === "completed" && errorCode === "format_changed") return "Geçerli teklifler gösterildi; bazı kaynak kayıtları reddedildi.";
  if (status === "completed") return "Kaynak başarıyla cevap verdi.";
  if (status === "no_results") return "Bu kaynakta uygun uçuş bulunamadı.";
  if (status === "integration_required") return "Resmî partner erişimi gerekli.";
  if (errorCode === "timeout") return "Kaynak belirlenen sürede yanıt vermedi.";
  if (errorCode === "quota_exceeded") return "Kaynak sorgu kotasına ulaştı.";
  if (errorCode === "format_changed") return "Kaynak verisi güvenli modele doğrulanamadı.";
  return "Kaynak geçici olarak yanıt vermedi.";
}

export async function GET(request: Request, context: { params: Promise<{ searchId: string }> }) {
  const { searchId } = await context.params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Uçuş arama altyapısı yapılandırılmamış." }, { status: 503, headers: PRIVATE_HEADERS });

  const access = await authorizeFlightSearch({ request, supabase, searchId });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: PRIVATE_HEADERS });
  const search = access.search;

  const [jobsResult, itinerariesResult, offersResult, sourcesResult] = await Promise.all([
    supabase
      .from("flight_search_jobs")
      .select("id,source_id,status,result_count,response_time_ms,error_code,report_idempotency_key,created_at,started_at,completed_at")
      .eq("search_id", search.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("flight_itineraries")
      .select("id,itinerary_key,total_duration_minutes,stop_count,marketing_airlines,operating_airlines,transfer_airports,has_airport_change,has_self_transfer,has_overnight_layover,ranking_tags,ranking_explanation")
      .eq("search_id", search.id)
      .order("total_duration_minutes", { ascending: true }),
    supabase
      .from("flight_offers")
      .select("id,itinerary_id,source_id,report_id,fare_family,total_price_minor,per_person_price_minor,currency,original_price_minor,original_currency,taxes_minor,mandatory_fees_minor,price_completeness,is_conditional_price,condition_summary,conditional_prices,baggage,fare_rules,installment_options,benefits,is_direct_airline,sponsored,available,observed_at,received_at,verified_at,expires_at")
      .eq("search_id", search.id)
      .eq("available", true)
      .order("total_price_minor", { ascending: true }),
    supabase
      .from("flight_sources")
      .select("id,name,source_type,integration_status,permission_status,enabled")
      .order("name", { ascending: true }),
  ]);

  if (jobsResult.error || itinerariesResult.error || offersResult.error || sourcesResult.error) {
    return NextResponse.json({ error: "Uçuş sonuçları okunamadı." }, { status: 500, headers: PRIVATE_HEADERS });
  }

  const itineraryIds = (itinerariesResult.data || []).map((item) => item.id);
  let segmentRows: Array<Record<string, unknown>> = [];
  if (itineraryIds.length) {
    const { data, error } = await supabase
      .from("flight_segments")
      .select("id,itinerary_id,segment_order,leg_index,marketing_airline,marketing_flight_number,operating_airline,origin_code,destination_code,departure_at,arrival_at,departure_local,arrival_local,departure_terminal,arrival_terminal,cabin_class,aircraft,self_transfer")
      .in("itinerary_id", itineraryIds)
      .order("segment_order", { ascending: true });
    if (error) return NextResponse.json({ error: "Uçuş segmentleri okunamadı." }, { status: 500, headers: PRIVATE_HEADERS });
    segmentRows = (data || []) as Array<Record<string, unknown>>;
  }
  const sourceById = new Map((sourcesResult.data || []).map((source) => [source.id, source]));
  const committedReportBySource = new Map((jobsResult.data || []).flatMap((job) => (
    job.status === "completed" && job.report_idempotency_key
      ? [[job.source_id, job.report_idempotency_key] as const]
      : []
  )));
  const offersByItinerary = new Map<string, Array<Record<string, unknown>>>();
  for (const offer of offersResult.data || []) {
    if (committedReportBySource.get(offer.source_id) !== offer.report_id) continue;
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) continue;
    const list = offersByItinerary.get(offer.itinerary_id) || [];
    const source = sourceById.get(offer.source_id);
    list.push({
      id: offer.id,
      sourceId: offer.source_id,
      sourceName: source?.name || offer.source_id,
      sourceType: source?.source_type || "ota",
      fareFamily: offer.fare_family,
      totalPrice: priceFromMinor(offer.total_price_minor),
      perPersonPrice: priceFromMinor(offer.per_person_price_minor),
      currency: offer.currency,
      originalPrice: priceFromMinor(offer.original_price_minor),
      originalCurrency: offer.original_currency,
      taxes: priceFromMinor(offer.taxes_minor),
      mandatoryFees: priceFromMinor(offer.mandatory_fees_minor),
      priceCompleteness: offer.price_completeness,
      conditional: offer.is_conditional_price,
      conditionSummary: offer.condition_summary,
      conditionalPrices: offer.conditional_prices,
      baggage: offer.baggage,
      fareRules: offer.fare_rules,
      installmentOptions: offer.installment_options,
      benefits: offer.benefits,
      directAirlineSale: offer.is_direct_airline,
      sponsored: offer.sponsored,
      ...comparablePrice(offer as Record<string, any>, search.criteria),
      observedAt: offer.observed_at,
      receivedAt: offer.received_at,
      verifiedAt: offer.verified_at,
      expiresAt: offer.expires_at,
    });
    offersByItinerary.set(offer.itinerary_id, list);
  }

  for (const offers of offersByItinerary.values()) {
    offers.sort((left, right) => {
      const leftEffective = typeof left.effectiveTotalPrice === "number" ? left.effectiveTotalPrice : Number.POSITIVE_INFINITY;
      const rightEffective = typeof right.effectiveTotalPrice === "number" ? right.effectiveTotalPrice : Number.POSITIVE_INFINITY;
      return leftEffective - rightEffective || Number(left.totalPrice) - Number(right.totalPrice);
    });
  }

  const itineraries = (itinerariesResult.data || []).filter((itinerary) => (
    (offersByItinerary.get(itinerary.id) || []).length > 0
  )).map((itinerary) => ({
    id: itinerary.id,
    totalDurationMinutes: itinerary.total_duration_minutes,
    stopCount: itinerary.stop_count,
    marketingAirlines: itinerary.marketing_airlines,
    operatingAirlines: itinerary.operating_airlines,
    transferAirports: itinerary.transfer_airports,
    hasAirportChange: itinerary.has_airport_change,
    hasSelfTransfer: itinerary.has_self_transfer,
    hasOvernightLayover: itinerary.has_overnight_layover,
    labels: itinerary.ranking_tags,
    rankingExplanation: itinerary.ranking_explanation,
    segments: segmentRows.filter((segment) => segment.itinerary_id === itinerary.id).map((segment) => ({
      id: segment.id,
      order: segment.segment_order,
      legIndex: segment.leg_index,
      marketingAirline: segment.marketing_airline,
      flightNumber: segment.marketing_flight_number,
      operatingAirline: segment.operating_airline,
      origin: segment.origin_code,
      destination: segment.destination_code,
      departureAt: segment.departure_at,
      arrivalAt: segment.arrival_at,
      departureLocal: segment.departure_local,
      arrivalLocal: segment.arrival_local,
      departureTerminal: segment.departure_terminal,
      arrivalTerminal: segment.arrival_terminal,
      cabinClass: segment.cabin_class,
      aircraft: segment.aircraft,
      selfTransfer: segment.self_transfer,
    })),
    offers: offersByItinerary.get(itinerary.id) || [],
  }));

  const comparableItineraries = itineraries.flatMap((itinerary) => {
    const offer = itinerary.offers.find((candidate) => candidate.rankingEligible === true);
    return offer && typeof offer.effectiveTotalPrice === "number" ? [{ itinerary, offer }] : [];
  });
  const minimumPrice = comparableItineraries.length
    ? Math.min(...comparableItineraries.map((item) => Number(item.offer.effectiveTotalPrice)))
    : null;
  const minimumDuration = comparableItineraries.length
    ? Math.min(...comparableItineraries.map((item) => Number(item.itinerary.totalDurationMinutes)))
    : null;
  for (const itinerary of itineraries) {
    const eligibleOffers = itinerary.offers.filter((offer) => offer.rankingEligible === true);
    const currentRankingOffer = eligibleOffers.some((offer) => offer.id === itinerary.rankingExplanation?.offerId);
    const labels = Array.isArray(itinerary.labels)
      ? itinerary.labels.filter((label) => label !== "cheapest" && label !== "fastest" && (label !== "best_value" || currentRankingOffer))
      : [];
    if (minimumPrice !== null && eligibleOffers.some((offer) => offer.effectiveTotalPrice === minimumPrice)) labels.push("cheapest");
    if (minimumDuration !== null && eligibleOffers.length && itinerary.totalDurationMinutes === minimumDuration) labels.push("fastest");
    itinerary.labels = [...new Set(labels)];
    if (!currentRankingOffer) itinerary.rankingExplanation = {};
  }

  const visibleOfferCount = itineraries.reduce((total, itinerary) => total + itinerary.offers.length, 0);

  const jobBySource = new Map((jobsResult.data || []).map((job) => [job.source_id, job]));
  const excludedSources = Array.isArray(search.criteria.excludedSources)
    ? search.criteria.excludedSources.map(String)
    : [];
  const statusSources = (sourcesResult.data || []).filter((source) => (
    jobBySource.has(source.id)
    || flightSourceVisibleInComparison(source.id)
    || (jobsResult.data?.length === 0 && source.enabled === true)
  ));
  const sourceStatuses = statusSources.map((source) => {
    const job = jobBySource.get(source.id);
    if (!job) {
      const excluded = excludedSources.includes(source.id);
      const runtimeReady = source.enabled === true
        && source.integration_status === "active"
        && ["approved", "public_documented"].includes(source.permission_status)
        && flightSourceRuntimeReady(source.id);
      const accessPending = source.integration_status === "partner_access_required"
        || source.integration_status === "credentials_required";
      return {
        sourceId: source.id,
        sourceName: source.name,
        state: excluded
          ? "skipped"
          : accessPending ? "integration_required" : runtimeReady ? "skipped" : source.enabled ? "integration_required" : "disabled",
        message: excluded
          ? "Bu kaynak kullanıcı tercihiyle aramadan çıkarıldı."
          : source.integration_status === "partner_access_required"
          ? "Partnerlik başvurusu ve resmî API erişimi gerekli."
          : source.integration_status === "credentials_required"
          ? "Resmî API erişim bilgileri gerekli."
          : runtimeReady ? "Bu arama için kaynak görevi oluşturulmadı." : source.enabled ? "Entegrasyon tamamlanmadı." : "Kaynak geçici olarak pasif.",
      };
    }
    return {
      sourceId: source.id,
      sourceName: source.name,
      state: job.status,
      offerCount: job.result_count,
      responseTimeMs: job.response_time_ms,
      errorCode: job.error_code,
      message: publicJobMessage(job as Record<string, unknown>),
      startedAt: job.started_at,
      completedAt: job.completed_at,
    };
  });

  return NextResponse.json({
    data: {
      id: search.id,
      status: search.status,
      isComplete: jobsResult.data?.length
        ? jobsResult.data.every((job) => TERMINAL_JOB_STATES.has(job.status))
        : ["no_sources", "failed", "expired"].includes(search.status),
      criteria: search.criteria,
      sourceStatuses,
      itineraries,
      summary: {
        itineraryCount: itineraries.length,
        offerCount: visibleOfferCount,
        freshOfferCount: itineraries.reduce((total, itinerary) => total + itinerary.offers.filter((offer) => (
          Array.isArray(offer.eligibilityReasons) && !offer.eligibilityReasons.includes("stale_price")
        )).length, 0),
        comparableOfferCount: itineraries.reduce((total, itinerary) => total + itinerary.offers.filter((offer) => (
          offer.rankingEligible === true
        )).length, 0),
        sourceCount: jobsResult.data?.length || 0,
        completedSourceCount: (jobsResult.data || []).filter((job) => ["completed", "no_results"].includes(job.status)).length,
        failedSourceCount: (jobsResult.data || []).filter((job) => ["failed", "integration_required", "dead_letter"].includes(job.status)).length,
      },
    },
  }, { headers: PRIVATE_HEADERS });
}
