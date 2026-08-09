import type {
  BaggageRequest,
  FlightCabinClass,
  FlightSearchValidationIssue,
  FlightSearchValidationResult,
  FlightTripType,
  PassengerSelection,
} from "./types";

const TOP_LEVEL_FIELDS = new Set([
  "tripType",
  "origin",
  "destination",
  "departureDate",
  "returnDate",
  "passengers",
  "cabinClass",
  "baggage",
  "currency",
  "directOnly",
  "includeNearbyAirports",
  "flexibleDates",
  "preferredAirlines",
  "excludedAirlines",
  "preferredSources",
  "excludedSources",
]);

const PASSENGER_FIELDS = new Set(["adults", "children", "infants"]);
const BAGGAGE_FIELDS = new Set([
  "cabinBagsPerPassenger",
  "checkedBagsPerPassenger",
  "checkedBagWeightKg",
]);
const CABIN_CLASSES = new Set<FlightCabinClass>([
  "economy",
  "premium_economy",
  "business",
  "first",
]);
const TRIP_TYPES = new Set<FlightTripType>(["one_way", "round_trip"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(
  issues: FlightSearchValidationIssue[],
  path: string,
  code: FlightSearchValidationIssue["code"],
  message: string,
) {
  issues.push({ path, code, message });
}

function rejectUnknownFields(
  value: JsonRecord,
  allowed: ReadonlySet<string>,
  path: string,
  issues: FlightSearchValidationIssue[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(issues, path ? `${path}.${key}` : key, "unsupported_field", "Desteklenmeyen alan.");
    }
  }
}

function requiredString(
  value: unknown,
  path: string,
  issues: FlightSearchValidationIssue[],
) {
  if (typeof value !== "string" || !value.trim()) {
    issue(issues, path, "required", "Bu alan zorunludur.");
    return "";
  }
  return value.trim();
}

function exactInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: FlightSearchValidationIssue[],
) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    issue(issues, path, "invalid_type", "Tam sayı olmalıdır.");
    return minimum;
  }
  if (value < minimum || value > maximum) {
    issue(issues, path, "out_of_range", `${minimum} ile ${maximum} arasında olmalıdır.`);
  }
  return value;
}

function optionalBoolean(
  value: unknown,
  path: string,
  fallback: boolean,
  issues: FlightSearchValidationIssue[],
) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    issue(issues, path, "invalid_type", "true veya false olmalıdır.");
    return fallback;
  }
  return value;
}

function isRealIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parsePassengerSelection(
  value: unknown,
  issues: FlightSearchValidationIssue[],
): PassengerSelection {
  if (!isRecord(value)) {
    issue(issues, "passengers", "required", "Yolcu bilgileri zorunludur.");
    return { adults: 1, children: 0, infants: 0 };
  }
  rejectUnknownFields(value, PASSENGER_FIELDS, "passengers", issues);
  const passengers = {
    adults: exactInteger(value.adults, "passengers.adults", 1, 9, issues),
    children: exactInteger(value.children ?? 0, "passengers.children", 0, 8, issues),
    infants: exactInteger(value.infants ?? 0, "passengers.infants", 0, 8, issues),
  };
  if (passengers.adults + passengers.children + passengers.infants > 9) {
    issue(issues, "passengers", "out_of_range", "Toplam yolcu sayısı 9'u aşamaz.");
  }
  if (passengers.infants > passengers.adults) {
    issue(issues, "passengers.infants", "conflict", "Bebek sayısı yetişkin sayısını aşamaz.");
  }
  return passengers;
}

function parseBaggageRequest(
  value: unknown,
  issues: FlightSearchValidationIssue[],
): BaggageRequest {
  if (value === undefined) {
    return {
      cabinBagsPerPassenger: 0,
      checkedBagsPerPassenger: 0,
      checkedBagWeightKg: null,
    };
  }
  if (!isRecord(value)) {
    issue(issues, "baggage", "invalid_type", "Bagaj bilgileri nesne olmalıdır.");
    return {
      cabinBagsPerPassenger: 0,
      checkedBagsPerPassenger: 0,
      checkedBagWeightKg: null,
    };
  }
  rejectUnknownFields(value, BAGGAGE_FIELDS, "baggage", issues);
  const weightValue = value.checkedBagWeightKg;
  let checkedBagWeightKg: number | null = null;
  if (weightValue !== undefined && weightValue !== null) {
    if (typeof weightValue !== "number" || !Number.isInteger(weightValue)) {
      issue(issues, "baggage.checkedBagWeightKg", "invalid_type", "Bagaj ağırlığı tam sayı olmalıdır.");
    } else {
      checkedBagWeightKg = weightValue;
      if (weightValue < 1 || weightValue > 50) {
        issue(issues, "baggage.checkedBagWeightKg", "out_of_range", "Bagaj ağırlığı 1 ile 50 kg arasında olmalıdır.");
      }
    }
  }
  const baggage = {
    cabinBagsPerPassenger: exactInteger(
      value.cabinBagsPerPassenger ?? 0,
      "baggage.cabinBagsPerPassenger",
      0,
      3,
      issues,
    ),
    checkedBagsPerPassenger: exactInteger(
      value.checkedBagsPerPassenger ?? 0,
      "baggage.checkedBagsPerPassenger",
      0,
      3,
      issues,
    ),
    checkedBagWeightKg,
  };
  if (baggage.checkedBagsPerPassenger === 0 && checkedBagWeightKg !== null) {
    issue(
      issues,
      "baggage.checkedBagWeightKg",
      "conflict",
      "Kayıtlı bagaj sayısı sıfırken ağırlık seçilemez.",
    );
  }
  return baggage;
}

function normalizedCodeList(
  value: unknown,
  path: string,
  pattern: RegExp,
  issues: FlightSearchValidationIssue[],
  maximumItems = 20,
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issue(issues, path, "invalid_type", "Liste olmalıdır.");
    return [];
  }
  if (value.length > maximumItems) {
    issue(issues, path, "out_of_range", `En fazla ${maximumItems} değer kullanılabilir.`);
  }
  const normalized: string[] = [];
  value.slice(0, maximumItems).forEach((item, index) => {
    if (typeof item !== "string" || !pattern.test(item.trim().toUpperCase())) {
      issue(issues, `${path}.${index}`, "invalid_format", "Geçersiz kod biçimi.");
      return;
    }
    const code = item.trim().toUpperCase();
    if (!normalized.includes(code)) normalized.push(code);
  });
  return normalized;
}

function normalizedIdentifierList(
  value: unknown,
  path: string,
  issues: FlightSearchValidationIssue[],
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issue(issues, path, "invalid_type", "Liste olmalıdır.");
    return [];
  }
  if (value.length > 20) issue(issues, path, "out_of_range", "En fazla 20 değer kullanılabilir.");
  const normalized: string[] = [];
  value.slice(0, 20).forEach((item, index) => {
    const identifier = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(identifier)) {
      issue(issues, `${path}.${index}`, "invalid_format", "Geçersiz kaynak kimliği.");
      return;
    }
    if (!normalized.includes(identifier)) normalized.push(identifier);
  });
  return normalized;
}

function normalizedEligibilityList(
  value: unknown,
  issues: FlightSearchValidationIssue[],
) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issue(issues, "eligiblePriceConditions", "invalid_type", "Liste olmalıdır.");
    return [];
  }
  if (value.length > 20) {
    issue(issues, "eligiblePriceConditions", "out_of_range", "En fazla 20 koşul seçilebilir.");
  }
  const normalized: string[] = [];
  value.slice(0, 20).forEach((item, index) => {
    const key = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(key)) {
      issue(issues, `eligiblePriceConditions.${index}`, "invalid_format", "Geçersiz uygunluk anahtarı.");
      return;
    }
    if (!normalized.includes(key)) normalized.push(key);
  });
  return normalized;
}

function reportOverlap(
  preferred: string[],
  excluded: string[],
  path: string,
  issues: FlightSearchValidationIssue[],
) {
  const overlap = preferred.filter((value) => excluded.includes(value));
  if (overlap.length) {
    issue(issues, path, "conflict", `Aynı değer tercih edilip hariç bırakılamaz: ${overlap.join(", ")}`);
  }
}

export function validateFlightSearchRequest(
  input: unknown,
  options: {
    now?: Date;
    maxDaysAhead?: number;
    verifiedPriceConditions?: readonly string[];
  } = {},
): FlightSearchValidationResult {
  const issues: FlightSearchValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ path: "request", code: "invalid_type", message: "Arama isteği nesne olmalıdır." }],
    };
  }

  rejectUnknownFields(input, TOP_LEVEL_FIELDS, "", issues);

  const rawTripType = requiredString(input.tripType, "tripType", issues);
  const tripType = TRIP_TYPES.has(rawTripType as FlightTripType)
    ? rawTripType as FlightTripType
    : "one_way";
  if (rawTripType && !TRIP_TYPES.has(rawTripType as FlightTripType)) {
    issue(issues, "tripType", "invalid_value", "Yolculuk türü one_way veya round_trip olmalıdır.");
  }

  const origin = requiredString(input.origin, "origin", issues).toUpperCase();
  const destination = requiredString(input.destination, "destination", issues).toUpperCase();
  if (origin && !/^[A-Z]{3}$/.test(origin)) {
    issue(issues, "origin", "invalid_format", "Kalkış üç harfli IATA kodu olmalıdır.");
  }
  if (destination && !/^[A-Z]{3}$/.test(destination)) {
    issue(issues, "destination", "invalid_format", "Varış üç harfli IATA kodu olmalıdır.");
  }
  if (origin && destination && origin === destination) {
    issue(issues, "destination", "conflict", "Kalkış ve varış aynı olamaz.");
  }

  const departureDate = requiredString(input.departureDate, "departureDate", issues);
  if (departureDate && !isRealIsoDate(departureDate)) {
    issue(issues, "departureDate", "invalid_format", "Gidiş tarihi YYYY-MM-DD biçiminde geçerli bir tarih olmalıdır.");
  }

  let returnDate: string | null = null;
  if (input.returnDate !== undefined && input.returnDate !== null) {
    if (typeof input.returnDate !== "string" || !isRealIsoDate(input.returnDate.trim())) {
      issue(issues, "returnDate", "invalid_format", "Dönüş tarihi YYYY-MM-DD biçiminde geçerli bir tarih olmalıdır.");
    } else {
      returnDate = input.returnDate.trim();
    }
  }
  if (tripType === "round_trip" && !returnDate) {
    issue(issues, "returnDate", "required", "Gidiş-dönüş aramasında dönüş tarihi zorunludur.");
  }
  if (tripType === "one_way" && returnDate) {
    issue(issues, "returnDate", "conflict", "Tek yön aramasında dönüş tarihi gönderilemez.");
  }
  if (departureDate && returnDate && returnDate < departureDate) {
    issue(issues, "returnDate", "date_order", "Dönüş tarihi gidiş tarihinden önce olamaz.");
  }

  const today = (options.now || new Date()).toISOString().slice(0, 10);
  const maximum = new Date(`${today}T00:00:00.000Z`);
  maximum.setUTCDate(maximum.getUTCDate() + Math.max(1, options.maxDaysAhead ?? 730));
  const maximumDate = maximum.toISOString().slice(0, 10);
  if (isRealIsoDate(departureDate)) {
    if (departureDate < today) {
      issue(issues, "departureDate", "date_in_past", "Gidiş tarihi geçmiş olamaz.");
    }
    if (departureDate > maximumDate) {
      issue(issues, "departureDate", "out_of_range", "Gidiş tarihi desteklenen aralığın dışındadır.");
    }
  }
  if (returnDate && returnDate > maximumDate) {
    issue(issues, "returnDate", "out_of_range", "Dönüş tarihi desteklenen aralığın dışındadır.");
  }

  const passengers = parsePassengerSelection(input.passengers, issues);
  const baggage = parseBaggageRequest(input.baggage, issues);

  const rawCabinClass = requiredString(input.cabinClass, "cabinClass", issues);
  const cabinClass = CABIN_CLASSES.has(rawCabinClass as FlightCabinClass)
    ? rawCabinClass as FlightCabinClass
    : "economy";
  if (rawCabinClass && !CABIN_CLASSES.has(rawCabinClass as FlightCabinClass)) {
    issue(issues, "cabinClass", "invalid_value", "Desteklenmeyen kabin sınıfı.");
  }

  const rawCurrency = input.currency === undefined
    ? "TRY"
    : requiredString(input.currency, "currency", issues).toUpperCase();
  if (rawCurrency && !/^[A-Z]{3}$/.test(rawCurrency)) {
    issue(issues, "currency", "invalid_format", "Para birimi üç harfli ISO kodu olmalıdır.");
  }

  const flexibleDates = input.flexibleDates === undefined
    ? 0
    : exactInteger(input.flexibleDates, "flexibleDates", 0, 3, issues);
  const preferredAirlines = normalizedCodeList(
    input.preferredAirlines,
    "preferredAirlines",
    /^[A-Z0-9]{2,3}$/,
    issues,
  );
  const excludedAirlines = normalizedCodeList(
    input.excludedAirlines,
    "excludedAirlines",
    /^[A-Z0-9]{2,3}$/,
    issues,
  );
  const preferredSources = normalizedIdentifierList(input.preferredSources, "preferredSources", issues);
  const excludedSources = normalizedIdentifierList(input.excludedSources, "excludedSources", issues);
  const directOnly = optionalBoolean(input.directOnly, "directOnly", false, issues);
  const includeNearbyAirports = optionalBoolean(
    input.includeNearbyAirports,
    "includeNearbyAirports",
    false,
    issues,
  );
  const eligiblePriceConditions = normalizedEligibilityList(
    options.verifiedPriceConditions,
    issues,
  );
  reportOverlap(preferredAirlines, excludedAirlines, "preferredAirlines", issues);
  reportOverlap(preferredSources, excludedSources, "preferredSources", issues);

  if (issues.length) return { ok: false, issues };

  return {
    ok: true,
    value: {
      tripType,
      origin,
      destination,
      departureDate,
      returnDate,
      passengers,
      cabinClass,
      baggage,
      currency: rawCurrency,
      directOnly,
      includeNearbyAirports,
      flexibleDates,
      preferredAirlines,
      excludedAirlines,
      preferredSources,
      excludedSources,
      eligiblePriceConditions,
    },
  };
}
