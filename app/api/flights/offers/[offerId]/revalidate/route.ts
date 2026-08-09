import { NextResponse } from "next/server";
import { authorizeFlightSearch } from "@/lib/flights/server/search-access";
import { flightSourceRuntimeReady, safeFlightCheckoutUrl } from "@/lib/flights/server/source-domains";
import { isUuid } from "@/lib/flights/server/tokens";
import {
  allocateEnuygunMcpInSession,
  closeEnuygunMcpSession,
  EnuygunMcpClientError,
  type EnuygunMcpSession,
  livePriceForEnuygunOffer,
  searchEnuygunMcpSession,
} from "@/lib/flights/connectors/enuygun/mcp-client";
import { validateFlightSearchRequest } from "@/lib/flights/core";
import { consumeFlightSearchRateLimit } from "@/lib/flights/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

function moneyToMinor(value: number) {
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function rpcCommitted(data: unknown) {
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row && typeof row === "object" && (row as { committed?: unknown }).committed === true);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const rows = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, row]) => `${JSON.stringify(key)}:${canonicalJson(row)}`);
    return `{${rows.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function publicConnectorError(error: unknown) {
  if (error instanceof EnuygunMcpClientError) {
    if (error.code === "quota_exceeded") return "Kaynak kısa süreli sorgu kotasına ulaştı.";
    if (error.code === "authorization_failed") return "Kaynak erişimi doğrulanamadı.";
    if (error.code === "format_changed") return "Kaynağın fiyat yanıtı güvenli biçimde doğrulanamadı.";
  }
  return "Fiyat şu anda yeniden doğrulanamadı. Lütfen kısa süre sonra tekrar dene.";
}

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await context.params;
  if (!isUuid(offerId)) {
    return NextResponse.json({ error: "Teklif kimliği geçersiz." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const bodyText = await request.text().catch(() => "");
  if (!bodyText || bodyText.length > 4_000) {
    return NextResponse.json({ error: bodyText ? "İstek çok büyük." : "Arama kimliği gerekli." }, {
      status: bodyText ? 413 : 400,
      headers: PRIVATE_HEADERS,
    });
  }
  let body: { searchId?: unknown };
  try {
    body = JSON.parse(bodyText) as { searchId?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON isteği." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const searchId = String(body.searchId || "");
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Uçuş altyapısı yapılandırılmamış." }, { status: 503, headers: PRIVATE_HEADERS });
  }

  const access = await authorizeFlightSearch({ request, supabase, searchId });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status, headers: PRIVATE_HEADERS });
  }

  const { data: offer, error: offerError } = await supabase
    .from("flight_offers")
    .select("id,search_id,itinerary_id,source_id,source_offer_ref,report_id,total_price_minor,per_person_price_minor,currency,baggage,fare_family,available,verified_at")
    .eq("id", offerId)
    .eq("search_id", searchId)
    .maybeSingle();
  if (offerError) {
    return NextResponse.json({ error: "Teklif doğrulama verisi okunamadı." }, { status: 500, headers: PRIVATE_HEADERS });
  }
  if (!offer) {
    return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404, headers: PRIVATE_HEADERS });
  }
  const { data: source, error: sourceError } = await supabase
    .from("flight_sources")
    .select("id,name,enabled,integration_status,permission_status,supports_revalidation,request_limit_per_minute")
    .eq("id", offer.source_id)
    .maybeSingle();
  if (sourceError) {
    return NextResponse.json({ error: "Uçuş kaynağı okunamadı." }, { status: 500, headers: PRIVATE_HEADERS });
  }

  const { data: committedJob } = await supabase
    .from("flight_search_jobs")
    .select("report_idempotency_key,status")
    .eq("search_id", searchId)
    .eq("source_id", offer.source_id)
    .maybeSingle();
  if (!committedJob || committedJob.status !== "completed" || committedJob.report_idempotency_key !== offer.report_id) {
    return NextResponse.json({ error: "Teklif raporu tamamlanmadı." }, { status: 409, headers: PRIVATE_HEADERS });
  }

  const approved = source?.permission_status === "approved" || source?.permission_status === "public_documented";
  if (offer.source_id !== "enuygun" || !source || source.enabled !== true
      || source.integration_status !== "active" || !approved
      || source.supports_revalidation !== true || !flightSourceRuntimeReady(offer.source_id)) {
    await supabase.from("flight_offer_revalidations").insert({
      offer_id: offer.id,
      status: "unsupported",
      previous_price_minor: offer.total_price_minor,
      current_price_minor: offer.total_price_minor,
      currency: offer.currency,
      error_code: "connector_not_ready",
    });
    return NextResponse.json({
      error: "Bu kaynağın gerçek zamanlı fiyat doğrulaması henüz etkin değil.",
      code: "REVALIDATION_NOT_AVAILABLE",
      sourceName: source?.name || offer.source_id,
    }, { status: 409, headers: PRIVATE_HEADERS });
  }

  const requestValidation = validateFlightSearchRequest(access.search.criteria);
  if (!requestValidation.ok) {
    return NextResponse.json({ error: "Kayıtlı arama kriteri geçersiz." }, { status: 500, headers: PRIVATE_HEADERS });
  }

  const [actorQuota, offerQuota, sourceQuota] = await Promise.all([
    consumeFlightSearchRateLimit({
      request,
      supabase,
      userId: access.user?.id || null,
      scope: "offer-revalidate-actor",
      limit: 8,
      windowSeconds: 60,
    }),
    consumeFlightSearchRateLimit({
      request,
      supabase,
      scope: "offer-revalidate-singleflight",
      identityKey: `offer:${offer.id}`,
      limit: 1,
      windowSeconds: 60,
    }),
    consumeFlightSearchRateLimit({
      request,
      supabase,
      scope: "source-mcp",
      identityKey: `source:${offer.source_id}`,
      limit: Math.min(100, Math.max(1, Number(source.request_limit_per_minute) || 60)),
      windowSeconds: 60,
    }),
  ]);
  if (!actorQuota.ok || !offerQuota.ok || !sourceQuota.ok) {
    return NextResponse.json({ error: "Fiyat doğrulama kotası yapılandırılmamış." }, {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  }
  if (!actorQuota.allowed || !offerQuota.allowed || !sourceQuota.allowed) {
    return NextResponse.json({ error: "Fiyat kısa süre önce kontrol edildi veya kaynak yoğun. Lütfen bir dakika sonra tekrar dene." }, {
      status: 429,
      headers: { ...PRIVATE_HEADERS, "Retry-After": "60" },
    });
  }

  let activeMcpSession: EnuygunMcpSession | null = null;
  try {
    const liveSearch = await searchEnuygunMcpSession(requestValidation.value, AbortSignal.timeout(25_000));
    activeMcpSession = liveSearch.session;
    const live = livePriceForEnuygunOffer(liveSearch.data, offer.source_offer_ref, requestValidation.value);
    if (!live.available || live.total === null || !live.currency) {
      const { data: commitData, error: commitError } = await supabase.rpc("commit_flight_offer_revalidation", {
        p_offer_id: offer.id,
        p_expected_verified_at: offer.verified_at || null,
        p_status: "unavailable",
        p_previous_price_minor: offer.total_price_minor,
        p_current_price_minor: null,
        p_per_person_price_minor: null,
        p_currency: offer.currency,
        p_baggage: {},
        p_fare_family: "",
        p_checkout_url: null,
        p_checked_at: live.observedAt,
        p_expires_at: live.expiresAt,
      });
      if (commitError) {
        return NextResponse.json({ error: "Teklif durumu güvenli biçimde güncellenemedi." }, { status: 503, headers: PRIVATE_HEADERS });
      }
      if (!rpcCommitted(commitData)) {
        return NextResponse.json({ error: "Teklif başka bir istek tarafından yenilendi; sonucu tekrar aç." }, {
          status: 409,
          headers: PRIVATE_HEADERS,
        });
      }
      return NextResponse.json({
        data: {
          status: "unavailable",
          offerId: offer.id,
          totalPrice: null,
          perPersonPrice: null,
          effectiveTotalPrice: null,
          currency: offer.currency,
          baggage: null,
          fareFamily: null,
          benefits: [],
          priceChanged: false,
          termsChanged: false,
          verifiedAt: live.observedAt,
          expiresAt: live.expiresAt,
          message: "Seçtiğin teklif artık kaynakta bulunmuyor. Sonuçları yenileyip başka bir teklif seç.",
        },
      }, { headers: PRIVATE_HEADERS });
    }

    const currentMinor = moneyToMinor(live.total);
    if (currentMinor === null || live.currency !== offer.currency || !live.baggage) {
      throw new EnuygunMcpClientError("Yenilenen fiyatın para birimi doğrulanamadı.", "format_changed");
    }
    let candidateUrl: string;
    try {
      candidateUrl = await allocateEnuygunMcpInSession(
        offer.source_offer_ref,
        liveSearch.session,
        AbortSignal.timeout(20_000),
      );
    } finally {
      // allocate owns and closes the stateful MCP session on every outcome.
      activeMcpSession = null;
    }
    const checkoutUrl = safeFlightCheckoutUrl(offer.source_id, candidateUrl);
    if (!checkoutUrl) {
      throw new EnuygunMcpClientError("Satıcı yönlendirme bağlantısı allowlist ile eşleşmedi.", "format_changed");
    }
    const passengerCount = requestValidation.value.passengers.adults
      + requestValidation.value.passengers.children
      + requestValidation.value.passengers.infants;
    const priceChanged = currentMinor !== Number(offer.total_price_minor);
    const termsChanged = canonicalJson(offer.baggage || {}) !== canonicalJson(live.baggage)
      || String(offer.fare_family || "") !== String(live.fareFamily || "");
    const changed = priceChanged || termsChanged;
    const perPersonMinor = Math.max(1, Math.round(currentMinor / Math.max(1, passengerCount)));
    const { data: commitData, error: commitError } = await supabase.rpc("commit_flight_offer_revalidation", {
      p_offer_id: offer.id,
      p_expected_verified_at: offer.verified_at || null,
      p_status: changed ? "price_changed" : "available",
      p_previous_price_minor: offer.total_price_minor,
      p_current_price_minor: currentMinor,
      p_per_person_price_minor: perPersonMinor,
      p_currency: live.currency,
      p_baggage: live.baggage,
      p_fare_family: live.fareFamily || "",
      p_checkout_url: checkoutUrl,
      p_checked_at: live.observedAt,
      p_expires_at: live.expiresAt,
    });
    if (commitError) {
      return NextResponse.json({ error: "Fiyat ve doğrulama kaydı güvenli biçimde yazılamadı." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    if (!rpcCommitted(commitData)) {
      return NextResponse.json({ error: "Teklif başka bir istek tarafından yenilendi; sonucu tekrar aç." }, {
        status: 409,
        headers: PRIVATE_HEADERS,
      });
    }

    return NextResponse.json({
      data: {
        status: changed ? "price_changed" : "confirmed",
        offerId: offer.id,
        totalPrice: live.total,
        perPersonPrice: perPersonMinor / 100,
        effectiveTotalPrice: null,
        currency: live.currency,
        baggage: live.baggage,
        fareFamily: live.fareFamily,
        benefits: [],
        priceChanged,
        termsChanged,
        verifiedAt: live.observedAt,
        expiresAt: live.expiresAt,
        message: priceChanged && termsChanged
          ? "Kaynak toplamı ve bilet koşulları değişti. Güncel teklifi kontrol edip devam etmek için tekrar dokun."
          : priceChanged
            ? "Kaynak toplamı değişti. Yeni tutarı kontrol edip devam etmek için tekrar dokun."
            : termsChanged
              ? "Bagaj veya tarife paketi değişti. Güncel koşulları kontrol edip devam etmek için tekrar dokun."
              : "Kaynak toplamı doğrulandı; zorunlu ücret kapsamını satıcı sayfasında son kez kontrol et.",
      },
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    await supabase.from("flight_offer_revalidations").insert({
      offer_id: offer.id,
      status: "failed",
      previous_price_minor: offer.total_price_minor,
      current_price_minor: null,
      currency: offer.currency,
      error_code: error instanceof EnuygunMcpClientError ? error.code : "unknown",
    });
    return NextResponse.json({ error: publicConnectorError(error), code: "REVALIDATION_FAILED" }, {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  } finally {
    await closeEnuygunMcpSession(activeMcpSession);
  }
}
