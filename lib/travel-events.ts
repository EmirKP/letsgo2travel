import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type TravelEventStatus = "scheduled" | "postponed" | "cancelled" | "completed";
export type TravelEventCategory = "concert" | "festival" | "sport" | "culture" | "food" | "family" | "other";
export type TravelEventProvider = "curated" | "ticketmaster" | "predicthq";

export type TravelEvent = {
  id: string;
  provider: TravelEventProvider;
  title: string;
  description: string;
  category: TravelEventCategory;
  countryCode: string;
  city: string;
  venue: string;
  startsAt: string;
  endsAt: string | null;
  status: TravelEventStatus;
  imageUrl: string | null;
  ticketUrl: string | null;
  sourceUrl: string;
  featured: boolean;
  impactRank?: number | null;
  updatedAt: string;
};

export type EventSearch = {
  countryCode?: string;
  city?: string;
  placeCode?: string;
  startDate: string;
  endDate: string;
  category?: TravelEventCategory;
  featured?: boolean;
  limit: number;
};

type TicketmasterEvent = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  info?: unknown;
  pleaseNote?: unknown;
  images?: Array<{ url?: unknown; ratio?: unknown; width?: unknown }>;
  dates?: { start?: { dateTime?: unknown; localDate?: unknown }; end?: { dateTime?: unknown }; status?: { code?: unknown } };
  classifications?: Array<{ segment?: { name?: unknown }; genre?: { name?: unknown } }>;
  _embedded?: { venues?: Array<{ name?: unknown; city?: { name?: unknown }; country?: { countryCode?: unknown } }> };
};

type PredictHqEntity = {
  entity_id?: unknown;
  name?: unknown;
  type?: unknown;
  formatted_address?: unknown;
};

type PredictHqEvent = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  labels?: unknown;
  start?: unknown;
  end?: unknown;
  country?: unknown;
  updated?: unknown;
  state?: unknown;
  deleted_reason?: unknown;
  cancelled?: unknown;
  postponed?: unknown;
  url?: unknown;
  rank?: unknown;
  entities?: PredictHqEntity[];
};

type ProviderState = {
  configured: boolean;
  attempted: boolean;
  succeeded: boolean;
};

type AutomaticProviderResult = {
  events: TravelEvent[];
  providers: {
    ticketmaster: ProviderState;
    predicthq: ProviderState;
  };
  fallbackUsed: boolean;
  coverageLimited: boolean;
  partial: boolean;
};

// Ticketmaster Discovery API'nin resmî "Supported Country Codes" listesi.
// Ülke bu kümede değilse boşuna kota harcamadan küresel yedek sağlayıcıya
// geçilir. Kümede olsa bile sıfır sonuçta yine otomatik fallback çalışır.
const TICKETMASTER_COUNTRIES = new Set([
  "AD", "AE", "AI", "AN", "AR", "AT", "AU", "AZ", "BB", "BE", "BG", "BH", "BM", "BR", "BS",
  "CA", "CH", "CL", "CN", "CO", "CR", "CY", "CZ", "DE", "DK", "DO", "EC", "EE", "ES", "FI",
  "FO", "FR", "GB", "GE", "GH", "GI", "GR", "HK", "HR", "HU", "IE", "IL", "IN", "IS", "IT",
  "JM", "JP", "KR", "LB", "LC", "LT", "LU", "LV", "MA", "MC", "ME", "MT", "MX", "MY", "ND",
  "NL", "NO", "NZ", "PE", "PL", "PT", "RO", "RS", "RU", "SA", "SE", "SG", "SI", "SK", "TH",
  "TR", "TT", "TW", "UA", "US", "UY", "VE", "ZA",
]);

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function httpsUrl(value: unknown) {
  const candidate = text(value, 1200);
  return /^https:\/\//i.test(candidate) ? candidate : null;
}

function validDate(value: unknown) {
  const candidate = text(value, 50);
  return Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 100)).filter(Boolean)
    : [];
}

function impactRank(value: unknown) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank >= 0 && rank <= 100 ? Math.round(rank) : null;
}

function categoryFromTicketmaster(event: TicketmasterEvent): TravelEventCategory {
  const classification = event.classifications?.[0];
  const source = `${text(classification?.segment?.name)} ${text(classification?.genre?.name)}`.toLocaleLowerCase("en");
  if (/festival/.test(source)) return "festival";
  if (/music|concert/.test(source)) return "concert";
  if (/sport/.test(source)) return "sport";
  if (/family|children/.test(source)) return "family";
  if (/food|drink/.test(source)) return "food";
  if (/arts|theatre|theater|film|museum/.test(source)) return "culture";
  return "other";
}

function statusFromTicketmaster(value: unknown): TravelEventStatus {
  const status = text(value, 30).toLocaleLowerCase("en");
  if (status === "cancelled") return "cancelled";
  if (status === "postponed" || status === "rescheduled") return "postponed";
  return "scheduled";
}

function ticketmasterImage(event: TicketmasterEvent) {
  const images = Array.isArray(event.images) ? event.images : [];
  const preferred = images
    .filter((item) => httpsUrl(item.url))
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))
    .find((item) => item.ratio === "16_9") || images.find((item) => httpsUrl(item.url));
  return httpsUrl(preferred?.url);
}

export function ticketmasterSupportsCountry(countryCode?: string) {
  return !countryCode || TICKETMASTER_COUNTRIES.has(countryCode.toUpperCase());
}

export async function ticketmasterEvents(search: EventSearch): Promise<TravelEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey) return [];
  const params = new URLSearchParams({
    apikey: apiKey,
    startDateTime: `${search.startDate}T00:00:00Z`,
    endDateTime: `${search.endDate}T23:59:59Z`,
    size: String(Math.min(search.limit, 50)),
    sort: "date,asc",
  });
  if (search.countryCode) params.set("countryCode", search.countryCode);
  if (search.city) params.set("city", search.city);
  if (search.category === "concert") params.set("classificationName", "music");
  if (search.category === "sport") params.set("classificationName", "sports");

  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`ticketmaster_${response.status}`);
  const payload = await response.json() as { _embedded?: { events?: TicketmasterEvent[] } };
  const events = Array.isArray(payload._embedded?.events) ? payload._embedded.events : [];
  return events.flatMap((event) => {
    const id = text(event.id, 160);
    const title = text(event.name, 240);
    const sourceUrl = httpsUrl(event.url);
    const localDate = text(event.dates?.start?.localDate, 20);
    const startsAt = validDate(event.dates?.start?.dateTime) || (localDate ? validDate(`${localDate}T12:00:00Z`) : null);
    const venue = event._embedded?.venues?.[0];
    if (!id || !title || !sourceUrl || !startsAt) return [];
    const mapped = {
      id: `ticketmaster:${id}`,
      provider: "ticketmaster" as const,
      title,
      description: text(event.info || event.pleaseNote, 1000),
      category: categoryFromTicketmaster(event),
      countryCode: text(venue?.country?.countryCode, 3).toUpperCase(),
      city: text(venue?.city?.name, 120),
      venue: text(venue?.name, 180),
      startsAt,
      endsAt: validDate(event.dates?.end?.dateTime),
      status: statusFromTicketmaster(event.dates?.status?.code),
      imageUrl: ticketmasterImage(event),
      ticketUrl: sourceUrl,
      sourceUrl,
      featured: false,
      // Discovery güvenilir bir değişiklik zamanı vermediğinden hatırlatıcı
      // uzlaştırması için etkinlik zamanı kararlı bir sürüm değeri olur.
      updatedAt: startsAt,
    } satisfies TravelEvent;
    return search.category && mapped.category !== search.category ? [] : [mapped];
  });
}

function predictHqCategories(category?: TravelEventCategory) {
  switch (category) {
    case "concert": return "concerts";
    case "festival": return "festivals";
    case "sport": return "sports";
    case "culture": return "performing-arts,expos,conferences";
    case "food": return "community,festivals,expos";
    case "family": return "community,festivals,performing-arts";
    default: return "concerts,festivals,performing-arts,community,sports,conferences,expos";
  }
}

function categoryFromPredictHq(event: PredictHqEvent, requested?: TravelEventCategory): TravelEventCategory {
  const category = text(event.category, 80).toLocaleLowerCase("en");
  const labels = stringList(event.labels).join(" ").toLocaleLowerCase("en");
  if (requested === "food" && /food|drink|beverage|culinary/.test(labels)) return "food";
  if (requested === "family" && /family|children|kids/.test(labels)) return "family";
  if (category === "concerts") return "concert";
  if (category === "festivals") return "festival";
  if (category === "sports") return "sport";
  if (/food|drink|beverage|culinary/.test(labels)) return "food";
  if (/family|children|kids/.test(labels)) return "family";
  if (["performing-arts", "expos", "conferences"].includes(category)) return "culture";
  return "other";
}

function statusFromPredictHq(event: PredictHqEvent): TravelEventStatus {
  const state = text(event.state, 40).toLocaleLowerCase("en");
  const deletedReason = text(event.deleted_reason, 80).toLocaleLowerCase("en");
  if (event.cancelled || deletedReason === "cancelled" || state === "cancelled") return "cancelled";
  if (event.postponed || state === "postponed") return "postponed";
  return "scheduled";
}

function predictHqLocation(event: PredictHqEvent, search: EventSearch) {
  const entities = Array.isArray(event.entities) ? event.entities : [];
  const venue = entities.find((entity) => text(entity.type, 40).toLocaleLowerCase("en") === "venue");
  const locality = entities.find((entity) => ["locality", "city"].includes(text(entity.type, 40).toLocaleLowerCase("en")));
  return {
    city: text(search.city || locality?.name, 120),
    venue: text(venue?.name, 180),
  };
}

function eventVerificationUrl(title: string, city: string, startsAt: string) {
  const query = [title, city, startsAt.slice(0, 10), "event"].filter(Boolean).join(" ");
  return `https://www.google.com/search?${new URLSearchParams({ q: query })}`;
}

export async function predictHqEvents(search: EventSearch): Promise<TravelEvent[]> {
  const accessToken = process.env.PREDICTHQ_ACCESS_TOKEN?.trim();
  if (!accessToken) return [];
  const params = new URLSearchParams({
    "start.gte": search.startDate,
    "start.lte": search.endDate,
    category: predictHqCategories(search.category),
    limit: String(Math.min(search.limit, 50)),
    sort: "start",
    "brand_unsafe.exclude": "true",
    "private.include": "false",
  });
  const kosovoSearch = search.countryCode?.toUpperCase() === "XK";
  // PredictHQ ülke filtresi resmî ISO-3166 alpha-2 bekler. Kosova için
  // yaygın kullanılan XK atanmış bir ISO kodu olmadığından ülke filtresi
  // yerine desteklenen PRN IATA kapsamını kullanırız.
  if (search.countryCode && !kosovoSearch) params.set("country", search.countryCode);
  if (search.placeCode || kosovoSearch) params.set("place.scope", search.placeCode || "PRN");
  if (search.featured) {
    params.set("category", "concerts");
    params.set("rank.gte", "55");
    // PredictHQ'da `rank` en yüksek etki puanını önce getirir.
    params.set("sort", "rank,start");
  }

  const response = await fetch(`https://api.predicthq.com/v1/events/?${params}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(6_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`predicthq_${response.status}`);
  const payload = await response.json() as { results?: PredictHqEvent[] };
  const events = Array.isArray(payload.results) ? payload.results : [];

  return events.flatMap((event) => {
    const id = text(event.id, 160);
    const title = text(event.title, 240);
    const startsAt = validDate(event.start);
    if (!id || !title || !startsAt) return [];
    const category = categoryFromPredictHq(event, search.featured ? "concert" : search.category);
    if (search.category && category !== search.category) return [];
    const location = predictHqLocation(event, search);
    const rank = impactRank(event.rank);
    if (search.featured && (rank === null || rank < 55)) return [];
    const directUrl = httpsUrl(event.url);
    const sourceUrl = directUrl || eventVerificationUrl(title, location.city, startsAt);
    return [{
      id: `predicthq:${id}`,
      provider: "predicthq" as const,
      title,
      description: text(event.description, 1000),
      category,
      countryCode: kosovoSearch ? "XK" : text(event.country || search.countryCode, 3).toUpperCase(),
      city: location.city,
      venue: location.venue,
      startsAt,
      endsAt: validDate(event.end),
      status: statusFromPredictHq(event),
      imageUrl: null,
      ticketUrl: null,
      sourceUrl,
      featured: search.featured ? rank !== null && rank >= 55 : false,
      impactRank: rank,
      updatedAt: validDate(event.updated) || startsAt,
    } satisfies TravelEvent];
  });
}

export async function curatedEvents(search: EventSearch): Promise<TravelEvent[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase
    .from("travel_events")
    .select("id,provider,title,description,category,country_code,city,venue,starts_at,ends_at,status,image_url,ticket_url,source_url,featured,updated_at")
    .eq("published", true)
    .gte("starts_at", `${search.startDate}T00:00:00Z`)
    .lte("starts_at", `${search.endDate}T23:59:59Z`)
    .order("starts_at", { ascending: true })
    .limit(search.limit);
  if (search.countryCode) query = query.eq("country_code", search.countryCode);
  if (search.city) query = query.ilike("city", `%${search.city.replace(/[%_]/g, "")}%`);
  if (search.category) query = query.eq("category", search.category);
  if (search.featured) query = query.eq("featured", true);
  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  return (data || []).map((item) => ({
    id: String(item.id),
    // Haricî sağlayıcı sonuçları veritabanına yazılmaz. Eski/veri dışı bir
    // değer görülürse güvenli biçimde editoryal kayıt kabul edilir.
    provider: item.provider === "ticketmaster" ? "ticketmaster" : "curated",
    title: text(item.title, 240),
    description: text(item.description, 1000),
    category: item.category as TravelEventCategory,
    countryCode: text(item.country_code, 3),
    city: text(item.city, 120),
    venue: text(item.venue, 180),
    startsAt: String(item.starts_at),
    endsAt: item.ends_at ? String(item.ends_at) : null,
    status: item.status as TravelEventStatus,
    imageUrl: httpsUrl(item.image_url),
    ticketUrl: httpsUrl(item.ticket_url),
    sourceUrl: httpsUrl(item.source_url) || "https://www.letsgo2travel.com.tr",
    featured: Boolean(item.featured),
    updatedAt: String(item.updated_at),
  }));
}

async function automaticProviderEvents(search: EventSearch): Promise<AutomaticProviderResult> {
  const ticketmasterConfigured = Boolean(process.env.TICKETMASTER_API_KEY?.trim());
  const predicthqConfigured = Boolean(process.env.PREDICTHQ_ACCESS_TOKEN?.trim());
  const ticketmasterEligible = ticketmasterSupportsCountry(search.countryCode);
  const providers = {
    ticketmaster: { configured: ticketmasterConfigured, attempted: false, succeeded: false },
    predicthq: { configured: predicthqConfigured, attempted: false, succeeded: false },
  };
  let events: TravelEvent[] = [];
  let partial = false;

  if (search.featured) {
    if (predicthqConfigured) {
      providers.predicthq.attempted = true;
      try {
        events = await predictHqEvents({ ...search, category: "concert" });
        providers.predicthq.succeeded = true;
      } catch {
        partial = true;
      }
    }
    return {
      events,
      providers,
      fallbackUsed: false,
      coverageLimited: !predicthqConfigured || !providers.predicthq.succeeded,
      partial,
    };
  }

  if (ticketmasterConfigured && ticketmasterEligible) {
    providers.ticketmaster.attempted = true;
    try {
      events = await ticketmasterEvents(search);
      providers.ticketmaster.succeeded = true;
    } catch {
      partial = true;
    }
  }

  const needsFallback = events.length === 0;
  if (needsFallback && predicthqConfigured) {
    providers.predicthq.attempted = true;
    try {
      events = await predictHqEvents(search);
      providers.predicthq.succeeded = true;
    } catch {
      partial = true;
    }
  }

  return {
    events,
    providers,
    fallbackUsed: providers.predicthq.attempted,
    coverageLimited: needsFallback && (!predicthqConfigured || !providers.predicthq.succeeded),
    partial,
  };
}

function normalizedEventText(value: string) {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameEvent(left: TravelEvent, right: TravelEvent) {
  if (left.id === right.id) return true;
  if (normalizedEventText(left.title) !== normalizedEventText(right.title)) return false;
  if (left.startsAt.slice(0, 10) !== right.startsAt.slice(0, 10)) return false;
  if (left.countryCode && right.countryCode && left.countryCode !== right.countryCode) return false;
  const leftCity = normalizedEventText(left.city);
  const rightCity = normalizedEventText(right.city);
  return !leftCity || !rightCity || leftCity === rightCity;
}

export async function searchTravelEvents(search: EventSearch) {
  const emptyAutomatic: AutomaticProviderResult = {
    events: [],
    providers: {
      ticketmaster: { configured: Boolean(process.env.TICKETMASTER_API_KEY?.trim()), attempted: false, succeeded: false },
      predicthq: { configured: Boolean(process.env.PREDICTHQ_ACCESS_TOKEN?.trim()), attempted: false, succeeded: false },
    },
    fallbackUsed: false,
    coverageLimited: false,
    partial: true,
  };
  const [curatedResult, providerResult] = await Promise.allSettled([
    curatedEvents(search),
    automaticProviderEvents(search),
  ]);
  const curated = curatedResult.status === "fulfilled" ? curatedResult.value : [];
  const automatic = providerResult.status === "fulfilled" ? providerResult.value : emptyAutomatic;
  const events = [...curated, ...automatic.events]
    .filter((event, index, all) => all.findIndex((candidate) => sameEvent(candidate, event)) === index)
    .sort((a, b) => search.featured
      ? (b.impactRank || 0) - (a.impactRank || 0) || a.startsAt.localeCompare(b.startsAt)
      : a.startsAt.localeCompare(b.startsAt))
    .slice(0, search.limit);
  const providerStates = Object.values(automatic.providers);
  const attempted = providerStates.some((provider) => provider.attempted);
  const succeeded = providerStates.some((provider) => provider.succeeded);
  const providerConfigured = providerStates.some((provider) => provider.configured);
  const coverageStatus = !providerConfigured
    ? "not_configured"
    : automatic.coverageLimited
      ? attempted && !succeeded ? "provider_unavailable" : "limited"
      : events.length ? "live" : "no_results";
  return {
    events,
    providerConfigured,
    providers: automatic.providers,
    fallbackUsed: automatic.fallbackUsed,
    coverageLimited: automatic.coverageLimited,
    coverageStatus,
    partial: curatedResult.status === "rejected" || providerResult.status === "rejected" || automatic.partial,
  };
}
