import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { validTimeZone, zonedParts } from "./zoned-time";

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
  localDate?: string;
  timeZone?: string | null;
  timePrecision?: "exact" | "date";
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
  query?: string;
  limit: number;
};

type ProviderPageState = { offset: number; endOffset: number; hasMore: boolean; positions: Map<string, number>; limited?: boolean };
const pageState = (offset: number): ProviderPageState => ({ offset, endOffset: offset, hasMore: false, positions: new Map() });

type TicketmasterEvent = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  info?: unknown;
  pleaseNote?: unknown;
  images?: Array<{ url?: unknown; ratio?: unknown; width?: unknown }>;
  dates?: { timezone?: unknown; start?: { dateTime?: unknown; localDate?: unknown; dateTBD?: boolean; dateTBA?: boolean; timeTBA?: boolean; noSpecificTime?: boolean }; end?: { dateTime?: unknown }; status?: { code?: unknown } };
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
  start_local?: unknown;
  timezone?: unknown;
  end?: unknown;
  country?: unknown;
  updated?: unknown;
  state?: unknown;
  deleted_reason?: unknown;
  cancelled?: unknown;
  postponed?: unknown;
  url?: unknown;
  rank?: unknown;
  geo?: { address?: { locality?: unknown } };
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
  if (status === "canceled" || status === "cancelled") return "cancelled";
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

export async function ticketmasterEvents(search: EventSearch, page?: ProviderPageState): Promise<TravelEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey) return [];
  const params = new URLSearchParams({
    apikey: apiKey,
    startDateTime: `${search.startDate}T00:00:00Z`,
    endDateTime: `${search.endDate}T23:59:59Z`,
    size: String(page ? 50 : Math.min(search.limit, 50)),
    sort: search.featured ? "relevance,desc" : "date,asc",
  });
  if (search.countryCode) params.set("countryCode", search.countryCode);
  if (search.query?.trim()) params.set("keyword", search.query.trim());
  if (page) params.set("page", String(Math.floor(page.offset / 50)));
  if (search.city) params.set("city", search.city);
  if (search.category === "concert") params.set("classificationName", "music");
  if (search.category === "sport") params.set("classificationName", "sports");

  const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`ticketmaster_${response.status}`);
  const payload = await response.json() as { _embedded?: { events?: TicketmasterEvent[] }; page?: { number?: number; totalPages?: number }; _links?: { next?: unknown } };
  const events = Array.isArray(payload._embedded?.events) ? payload._embedded.events : [];
  if (page) {
    page.endOffset = Math.floor(page.offset / 50) * 50 + events.length;
    const more = Boolean(payload._links?.next) || (typeof payload.page?.totalPages === 'number' ? Math.floor(page.offset / 50) + 1 < payload.page.totalPages : events.length === 50);
    if (more && !events.length) throw new Error('ticketmaster_empty_page');
    page.hasMore = more && page.endOffset < 1000;
    page.limited = more && page.endOffset >= 1000;
  }
  return events.flatMap((event, index) => {
    const position = page ? Math.floor(page.offset / 50) * 50 + index : index;
    if (page && position < page.offset) return [];
    const id = text(event.id, 160);
    const title = text(event.name, 240);
    const sourceUrl = httpsUrl(event.url);
    const localDate = text(event.dates?.start?.localDate, 20);
    if (event.dates?.start?.dateTBD || event.dates?.start?.dateTBA) return [];
    const instant = validDate(event.dates?.start?.dateTime);
    const exact = Boolean(instant && !event.dates?.start?.timeTBA && !event.dates?.start?.noSpecificTime);
    const timeZone = validTimeZone(event.dates?.timezone) ? event.dates.timezone : null;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(localDate) ? localDate : instant ? zonedParts(Date.parse(instant), timeZone || "UTC").date : "";
    const startsAt = exact ? instant : day;
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
      localDate: day,
      timeZone,
      timePrecision: exact ? "exact" as const : "date" as const,
      endsAt: validDate(event.dates?.end?.dateTime),
      status: statusFromTicketmaster(event.dates?.status?.code),
      imageUrl: ticketmasterImage(event),
      ticketUrl: sourceUrl,
      sourceUrl,
      featured: Boolean(search.featured),
      // Discovery güvenilir bir değişiklik zamanı vermediğinden hatırlatıcı
      // uzlaştırması için etkinlik zamanı kararlı bir sürüm değeri olur.
      updatedAt: startsAt,
    } satisfies TravelEvent;
    if (search.category && mapped.category !== search.category) return [];
    if (search.featured && (mapped.category !== "concert" || mapped.status !== "scheduled")) return [];
    page?.positions.set(mapped.id, position);
    return [mapped];
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
    city: text(event.geo?.address?.locality || locality?.name || (search.placeCode ? search.city : ''), 120),
    venue: text(venue?.name, 180),
  };
}

function eventVerificationUrl(title: string, city: string, startsAt: string) {
  const query = [title, city, startsAt.slice(0, 10), "event"].filter(Boolean).join(" ");
  return `https://www.google.com/search?${new URLSearchParams({ q: query })}`;
}

export async function predictHqEvents(search: EventSearch, page?: ProviderPageState): Promise<TravelEvent[]> {
  const accessToken = process.env.PREDICTHQ_ACCESS_TOKEN?.trim();
  if (!accessToken) return [];
  const params = new URLSearchParams({
    "start.gte": search.startDate,
    "start.lte": search.endDate,
    category: predictHqCategories(search.category),
    limit: String(page ? 50 : Math.min(search.limit, 50)),
    sort: "start",
    "brand_unsafe.exclude": "true",
    "private.include": "false",
  });
  if (search.query?.trim()) params.set("q", search.query.trim());
  if (page) params.set("offset", String(page.offset));
  const kosovoSearch = search.countryCode?.toUpperCase() === "XK";
  // PredictHQ ülke filtresi resmî ISO-3166 alpha-2 bekler. Kosova için
  // yaygın kullanılan XK atanmış bir ISO kodu olmadığından ülke filtresi
  // yerine desteklenen PRN IATA kapsamını kullanırız.
  if (search.countryCode && !kosovoSearch) params.set("country", search.countryCode);
  if (search.placeCode || kosovoSearch) params.set("place.scope", search.placeCode || "PRN");
  if (search.featured) {
    params.set("category", "concerts");
    params.set("rank.gte", "55");
    // PredictHQ rank sorts highest first; unlike dates, -rank reverses to lowest first.
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
  const payload = await response.json() as { results?: PredictHqEvent[]; next?: string | null; overflow?: boolean };
  const events = Array.isArray(payload.results) ? payload.results : [];
  if (page) {
    if (payload.next && !events.length) throw new Error('predicthq_empty_page');
    page.endOffset = page.offset + events.length; page.hasMore = Boolean(payload.next); page.limited = payload.overflow === true;
  }

  return events.flatMap((event, index) => {
    const id = text(event.id, 160);
    const title = text(event.title, 240);
    const startsAt = validDate(event.start);
    if (!id || !title || !startsAt) return [];
    const category = categoryFromPredictHq(event, search.featured ? "concert" : search.category);
    if (search.category && category !== search.category) return [];
    const location = predictHqLocation(event, search);
    // A typed city has no airport scope. Never relabel unrelated countrywide
    // results with the requested city, including records without a locality.
    if (search.city && !search.placeCode && normalizedEventText(location.city) !== normalizedEventText(search.city)) return [];
    const rank = impactRank(event.rank);
    if (search.featured && (rank === null || rank < 55)) return [];
    const directUrl = httpsUrl(event.url);
    const sourceUrl = directUrl || eventVerificationUrl(title, location.city, startsAt);
    const timeZone = validTimeZone(event.timezone) ? event.timezone : null;
    const local = timeZone ? zonedParts(Date.parse(startsAt), timeZone) : { date: text(event.start_local || event.start, 40).slice(0, 10), time: "00:00:00" };
    const exact = Boolean(timeZone && event.state !== "predicted" && local.time !== "00:00:00");
    page?.positions.set(`predicthq:${id}`, (page?.offset || 0) + index);
    return [{
      id: `predicthq:${id}`,
      provider: "predicthq" as const,
      title,
      description: text(event.description, 1000),
      category,
      countryCode: kosovoSearch ? "XK" : text(event.country || search.countryCode, 3).toUpperCase(),
      city: location.city,
      venue: location.venue,
      startsAt: exact ? startsAt : local.date,
      localDate: local.date,
      timeZone,
      timePrecision: exact ? "exact" as const : "date" as const,
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

export async function curatedEvents(search: EventSearch, page?: ProviderPageState): Promise<TravelEvent[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  let query = supabase
    .from("travel_events")
    .select("id,provider,title,description,category,country_code,city,venue,starts_at,ends_at,status,image_url,ticket_url,source_url,featured,updated_at")
    .eq("published", true)
    .gte("starts_at", `${search.startDate}T00:00:00Z`)
    .lte("starts_at", `${search.endDate}T23:59:59Z`)
    .order("starts_at", { ascending: true });
  query = page ? query.order('id', { ascending: true }).range(page.offset, page.offset + 49) : query.limit(search.limit);
  if (search.countryCode) query = query.eq("country_code", search.countryCode);
  if (search.city) query = query.ilike("city", `%${search.city.replace(/[%_]/g, "")}%`);
  if (search.category) query = query.eq("category", search.category);
  if (search.featured) query = query.eq("featured", true);
  const keyword = search.query?.replace(/[%_(),."\\]/g, ' ').trim().slice(0, 120);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,venue.ilike.%${keyword}%`);
  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
  if (page) { page.endOffset = page.offset + (data?.length || 0); page.hasMore = data?.length === 50; }
  return (data || []).map((item, index) => {
    page?.positions.set(String(item.id), (page?.offset || 0) + index);
    return ({
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
    localDate: String(item.starts_at).slice(0, 10),
    timeZone: "UTC",
    timePrecision: "exact" as const,
    endsAt: item.ends_at ? String(item.ends_at) : null,
    status: item.status as TravelEventStatus,
    imageUrl: httpsUrl(item.image_url),
    ticketUrl: httpsUrl(item.ticket_url),
    sourceUrl: httpsUrl(item.source_url) || "https://www.letsgo2travel.com.tr",
    featured: Boolean(item.featured),
    updatedAt: String(item.updated_at),
  }); });
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
    // A failed or empty impact feed must not disable the independently working
    // concert catalogue. Discovery supplies its own relevance order, not PHQ rank.
    if (!events.length && ticketmasterConfigured && ticketmasterEligible) {
      providers.ticketmaster.attempted = true;
      try {
        events = await ticketmasterEvents({ ...search, category: "concert" });
        providers.ticketmaster.succeeded = true;
      } catch {
        partial = true;
      }
    }
    return {
      events,
      providers,
      fallbackUsed: providers.ticketmaster.attempted,
      coverageLimited: !providers.predicthq.succeeded && !providers.ticketmaster.succeeded,
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
    .replace(/[^\p{L}\p{N}]+/gu, " ")
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

type EventPageCursor = { v: 1; scope: string; curated: number; automatic: number; provider: 'ticketmaster' | 'predicthq' | 'none'; unavailable?: boolean };

/** Public, stateless offsets only. A cursor never contains event facts or an
 * upstream URL; every page is fetched again through the same source filters. */
export async function searchTravelEventPage(search: EventSearch, rawCursor?: string) {
  const scope = JSON.stringify([search.countryCode || '', search.city || '', search.placeCode || '', search.startDate, search.endDate, search.category || '', search.query?.trim() || '', search.limit]);
  let cursor: EventPageCursor | null = null;
  if (rawCursor) {
    try {
      const value = JSON.parse(decodeURIComponent(rawCursor)) as EventPageCursor;
      if (value.v !== 1 || value.scope !== scope || !['ticketmaster', 'predicthq', 'none'].includes(value.provider)
        || value.unavailable !== undefined && typeof value.unavailable !== 'boolean'
        || ![value.curated, value.automatic].every(offset => Number.isInteger(offset) && offset >= -1 && offset <= 10000)
        || value.provider === 'ticketmaster' && value.automatic >= 1000) throw Error();
      cursor = value;
    } catch { throw new Error('event_cursor_invalid'); }
  }
  const providers = {
    ticketmaster: { configured: Boolean(process.env.TICKETMASTER_API_KEY?.trim()), attempted: false, succeeded: false },
    predicthq: { configured: Boolean(process.env.PREDICTHQ_ACCESS_TOKEN?.trim()), attempted: false, succeeded: false },
  };
  const curatedPage = pageState(cursor?.curated ?? 0), automaticPage = pageState(cursor?.automatic ?? 0);
  let provider: EventPageCursor['provider'] = cursor?.provider || 'none';
  let partial = false, fallbackUsed = false;
  const readAutomatic = async () => {
    if (cursor?.automatic === -1) return [];
    const read = async (source: 'ticketmaster' | 'predicthq') => {
      if (!providers[source].configured) throw new Error('event_provider_unavailable');
      providers[source].attempted = true;
      const events = await (source === 'ticketmaster' ? ticketmasterEvents : predictHqEvents)(search, automaticPage);
      providers[source].succeeded = true;
      provider = source;
      return events;
    };
    if (cursor) return cursor.provider === 'none' ? [] : read(cursor.provider);
    if (providers.ticketmaster.configured && ticketmasterSupportsCountry(search.countryCode)) {
      try {
        const events = await read('ticketmaster');
        if (events.length || automaticPage.hasMore || !providers.predicthq.configured) return events;
      } catch { partial = true; }
    }
    if (providers.predicthq.configured) {
      fallbackUsed = true;
      automaticPage.positions.clear(); automaticPage.endOffset = 0; automaticPage.hasMore = false; automaticPage.limited = false;
      return read('predicthq');
    }
    if (Object.values(providers).some(item => item.attempted) && !Object.values(providers).some(item => item.succeeded)) throw new Error('event_provider_unavailable');
    return [];
  };
  const [curatedResult, automaticResult] = await Promise.allSettled([
    cursor?.curated === -1 ? Promise.resolve([] as TravelEvent[]) : curatedEvents(search, curatedPage),
    readAutomatic(),
  ]);
  // Later pages cannot silently change provider, drop a failed source's offset,
  // or erase the already displayed list. The client can retry the same cursor.
  const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
  const unavailable = automaticResult.status === 'rejected' || cursor?.unavailable === true;
  if (automaticResult.status === 'rejected' && (cursor || !curated.length)) throw new Error('event_provider_unavailable');
  if (automaticResult.status === 'rejected') { partial = true; provider = 'none'; }
  const automatic = automaticResult.status === 'fulfilled' ? automaticResult.value : [];
  if (curatedResult.status === 'rejected' && !automatic.length) throw new Error('event_provider_unavailable');
  if (curatedResult.status === 'rejected') { partial = true; curatedPage.hasMore = true; }
  const lists = [curated, automatic], consumed = [0, 0], events: TravelEvent[] = [];
  while (events.length < search.limit && (consumed[0] < curated.length || consumed[1] < automatic.length)) {
    const left = curated[consumed[0]], right = automatic[consumed[1]];
    const source = !right || left && left.startsAt.localeCompare(right.startsAt) <= 0 ? 0 : 1;
    const event = lists[source][consumed[source]++];
    if (!events.some(previous => sameEvent(previous, event))) events.push(event);
  }
  const advance = (items: TravelEvent[], state: ProviderPageState, index: number) => {
    if (state.offset === -1) return -1;
    if (index < items.length) return state.positions.get(items[index].id) ?? state.offset;
    return state.hasMore ? state.endOffset : -1;
  };
  const nextCurated = advance(curated, curatedPage, consumed[0]);
  const nextAutomatic = provider === 'none' ? -1 : advance(automatic, automaticPage, consumed[1]);
  const atSafetyLimit = nextCurated >= 10000 || nextAutomatic >= 10000;
  const next: EventPageCursor = { v: 1, scope, curated: nextCurated >= 10000 ? -1 : nextCurated, automatic: nextAutomatic >= 10000 ? -1 : nextAutomatic, provider, ...(unavailable ? { unavailable: true } : {}) };
  const providerConfigured = Object.values(providers).some(item => item.configured);
  const succeeded = Object.values(providers).some(item => item.succeeded) || Boolean(cursor && provider !== 'none');
  const coverageLimited = unavailable || !succeeded;
  return {
    events, providerConfigured, providers, fallbackUsed, partial: partial || unavailable,
    coverageLimited,
    coverageStatus: unavailable ? 'provider_unavailable' : !providerConfigured ? 'not_configured' : coverageLimited ? 'limited' : events.length || next.automatic !== -1 ? 'live' : 'no_results',
    nextCursor: next.curated === -1 && next.automatic === -1 ? null : encodeURIComponent(JSON.stringify(next)),
    paginationLimited: Boolean(automaticPage.limited || atSafetyLimit),
  };
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
      ? (b.impactRank || 0) - (a.impactRank || 0)
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
