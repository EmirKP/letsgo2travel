import { validateCheckoutUrl } from "./checkout-url";
import { airportMatchesRequest } from "./airport-match";
import { itineraryFingerprint } from "./itinerary-matcher";
import {
  roundMoney,
  sanitizePlainText,
  stableId,
  uniqueSanitizedTextList,
} from "./sanitize";
import type {
  ConditionalFlightPrice,
  FlightCabinClass,
  FlightEndpoint,
  FlightSearchRequest,
  FlightSourceDescriptor,
  NormalizedFlightSegment,
  NormalizedConditionalPrice,
  OfferNormalizationIssue,
  OfferNormalizationResult,
  PriceConditionType,
  SourceFlightOffer,
  SourceFlightSegment,
  SourceOfferBaggage,
  SourceOfferPrice,
} from "./types";

const PRICE_CONDITION_TYPES = new Set<PriceConditionType>([
  "membership",
  "coupon",
  "payment_method",
  "new_user",
  "mobile_only",
  "loyalty",
]);
const CABIN_CLASSES = new Set<FlightCabinClass>([
  "economy",
  "premium_economy",
  "business",
  "first",
]);

function addIssue(issues: OfferNormalizationIssue[], path: string, message: string) {
  issues.push({ path, message });
}

function normalizeCode(
  value: unknown,
  pattern: RegExp,
  path: string,
  issues: OfferNormalizationIssue[],
) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!pattern.test(normalized)) addIssue(issues, path, "Geçersiz kod.");
  return normalized;
}

function normalizeEndpoint(
  value: FlightEndpoint,
  path: string,
  issues: OfferNormalizationIssue[],
): FlightEndpoint {
  return {
    code: normalizeCode(value?.code, /^[A-Z]{3}$/, `${path}.code`, issues),
    terminal: sanitizePlainText(value?.terminal, 20) || null,
  };
}

function isoTimestamp(
  value: unknown,
  path: string,
  issues: OfferNormalizationIssue[],
  requireUtc = false,
) {
  const raw = typeof value === "string" ? value.trim() : "";
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const parsed = Date.parse(raw);
  if (!raw || !hasTimezone || Number.isNaN(parsed) || (requireUtc && !/Z$/i.test(raw))) {
    addIssue(issues, path, requireUtc ? "Geçerli bir UTC ISO zamanı gerekli." : "Saat dilimli ISO zamanı gerekli.");
    return "";
  }
  return requireUtc ? new Date(parsed).toISOString() : raw;
}

function normalizeFlightNumber(
  value: unknown,
  marketingCarrierCode: string,
  path: string,
  issues: OfferNormalizationIssue[],
) {
  let normalized = typeof value === "string" || typeof value === "number"
    ? String(value).trim().toUpperCase().replace(/[\s-]+/g, "")
    : "";
  if (marketingCarrierCode && normalized.startsWith(marketingCarrierCode)) {
    normalized = normalized.slice(marketingCarrierCode.length);
  }
  if (!/^\d{1,4}[A-Z]?$/.test(normalized)) addIssue(issues, path, "Geçersiz uçuş numarası.");
  return normalized;
}

function normalizeSegment(
  value: SourceFlightSegment,
  index: number,
  issues: OfferNormalizationIssue[],
): NormalizedFlightSegment {
  const path = `segments.${index}`;
  const marketingCarrierCode = normalizeCode(
    value?.marketingCarrierCode,
    /^[A-Z0-9]{2,3}$/,
    `${path}.marketingCarrierCode`,
    issues,
  );
  const operatingCarrierCode = normalizeCode(
    value?.operatingCarrierCode,
    /^[A-Z0-9]{2,3}$/,
    `${path}.operatingCarrierCode`,
    issues,
  );
  const origin = normalizeEndpoint(value?.origin, `${path}.origin`, issues);
  const destination = normalizeEndpoint(value?.destination, `${path}.destination`, issues);
  const departureLocal = isoTimestamp(value?.departureLocal, `${path}.departureLocal`, issues);
  const departureUtc = isoTimestamp(value?.departureUtc, `${path}.departureUtc`, issues, true);
  const arrivalLocal = isoTimestamp(value?.arrivalLocal, `${path}.arrivalLocal`, issues);
  const arrivalUtc = isoTimestamp(value?.arrivalUtc, `${path}.arrivalUtc`, issues, true);
  const calculatedDuration = departureUtc && arrivalUtc
    ? Math.round((Date.parse(arrivalUtc) - Date.parse(departureUtc)) / 60_000)
    : 0;
  if (departureLocal && departureUtc && Date.parse(departureLocal) !== Date.parse(departureUtc)) {
    addIssue(issues, `${path}.departureLocal`, "Yerel ve UTC kalkış zamanları aynı anı göstermelidir.");
  }
  if (arrivalLocal && arrivalUtc && Date.parse(arrivalLocal) !== Date.parse(arrivalUtc)) {
    addIssue(issues, `${path}.arrivalLocal`, "Yerel ve UTC varış zamanları aynı anı göstermelidir.");
  }
  if (calculatedDuration <= 0 || calculatedDuration > 24 * 60) {
    addIssue(issues, `${path}.arrivalUtc`, "Varış zamanı kalkıştan sonra ve 24 saat içinde olmalıdır.");
  }
  if (!Number.isInteger(value?.legIndex) || value.legIndex < 0 || value.legIndex > 1) {
    addIssue(issues, `${path}.legIndex`, "Bacak sırası 0 veya 1 olmalıdır.");
  }
  if (origin.code && destination.code && origin.code === destination.code) {
    addIssue(issues, `${path}.destination.code`, "Segment kalkış ve varış havalimanları aynı olamaz.");
  }
  if (!CABIN_CLASSES.has(value?.cabinClass)) {
    addIssue(issues, `${path}.cabinClass`, "Desteklenmeyen kabin sınıfı.");
  }
  if (value?.selfTransfer !== undefined && typeof value.selfTransfer !== "boolean") {
    addIssue(issues, `${path}.selfTransfer`, "Self-transfer bilgisi true veya false olmalıdır.");
  }
  return {
    legIndex: Number.isInteger(value?.legIndex) ? value.legIndex : 0,
    marketingCarrierCode,
    marketingCarrierName: sanitizePlainText(value?.marketingCarrierName, 100) || null,
    operatingCarrierCode,
    operatingCarrierName: sanitizePlainText(value?.operatingCarrierName, 100) || null,
    flightNumber: normalizeFlightNumber(
      value?.flightNumber,
      marketingCarrierCode,
      `${path}.flightNumber`,
      issues,
    ),
    origin,
    destination,
    departureLocal,
    departureUtc,
    arrivalLocal,
    arrivalUtc,
    durationMinutes: calculatedDuration,
    cabinClass: value?.cabinClass,
    aircraft: sanitizePlainText(value?.aircraft, 80) || null,
    selfTransfer: value?.selfTransfer === true,
  };
}

function validateRouteAndLegs(
  segments: NormalizedFlightSegment[],
  request: FlightSearchRequest,
  issues: OfferNormalizationIssue[],
) {
  const expectedLegs = request.tripType === "round_trip" ? 2 : 1;
  const legIndexes = [...new Set(segments.map((segment) => segment.legIndex))].sort((a, b) => a - b);
  if (legIndexes.length !== expectedLegs || legIndexes.some((value, index) => value !== index)) {
    addIssue(issues, "segments", `Arama ${expectedLegs} uçuş bacağı gerektiriyor.`);
    return;
  }

  for (const legIndex of legIndexes) {
    const leg = segments
      .filter((segment) => segment.legIndex === legIndex)
      .sort((left, right) => Date.parse(left.departureUtc) - Date.parse(right.departureUtc));
    const first = leg[0];
    const last = leg[leg.length - 1];
    const expectedOrigin = legIndex === 0 ? request.origin : request.destination;
    const expectedDestination = legIndex === 0 ? request.destination : request.origin;
    const expectedDate = legIndex === 0 ? request.departureDate : request.returnDate;
    if (!airportMatchesRequest(expectedOrigin, first.origin.code, request.includeNearbyAirports)
      || !airportMatchesRequest(expectedDestination, last.destination.code, request.includeNearbyAirports)) {
      addIssue(issues, `segments.leg.${legIndex}`, "Uçuş bacağı aranan rotayla eşleşmiyor.");
    }
    if (expectedDate && first.departureLocal.slice(0, 10) !== expectedDate) {
      addIssue(issues, `segments.leg.${legIndex}.departureLocal`, "Uçuş tarihi aranan tarihle eşleşmiyor.");
    }
    leg.forEach((segment, segmentIndex) => {
      if (segment.cabinClass !== request.cabinClass) {
        addIssue(issues, `segments.leg.${legIndex}.${segmentIndex}.cabinClass`, "Kabin sınıfı aramayla eşleşmiyor.");
      }
      if (request.excludedAirlines.includes(segment.marketingCarrierCode)
        || request.excludedAirlines.includes(segment.operatingCarrierCode)) {
        addIssue(issues, `segments.leg.${legIndex}.${segmentIndex}`, "Hariç tutulan havayolu sonucu döndürüldü.");
      }
      if (segmentIndex > 0) {
        const previous = leg[segmentIndex - 1];
        if (previous.destination.code !== segment.origin.code) {
          addIssue(issues, `segments.leg.${legIndex}`, "Segment güzergâhı kesintisiz değil.");
        }
        if (Date.parse(segment.departureUtc) <= Date.parse(previous.arrivalUtc)) {
          addIssue(issues, `segments.leg.${legIndex}`, "Aktarma zamanları geçersiz.");
        }
      }
    });
    if (request.directOnly && leg.length !== 1) {
      addIssue(issues, `segments.leg.${legIndex}`, "Yalnız direkt uçuş istenmesine rağmen aktarmalı sonuç döndürüldü.");
    }
  }

  if (expectedLegs === 2) {
    const outboundArrival = Math.max(...segments
      .filter((segment) => segment.legIndex === 0)
      .map((segment) => Date.parse(segment.arrivalUtc)));
    const returnDeparture = Math.min(...segments
      .filter((segment) => segment.legIndex === 1)
      .map((segment) => Date.parse(segment.departureUtc)));
    if (!Number.isFinite(outboundArrival) || !Number.isFinite(returnDeparture)
      || returnDeparture <= outboundArrival) {
      addIssue(issues, "segments.leg.1", "Dönüş uçuşu gidiş uçuşunun varışından sonra başlamalıdır.");
    }
  }
}

function money(
  value: unknown,
  path: string,
  issues: OfferNormalizationIssue[],
): number;
function money(
  value: unknown,
  path: string,
  issues: OfferNormalizationIssue[],
  allowNull: true,
): number | null;
function money(
  value: unknown,
  path: string,
  issues: OfferNormalizationIssue[],
  allowNull = false,
): number | null {
  if (allowNull && (value === undefined || value === null)) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000_000) {
    addIssue(issues, path, "Geçerli bir parasal tutar gerekli.");
    return 0;
  }
  return roundMoney(value);
}

function normalizeConditionalPrice(
  value: ConditionalFlightPrice,
  index: number,
  standardCurrency: string,
  issues: OfferNormalizationIssue[],
): NormalizedConditionalPrice {
  const path = `price.conditionalPrices.${index}`;
  const currency = normalizeCode(value?.currency, /^[A-Z]{3}$/, `${path}.currency`, issues);
  if (currency && currency !== standardCurrency) {
    addIssue(issues, `${path}.currency`, "Koşullu fiyat standart fiyatla aynı para biriminde olmalıdır.");
  }
  const conditionType = value?.conditionType;
  if (!PRICE_CONDITION_TYPES.has(conditionType)) {
    addIssue(issues, `${path}.conditionType`, "Desteklenmeyen fiyat koşulu.");
  }
  const eligibilityKey = typeof value?.eligibilityKey === "string"
    ? value.eligibilityKey.trim().toLowerCase()
    : "";
  if (!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(eligibilityKey)) {
    addIssue(issues, `${path}.eligibilityKey`, "Geçersiz uygunluk anahtarı.");
  }
  const id = sanitizePlainText(value?.id, 80);
  const label = sanitizePlainText(value?.label, 140);
  if (!id) addIssue(issues, `${path}.id`, "Koşullu fiyat kimliği zorunludur.");
  if (!label) addIssue(issues, `${path}.label`, "Koşullu fiyat etiketi zorunludur.");
  return {
    id,
    total: money(value?.total, `${path}.total`, issues),
    currency,
    conditionType,
    label,
    eligibilityKey,
  };
}

function normalizePrice(
  value: SourceOfferPrice,
  issues: OfferNormalizationIssue[],
): SourceOfferPrice & { conditionalPrices: NormalizedConditionalPrice[] } {
  const currency = normalizeCode(value?.currency, /^[A-Z]{3}$/, "price.currency", issues);
  const total = money(value?.total, "price.total", issues);
  if (total <= 0) addIssue(issues, "price.total", "Toplam fiyat sıfırdan büyük olmalıdır.");
  if (typeof value?.includesMandatoryFees !== "boolean") {
    addIssue(issues, "price.includesMandatoryFees", "Zorunlu ücret durumu doğrulanmalıdır.");
  }
  const baseFareTotal = money(value?.baseFareTotal, "price.baseFareTotal", issues, true);
  const taxesTotal = money(value?.taxesTotal, "price.taxesTotal", issues, true);
  const mandatoryFeesTotal = money(
    value?.mandatoryFeesTotal,
    "price.mandatoryFeesTotal",
    issues,
    true,
  );
  if (baseFareTotal !== null && taxesTotal !== null && mandatoryFeesTotal !== null) {
    const knownComponents = roundMoney(baseFareTotal + taxesTotal + mandatoryFeesTotal);
    if (total + 1 < knownComponents) {
      addIssue(issues, "price.total", "Toplam fiyat bilinen zorunlu bileşenlerden düşük olamaz.");
    }
  }
  if (value?.conditionalPrices !== undefined && !Array.isArray(value.conditionalPrices)) {
    addIssue(issues, "price.conditionalPrices", "Koşullu fiyatlar liste olmalıdır.");
  }
  if (Array.isArray(value?.conditionalPrices) && value.conditionalPrices.length > 20) {
    addIssue(issues, "price.conditionalPrices", "En fazla 20 koşullu fiyat kabul edilir.");
  }
  const conditionalPrices = Array.isArray(value?.conditionalPrices)
    ? value.conditionalPrices
      .slice(0, 20)
      .map((conditional, index) => normalizeConditionalPrice(conditional, index, currency, issues))
    : [];
  const conditionalIds = new Set<string>();
  conditionalPrices.forEach((conditional, index) => {
    if (conditionalIds.has(conditional.id)) {
      addIssue(issues, `price.conditionalPrices.${index}.id`, "Koşullu fiyat kimliği benzersiz olmalıdır.");
    }
    conditionalIds.add(conditional.id);
  });
  return {
    total,
    currency,
    includesMandatoryFees: value?.includesMandatoryFees === true,
    baseFareTotal,
    taxesTotal,
    mandatoryFeesTotal,
    conditionalPrices,
  };
}

function nonNegativeInteger(
  value: unknown,
  path: string,
  maximum: number,
  issues: OfferNormalizationIssue[],
) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) {
    addIssue(issues, path, `0 ile ${maximum} arasında tam sayı gerekli.`);
    return 0;
  }
  return value;
}

function normalizeBaggage(
  value: SourceOfferBaggage,
  issues: OfferNormalizationIssue[],
): SourceOfferBaggage {
  const weight = value?.checkedBagWeightKg;
  if (weight !== null && weight !== undefined
    && (typeof weight !== "number" || !Number.isFinite(weight) || weight < 1 || weight > 50)) {
    addIssue(issues, "baggage.checkedBagWeightKg", "Kayıtlı bagaj ağırlığı geçersiz.");
  }
  return {
    cabinBagsPerPassenger: nonNegativeInteger(
      value?.cabinBagsPerPassenger,
      "baggage.cabinBagsPerPassenger",
      3,
      issues,
    ),
    checkedBagsPerPassenger: nonNegativeInteger(
      value?.checkedBagsPerPassenger,
      "baggage.checkedBagsPerPassenger",
      3,
      issues,
    ),
    checkedBagWeightKg: typeof weight === "number" && Number.isFinite(weight) ? weight : null,
    additionalCabinBagFeeTotal: money(
      value?.additionalCabinBagFeeTotal,
      "baggage.additionalCabinBagFeeTotal",
      issues,
      true,
    ),
    additionalCheckedBagFeeTotal: money(
      value?.additionalCheckedBagFeeTotal,
      "baggage.additionalCheckedBagFeeTotal",
      issues,
      true,
    ),
  };
}

function validateTextList(
  value: unknown,
  path: string,
  maximumItems: number,
  issues: OfferNormalizationIssue[],
) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, "Liste olmalıdır.");
    return;
  }
  if (value.length > maximumItems) {
    addIssue(issues, path, `En fazla ${maximumItems} değer kabul edilir.`);
  }
  value.slice(0, maximumItems).forEach((item, index) => {
    if (typeof item !== "string") addIssue(issues, `${path}.${index}`, "Metin olmalıdır.");
  });
}

function normalizeNullableBoolean(
  value: unknown,
  path: string,
  issues: OfferNormalizationIssue[],
): boolean | null {
  if (value !== null && typeof value !== "boolean") {
    addIssue(issues, path, "true, false veya null olmalıdır.");
    return null;
  }
  return value;
}

export function normalizeSourceOffer(
  value: SourceFlightOffer,
  source: FlightSourceDescriptor,
  request: FlightSearchRequest,
): OfferNormalizationResult {
  const issues: OfferNormalizationIssue[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: [{ path: "offer", message: "Teklif nesnesi gerekli." }] };
  }
  if (!Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > 8) {
    return { ok: false, issues: [{ path: "segments", message: "Teklif 1 ile 8 segment içermelidir." }] };
  }

  const segments = value.segments.map((segment, index) => normalizeSegment(segment, index, issues));
  segments.sort((left, right) => left.legIndex - right.legIndex
    || Date.parse(left.departureUtc) - Date.parse(right.departureUtc));
  validateRouteAndLegs(segments, request, issues);

  const passengerCount = value.passengerCount;
  const requestedPassengerCount = request.passengers.adults
    + request.passengers.children
    + request.passengers.infants;
  if (!Number.isInteger(passengerCount) || passengerCount !== requestedPassengerCount) {
    addIssue(issues, "passengerCount", "Teklif toplam yolcu sayısıyla eşleşmelidir.");
  }

  const sourceOfferId = sanitizePlainText(value.sourceOfferId, 200);
  if (!sourceOfferId) addIssue(issues, "sourceOfferId", "Kaynak teklif kimliği zorunludur.");
  if (typeof value.sourceOfferId !== "string" || value.sourceOfferId.trim() !== sourceOfferId) {
    addIssue(issues, "sourceOfferId", "Kaynak teklif kimliği düz metin ve en fazla 200 karakter olmalıdır.");
  }
  const farePackage = sanitizePlainText(value.farePackage, 80);
  if (!farePackage) addIssue(issues, "farePackage", "Fare paketi açıkça belirtilmelidir.");
  const price = normalizePrice(value.price, issues);
  const baggage = normalizeBaggage(value.baggage, issues);
  const refundable = normalizeNullableBoolean(value.refundable, "refundable", issues);
  const changeable = normalizeNullableBoolean(value.changeable, "changeable", issues);
  if (typeof value.directAirlineSale !== "boolean") {
    addIssue(issues, "directAirlineSale", "Doğrudan satış bilgisi true veya false olmalıdır.");
  }
  if (value.sponsored !== undefined && typeof value.sponsored !== "boolean") {
    addIssue(issues, "sponsored", "Sponsor bilgisi true veya false olmalıdır.");
  }
  validateTextList(value.installmentOptions, "installmentOptions", 12, issues);
  validateTextList(value.benefits, "benefits", 20, issues);

  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(source.id)) {
    addIssue(issues, "source.id", "Kaynak kimliği geçersiz.");
  }
  if (!["ota", "airline", "affiliate"].includes(source.sourceType)) {
    addIssue(issues, "source.sourceType", "Kaynak türü geçersiz.");
  }
  const sourceName = sanitizePlainText(source.name, 100);
  if (!sourceName) addIssue(issues, "source.name", "Kaynak adı zorunludur.");

  let checkoutUrl: string | null = null;
  if (value.checkoutUrl !== null && value.checkoutUrl !== undefined) {
    const checkout = validateCheckoutUrl(value.checkoutUrl, source.checkoutHosts);
    if (!checkout.ok) addIssue(issues, "checkoutUrl", checkout.reason);
    else checkoutUrl = checkout.url;
  }

  const observedAt = isoTimestamp(value.observedAt, "observedAt", issues, true);
  let expiresAt: string | null = null;
  if (value.expiresAt !== undefined && value.expiresAt !== null) {
    expiresAt = isoTimestamp(value.expiresAt, "expiresAt", issues, true);
    if (observedAt && expiresAt && Date.parse(expiresAt) <= Date.parse(observedAt)) {
      addIssue(issues, "expiresAt", "Teklif geçerlilik zamanı gözlem zamanından sonra olmalıdır.");
    }
  }

  if (issues.length) return { ok: false, issues };

  const itineraryKey = itineraryFingerprint(segments);
  const identity = JSON.stringify([source.id, sourceOfferId, farePackage, itineraryKey]);
  return {
    ok: true,
    offer: {
      id: stableId("offer", identity),
      sourceId: source.id,
      sourceName,
      sourceType: source.sourceType,
      sourceOfferId,
      itineraryKey,
      passengerCount,
      farePackage,
      price,
      baggage,
      refundable,
      changeable,
      installmentOptions: uniqueSanitizedTextList(value.installmentOptions, 12, 100),
      benefits: uniqueSanitizedTextList(value.benefits, 20, 160),
      directAirlineSale: source.sourceType === "airline" && value.directAirlineSale === true,
      checkoutUrl,
      observedAt,
      expiresAt,
      sponsored: value.sponsored === true,
      segments,
    },
  };
}
