import { NextResponse } from "next/server";
import { authorizeFlightSearch } from "@/lib/flights/server/search-access";
import { flightSourceRuntimeReady, safeFlightCheckoutUrl } from "@/lib/flights/server/source-domains";
import { isUuid } from "@/lib/flights/server/tokens";
import { consumeFlightSearchRateLimit } from "@/lib/flights/server/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

type RedirectRequestBody = {
  searchId?: unknown;
  expectedOfferId?: unknown;
  expectedTotalPrice?: unknown;
  expectedCurrency?: unknown;
  expectedVerifiedAt?: unknown;
};

function moneyToMinor(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await context.params;
  if (!isUuid(offerId)) return NextResponse.json({ error: "Teklif kimliği geçersiz." }, { status: 400, headers: PRIVATE_HEADERS });
  const bodyText = await request.text().catch(() => "");
  if (!bodyText || bodyText.length > 4_000) {
    return NextResponse.json({ error: bodyText ? "İstek çok büyük." : "Arama kimliği gerekli." }, {
      status: bodyText ? 413 : 400,
      headers: PRIVATE_HEADERS,
    });
  }
  let body: RedirectRequestBody;
  try {
    body = JSON.parse(bodyText) as RedirectRequestBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON isteği." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || body.expectedOfferId !== offerId
      || moneyToMinor(body.expectedTotalPrice) === null
      || typeof body.expectedCurrency !== "string"
      || !/^[A-Z]{3}$/.test(body.expectedCurrency)
      || typeof body.expectedVerifiedAt !== "string"
      || !Number.isFinite(Date.parse(body.expectedVerifiedAt))) {
    return NextResponse.json({ error: "Onaylanan teklif sürümü geçersiz." }, { status: 400, headers: PRIVATE_HEADERS });
  }
  const searchId = String(body.searchId || "");
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Uçuş altyapısı yapılandırılmamış." }, { status: 503, headers: PRIVATE_HEADERS });

  const access = await authorizeFlightSearch({ request, supabase, searchId });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: PRIVATE_HEADERS });
  const { data: offer, error } = await supabase
    .from("flight_offers")
    .select("id,search_id,source_id,report_id,total_price_minor,currency,checkout_url,available,verified_at,expires_at")
    .eq("id", offerId)
    .eq("search_id", searchId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Teklif okunamadı." }, { status: 500, headers: PRIVATE_HEADERS });
  if (!offer || !offer.available) return NextResponse.json({ error: "Teklif artık mevcut değil." }, { status: 410, headers: PRIVATE_HEADERS });
  const { data: committedJob, error: jobError } = await supabase
    .from("flight_search_jobs")
    .select("report_idempotency_key,status")
    .eq("search_id", searchId)
    .eq("source_id", offer.source_id)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: "Teklif yayını doğrulanamadı." }, { status: 500, headers: PRIVATE_HEADERS });
  if (!committedJob || committedJob.status !== "completed" || committedJob.report_idempotency_key !== offer.report_id) {
    return NextResponse.json({ error: "Teklif raporu tamamlanmadı." }, { status: 409, headers: PRIVATE_HEADERS });
  }
  if (offer.expires_at && new Date(offer.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Teklifin süresi doldu; fiyatı yeniden arayın.", code: "OFFER_EXPIRED" }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const verifiedAt = offer.verified_at ? new Date(offer.verified_at).getTime() : 0;
  if (!verifiedAt || verifiedAt > Date.now() + 120_000 || Date.now() - verifiedAt > 10 * 60 * 1000) {
    return NextResponse.json({ error: "Fiyat güncelliğini yitirdi; yeniden doğrulama gerekli.", code: "REVALIDATION_REQUIRED" }, { status: 409, headers: PRIVATE_HEADERS });
  }

  const { data: source, error: sourceError } = await supabase
    .from("flight_sources")
    .select("name,enabled,integration_status,permission_status")
    .eq("id", offer.source_id)
    .maybeSingle();
  const approved = source?.permission_status === "approved" || source?.permission_status === "public_documented";
  if (sourceError || !source || source.enabled !== true || source.integration_status !== "active"
      || !approved || !flightSourceRuntimeReady(offer.source_id)) {
    return NextResponse.json({ error: "Bu satış kaynağı şu anda kullanılamıyor.", code: "SOURCE_NOT_ACTIVE" }, { status: 409, headers: PRIVATE_HEADERS });
  }

  if (!offer.checkout_url) {
    return NextResponse.json({
      error: "Satıcı bağlantısı için fiyatın yeniden doğrulanması gerekli.",
      code: "REVALIDATION_REQUIRED",
    }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const storedVerifiedAt = offer.verified_at ? Date.parse(offer.verified_at) : Number.NaN;
  const expectedVerifiedAt = Date.parse(body.expectedVerifiedAt);
  if (moneyToMinor(body.expectedTotalPrice) !== Number(offer.total_price_minor)
      || body.expectedCurrency !== offer.currency
      || !Number.isFinite(storedVerifiedAt)
      || storedVerifiedAt !== expectedVerifiedAt) {
    return NextResponse.json({
      error: "Teklif, onayından sonra değişti. Güncel fiyatı yeniden kontrol et.",
      code: "OFFER_VERSION_MISMATCH",
    }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const checkoutUrl = safeFlightCheckoutUrl(offer.source_id, offer.checkout_url);
  if (!checkoutUrl) {
    return NextResponse.json({ error: "Bu teklif için güvenli satış bağlantısı bulunamadı.", code: "CHECKOUT_NOT_AVAILABLE" }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const parsed = new URL(checkoutUrl);
  const [actorQuota, versionQuota] = await Promise.all([
    consumeFlightSearchRateLimit({
      request,
      supabase,
      userId: access.user?.id || null,
      scope: "offer-redirect-actor",
      limit: 20,
      windowSeconds: 60,
    }),
    consumeFlightSearchRateLimit({
      request,
      supabase,
      scope: "offer-redirect-version",
      identityKey: `offer:${offer.id}:${storedVerifiedAt}`,
      limit: 2,
      windowSeconds: 60,
    }),
  ]);
  if (!actorQuota.ok || !versionQuota.ok) {
    return NextResponse.json({ error: "Yönlendirme kotası güvenli biçimde doğrulanamadı." }, { status: 503, headers: PRIVATE_HEADERS });
  }
  if (!actorQuota.allowed || !versionQuota.allowed) {
    return NextResponse.json({ error: "Bu teklif kısa süre önce açıldı. Lütfen bir dakika sonra yeniden dene." }, {
      status: 429,
      headers: { ...PRIVATE_HEADERS, "Retry-After": "60" },
    });
  }
  const { error: logError } = await supabase.from("flight_redirect_events").insert({
    search_id: searchId,
    offer_id: offer.id,
    source_id: offer.source_id,
    user_id: access.user?.id || null,
    destination_host: parsed.hostname,
    price_minor: offer.total_price_minor,
    currency: offer.currency,
  });
  if (logError) return NextResponse.json({ error: "Yönlendirme güvenli biçimde kaydedilemedi." }, { status: 503, headers: PRIVATE_HEADERS });

  return NextResponse.json({
    data: {
      redirectUrl: checkoutUrl,
      sourceName: source?.name || offer.source_id,
      verifiedAt: offer.verified_at,
    },
  }, { headers: PRIVATE_HEADERS });
}
