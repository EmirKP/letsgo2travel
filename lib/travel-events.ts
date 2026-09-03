import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type TravelEventStatus = "scheduled" | "postponed" | "cancelled" | "completed";
export type TravelEventCategory = "concert" | "festival" | "sport" | "culture" | "food" | "family" | "other";

export type TravelEvent = {
  id: string;
  provider: "curated" | "ticketmaster";
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
  updatedAt: string;
};

export type EventSearch = {
  countryCode?: string;
  city?: string;
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

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function httpsUrl(value: unknown) {
  const candidate = text(value, 1200);
  return /^https:\/\//i.test(candidate) ? candidate : null;
}

function categoryFromTicketmaster(event: TicketmasterEvent): TravelEventCategory {
  const classification = event.classifications?.[0];
  const source = `${text(classification?.segment?.name)} ${text(classification?.genre?.name)}`.toLocaleLowerCase("en");
  if (/music|concert/.test(source)) return "concert";
  if (/sport/.test(source)) return "sport";
  if (/family|children/.test(source)) return "family";
  if (/food|drink/.test(source)) return "food";
  if (/arts|theatre|theater|film|museum/.test(source)) return "culture";
  if (/festival/.test(source)) return "festival";
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
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) throw new Error(`ticketmaster_${response.status}`);
  const payload = await response.json() as { _embedded?: { events?: TicketmasterEvent[] } };
  const events = Array.isArray(payload._embedded?.events) ? payload._embedded.events : [];
  return events.flatMap((event) => {
    const id = text(event.id, 160);
    const title = text(event.name, 240);
    const sourceUrl = httpsUrl(event.url);
    const startsAt = text(event.dates?.start?.dateTime, 50) || (text(event.dates?.start?.localDate, 20) ? `${text(event.dates?.start?.localDate, 20)}T12:00:00Z` : "");
    const venue = event._embedded?.venues?.[0];
    if (!id || !title || !sourceUrl || !Number.isFinite(Date.parse(startsAt))) return [];
    const mapped = {
      id: `ticketmaster:${id}`,
      provider: "ticketmaster" as const,
      title,
      description: text(event.info || event.pleaseNote, 1000),
      category: categoryFromTicketmaster(event),
      countryCode: text(venue?.country?.countryCode, 3).toUpperCase(),
      city: text(venue?.city?.name, 120),
      venue: text(venue?.name, 180),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: Number.isFinite(Date.parse(text(event.dates?.end?.dateTime, 50))) ? new Date(text(event.dates?.end?.dateTime, 50)).toISOString() : null,
      status: statusFromTicketmaster(event.dates?.status?.code),
      imageUrl: ticketmasterImage(event),
      ticketUrl: sourceUrl,
      sourceUrl,
      featured: false,
      // Discovery does not expose a reliable modification timestamp. Using
      // the event time keeps client reconciliation stable while still
      // detecting the date changes that affect saved reminders.
      updatedAt: new Date(startsAt).toISOString(),
    };
    return search.category && mapped.category !== search.category ? [] : [mapped];
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

export async function searchTravelEvents(search: EventSearch) {
  const [curatedResult, providerResult] = await Promise.allSettled([
    curatedEvents(search),
    search.featured ? Promise.resolve([]) : ticketmasterEvents(search),
  ]);
  const curated = curatedResult.status === "fulfilled" ? curatedResult.value : [];
  const provider = providerResult.status === "fulfilled" ? providerResult.value : [];
  const events = [...curated, ...provider]
    .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id || (
      candidate.title.toLocaleLowerCase() === event.title.toLocaleLowerCase()
      && candidate.city.toLocaleLowerCase() === event.city.toLocaleLowerCase()
      && candidate.startsAt.slice(0, 10) === event.startsAt.slice(0, 10)
    )) === index)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, search.limit);
  return {
    events,
    providerConfigured: Boolean(process.env.TICKETMASTER_API_KEY),
    partial: curatedResult.status === "rejected" || providerResult.status === "rejected",
  };
}
