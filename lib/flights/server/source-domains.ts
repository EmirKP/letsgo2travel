const SOURCE_CHECKOUT_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  enuygun: ["www.enuygun.com"],
  ucuzabilet: ["ucuzabilet.com"],
  turna: ["www.turna.com"],
  obilet: ["www.obilet.com"],
  trip: ["trip.com"],
  kiwi: ["kiwi.com"],
  edreams: ["edreams.com", "edreams.net"],
  mytrip: ["mytrip.com"],
  "airline-direct": [],
});

const SOURCE_CHECKOUT_PATHS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  enuygun: ["/ucak-bileti/deep-link-handler/"],
});

const ENUYGUN_REQUIRED_SCALAR_QUERY_KEYS = [
  "origin",
  "destination",
  "adult",
  "child",
  "infant",
  "departure",
  "currency",
  "affiliate",
] as const;
const ENUYGUN_OPTIONAL_SCALAR_QUERY_KEYS = ["return"] as const;
const ENUYGUN_FLIGHT_IDS_QUERY_KEY = "flight_ids[]";
const ENUYGUN_QUERY_KEYS = new Set<string>([
  ...ENUYGUN_REQUIRED_SCALAR_QUERY_KEYS,
  ...ENUYGUN_OPTIONAL_SCALAR_QUERY_KEYS,
  ENUYGUN_FLIGHT_IDS_QUERY_KEY,
]);

// Resmî API şeması ve credential doğrulaması tamamlanmış connector kimlikleri
// burada açıkça kodla etkinleştirilir. Yalnız resmî, doğrulanmış protokol kullanan
// connector'lar bu listeye girebilir; tüketici sayfası kazıyan kod kabul edilmez.
const RUNTIME_READY_CONNECTORS = new Set<string>(["enuygun"]);
const COMPARISON_CATALOG_SOURCES = new Set<string>([
  "enuygun",
  "ucuzabilet",
  "turna",
  "obilet",
]);

function domainMatches(hostname: string, allowedDomain: string) {
  return hostname === allowedDomain;
}

function nestedUrlLike(value: string) {
  return /(?:https?|ftp|file|data|javascript):/i.test(value)
    || /[a-z][a-z0-9+.-]{1,20}:\s*(?:\/\/|\\\\)/i.test(value)
    || value.includes("//")
    || value.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(value)
    || /%[0-9a-f]{2}/i.test(value);
}

function checkoutDate(value: string) {
  const local = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const year = Number(local?.[3]);
  const month = Number(local?.[2]);
  const day = Number(local?.[1]);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) return null;
  return date.getTime();
}

function validEnuygunCheckoutQuery(params: URLSearchParams) {
  const entries = [...params.entries()];
  if (!entries.length || entries.some(([key, value]) => (
    !ENUYGUN_QUERY_KEYS.has(key)
      || !value
      || value !== value.trim()
      || nestedUrlLike(value)
  ))) return false;

  for (const key of ENUYGUN_REQUIRED_SCALAR_QUERY_KEYS) {
    if (params.getAll(key).length !== 1) return false;
  }
  for (const key of ENUYGUN_OPTIONAL_SCALAR_QUERY_KEYS) {
    if (params.getAll(key).length > 1) return false;
  }

  const origin = params.get("origin") || "";
  const destination = params.get("destination") || "";
  const adult = params.get("adult") || "";
  const child = params.get("child") || "";
  const infant = params.get("infant") || "";
  const passengerCount = Number(adult) + Number(child) + Number(infant);
  const departure = checkoutDate(params.get("departure") || "");
  const returnValues = params.getAll("return");
  const returnDate = returnValues.length ? checkoutDate(returnValues[0]) : null;
  const flightIds = params.getAll(ENUYGUN_FLIGHT_IDS_QUERY_KEY);

  if (!/^[A-Z]{3,4}$/.test(origin)
      || !/^[A-Z]{3}$/.test(destination)
      || origin === destination
      || !/^[1-9]$/.test(adult)
      || !/^[0-8]$/.test(child)
      || !/^[0-8]$/.test(infant)
      || passengerCount > 9
      || Number(infant) > Number(adult)
      || departure === null
      || (returnValues.length === 1 && (returnDate === null || returnDate < departure))
      || !/^[A-Z]{3}$/.test(params.get("currency") || "")
      || !/^\d{4}$/.test(params.get("affiliate") || "")) {
    return false;
  }

  const expectedFlightIds = returnValues.length ? 2 : 1;
  return flightIds.length === expectedFlightIds
    && new Set(flightIds).size === flightIds.length
    && flightIds.every((id) => (
      id.length >= 3
        && id.length <= 100
        && /^[A-Za-z0-9][A-Za-z0-9 :.-]*$/.test(id)
    ));
}

export function safeFlightCheckoutUrl(sourceId: string, value: string | null | undefined) {
  if (!value || value.length > 2000) return null;
  const allowed = SOURCE_CHECKOUT_DOMAINS[sourceId] || [];
  if (allowed.length === 0) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    if (parsed.hostname.endsWith(".")) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (!allowed.some((domain) => domainMatches(hostname, domain))) return null;
    const allowedPaths = SOURCE_CHECKOUT_PATHS[sourceId] || [];
    if (allowedPaths.length && !allowedPaths.includes(parsed.pathname)) return null;
    if (parsed.hash) return null;
    if (sourceId === "enuygun" && !validEnuygunCheckoutQuery(parsed.searchParams)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function flightSourceHasCodeAllowlist(sourceId: string) {
  return (SOURCE_CHECKOUT_DOMAINS[sourceId]?.length || 0) > 0;
}

export function flightSourceRuntimeReady(sourceId: string) {
  const disabled = new Set(String(process.env.FLIGHT_DISABLED_SOURCES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
  return !disabled.has(sourceId)
    && RUNTIME_READY_CONNECTORS.has(sourceId)
    && flightSourceHasCodeAllowlist(sourceId);
}

export function flightSourceVisibleInComparison(sourceId: string) {
  return COMPARISON_CATALOG_SOURCES.has(sourceId);
}
