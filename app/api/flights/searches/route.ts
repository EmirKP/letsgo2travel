import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { validateFlightSearchRequest } from "@/lib/flights/core";
import { consumeFlightSearchRateLimit } from "@/lib/flights/server/rate-limit";
import { optionalRequestUser } from "@/lib/flights/server/request-user";
import { flightSourceRuntimeReady } from "@/lib/flights/server/source-domains";
import { createFlightSearchToken, hashFlightToken } from "@/lib/flights/server/tokens";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function responseHeaders(rateLimit?: { remaining: number; resetAt: string | null }) {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
  };
  if (rateLimit) {
    headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);
    if (rateLimit.resetAt) headers["X-RateLimit-Reset"] = rateLimit.resetAt;
  }
  return headers;
}

function approvedPermission(source: Record<string, unknown>) {
  return source.permission_status === "approved" || source.permission_status === "public_documented";
}

function sourceCompatibility(
  source: Record<string, unknown>,
  criteria: ReturnType<typeof validateFlightSearchRequest> & { ok: true },
) {
  const request = criteria.value;
  if (request.excludedSources.includes(String(source.id || ""))) return "excluded";
  const currencies = Array.isArray(source.supported_currencies)
    ? source.supported_currencies.map(String)
    : [];
  if (currencies.length && !currencies.includes(request.currency)) return "currency";
  if (request.tripType === "one_way" && source.supports_one_way !== true) return "trip_type";
  if (request.tripType === "round_trip" && source.supports_round_trip !== true) return "trip_type";
  const baggageRequested = request.baggage.cabinBagsPerPassenger > 0
    || request.baggage.checkedBagsPerPassenger > 0;
  if (baggageRequested && source.supports_baggage !== true) return "baggage";
  return null;
}

function publicSourceStatus(
  source: Record<string, unknown>,
  criteria: ReturnType<typeof validateFlightSearchRequest> & { ok: true },
) {
  const integrationStatus = String(source.integration_status || "partner_access_required");
  const sourceId = String(source.id || "");
  const incompatibility = sourceCompatibility(source, criteria);
  const ready = source.enabled === true
    && integrationStatus === "active"
    && approvedPermission(source)
    && flightSourceRuntimeReady(sourceId)
    && !incompatibility;
  return {
    sourceId,
    sourceName: String(source.name || ""),
    sourceType: String(source.source_type || "ota"),
    state: incompatibility ? "skipped" : ready ? "queued" : source.enabled === true ? "integration_required" : "disabled",
    message: incompatibility === "excluded"
      ? "Bu kaynak kullanıcı tercihiyle aramadan çıkarıldı."
      : incompatibility === "currency"
        ? "Seçilen para birimi bu kaynakta desteklenmiyor."
        : incompatibility === "trip_type"
          ? "Seçilen yolculuk türü bu kaynakta desteklenmiyor."
          : incompatibility === "baggage"
            ? "İstenen bagaj dahil toplam bu kaynakta doğrulanamıyor."
      : integrationStatus === "partner_access_required"
      ? "Partnerlik başvurusu ve resmî API erişimi gerekli."
      : integrationStatus === "credentials_required"
        ? "API erişim bilgileri gerekli."
        : integrationStatus === "paused"
          ? "Kaynak geçici olarak pasif."
          : integrationStatus === "active" && source.enabled !== true
            ? "Kaynak yönetici tarafından pasif durumda."
            : "Entegrasyon bekleniyor.",
  };
}

export async function POST(request: Request) {
  const bodyText = await request.text().catch(() => "");
  if (!bodyText || bodyText.length > 20_000) {
    return NextResponse.json(
      { error: bodyText ? "İstek çok büyük." : "Arama bilgileri gerekli.", code: bodyText ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST" },
      { status: bodyText ? 413 : 400, headers: responseHeaders() },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON isteği.", code: "INVALID_JSON" }, { status: 400, headers: responseHeaders() });
  }

  const validation = validateFlightSearchRequest(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Uçuş arama bilgileri geçersiz.", code: "VALIDATION_ERROR", issues: validation.issues.slice(0, 30) },
      { status: 400, headers: responseHeaders() },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Uçuş arama altyapısı yapılandırılmamış.", code: "SERVICE_NOT_CONFIGURED" },
      { status: 503, headers: responseHeaders() },
    );
  }
  const userResult = await optionalRequestUser(request, supabase);
  if (userResult.provided && !userResult.user) {
    return NextResponse.json({ error: "Geçersiz veya süresi dolmuş oturum." }, { status: 401, headers: responseHeaders() });
  }

  const quota = await consumeFlightSearchRateLimit({
    request,
    supabase,
    userId: userResult.user?.id || null,
    limit: 12,
    windowSeconds: 60,
  });
  if (!quota.ok) {
    return NextResponse.json(
      { error: "Uçuş arama kotası doğrulanamadı. Migration ve FLIGHT_RATE_LIMIT_SECRET ayarını kontrol edin.", code: "RATE_LIMIT_NOT_CONFIGURED" },
      { status: 503, headers: responseHeaders() },
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Çok fazla uçuş araması yapıldı. Lütfen kısa süre sonra tekrar deneyin.", code: "RATE_LIMITED" },
      { status: 429, headers: { ...responseHeaders(quota), "Retry-After": "60" } },
    );
  }

  const { data: sources, error: sourcesError } = await supabase
    .from("flight_sources")
    .select("id,name,source_type,integration_status,permission_status,enabled,supports_one_way,supports_round_trip,supports_baggage,supported_currencies,request_limit_per_minute")
    .order("name", { ascending: true });
  if (sourcesError) {
    return NextResponse.json(
      { error: "Uçuş meta-arama migration'ı henüz kurulmamış.", code: "FOUNDATION_NOT_INSTALLED" },
      { status: 503, headers: responseHeaders(quota) },
    );
  }

  const normalized = validation.value;
  const persistedCriteria = Object.fromEntries(
    Object.entries(normalized).filter(([key]) => key !== "eligiblePriceConditions"),
  );
  const activeSources = (sources || []).filter((source) => (
    source.enabled === true
    && source.integration_status === "active"
    && approvedPermission(source as Record<string, unknown>)
    && flightSourceRuntimeReady(source.id)
    && !sourceCompatibility(source as Record<string, unknown>, validation)
  ));
  const sourceQuotas = await Promise.all(activeSources.map((source) => consumeFlightSearchRateLimit({
    request,
    supabase,
    scope: "source-mcp",
    identityKey: `source:${source.id}`,
    limit: Math.min(100, Math.max(1, Number(source.request_limit_per_minute) || 60)),
    windowSeconds: 60,
  })));
  if (sourceQuotas.some((sourceQuota) => !sourceQuota.ok)) {
    return NextResponse.json(
      { error: "Uçuş kaynağı kotası doğrulanamadı.", code: "SOURCE_RATE_LIMIT_NOT_CONFIGURED" },
      { status: 503, headers: responseHeaders(quota) },
    );
  }
  if (sourceQuotas.some((sourceQuota) => !sourceQuota.allowed)) {
    return NextResponse.json(
      { error: "Canlı uçuş kaynağı yoğun. Lütfen bir dakika sonra yeniden deneyin.", code: "SOURCE_RATE_LIMITED" },
      { status: 429, headers: { ...responseHeaders(quota), "Retry-After": "60" } },
    );
  }
  const accessToken = createFlightSearchToken();
  const requestFingerprint = createHash("sha256")
    .update(JSON.stringify({ version: 1, ...normalized }))
    .digest("hex");
  const status = activeSources.length ? "queued" : "no_sources";
  const now = new Date().toISOString();

  const { data: search, error: searchError } = await supabase
    .from("flight_searches")
    .insert({
      user_id: userResult.user?.id || null,
      access_token_hash: hashFlightToken(accessToken),
      request_fingerprint: requestFingerprint,
      criteria_version: 1,
      criteria: persistedCriteria,
      trip_type: normalized.tripType,
      currency: normalized.currency,
      status,
      source_count: activeSources.length,
      completed_source_count: activeSources.length ? 0 : 0,
      completed_at: activeSources.length ? null : now,
    })
    .select("id,status,created_at,expires_at")
    .single();
  if (searchError || !search) {
    return NextResponse.json({ error: "Uçuş araması oluşturulamadı." }, { status: 500, headers: responseHeaders(quota) });
  }

  const legs = [{
    search_id: search.id,
    leg_order: 0,
    origin_code: normalized.origin,
    destination_code: normalized.destination,
    departure_date: normalized.departureDate,
  }];
  if (normalized.tripType === "round_trip" && normalized.returnDate) {
    legs.push({
      search_id: search.id,
      leg_order: 1,
      origin_code: normalized.destination,
      destination_code: normalized.origin,
      departure_date: normalized.returnDate,
    });
  }

  const { error: legsError } = await supabase.from("flight_search_legs").insert(legs);
  if (legsError) {
    await supabase.from("flight_searches").delete().eq("id", search.id);
    return NextResponse.json({ error: "Uçuş arama bacakları kaydedilemedi." }, { status: 500, headers: responseHeaders(quota) });
  }

  if (activeSources.length) {
    const { error: jobsError } = await supabase.from("flight_search_jobs").insert(activeSources.map((source) => ({
      search_id: search.id,
      source_id: source.id,
      status: "queued",
    })));
    if (jobsError) {
      await supabase.from("flight_searches").delete().eq("id", search.id);
      return NextResponse.json({ error: "Kaynak arama görevleri oluşturulamadı." }, { status: 500, headers: responseHeaders(quota) });
    }
  }

  return NextResponse.json({
    data: {
      id: search.id,
      status: search.status,
      accessToken,
      createdAt: search.created_at,
      expiresAt: search.expires_at,
      sourceStatuses: (sources || [])
        .filter((source) => source.enabled === true || normalized.preferredSources.includes(source.id))
        .map((source) => publicSourceStatus(source as Record<string, unknown>, validation)),
      message: activeSources.length
        ? `${activeSources.length} yetkili uçuş kaynağı kuyruğa alındı.`
        : "Henüz etkin ve resmî erişimi tamamlanmış uçuş kaynağı yok. Sahte fiyat gösterilmedi.",
    },
  }, { status: activeSources.length ? 202 : 200, headers: responseHeaders(quota) });
}
