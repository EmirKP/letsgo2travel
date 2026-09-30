import { ApiError, requestJson } from "./api";
import { config, isSupabaseConfigured } from "./config";
import { localIsoDate } from "./dates";
import { localeFromStorage } from "./i18n";
import { createId } from "./id";
import type { TravelEvent } from "../types";
import type { FlightMatch } from "../../../lib/flight-lookup";
import { activeFlightExpiry, parseFlightMatch } from "./flightSelection";

export type SupabaseDataErrorCode =
  | "not_configured"
  | "not_authenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid_data"
  | "network"
  | "service_unavailable";

const ERROR_MESSAGES: Record<SupabaseDataErrorCode, string> = {
  not_configured: "Veri bağlantısı henüz yapılandırılmamış.",
  not_authenticated: "Bu işlem için hesabına giriş yapmalısın.",
  forbidden: "Bu kayda erişim iznin bulunmuyor.",
  not_found: "İstenen kayıt bulunamadı veya artık kullanılamıyor.",
  conflict: "Kayıt başka bir yerde değişti. Yenileyip tekrar dene.",
  invalid_data: "Gönderilen bilgiler geçerli değil.",
  network: "Sunucuya bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
  service_unavailable: "Veri servisi şu anda kullanılamıyor. Biraz sonra tekrar dene.",
};

const ERROR_MESSAGES_EN: Record<SupabaseDataErrorCode, string> = {
  not_configured: "The data connection has not been configured yet.",
  not_authenticated: "Sign in to your account to do this.",
  forbidden: "You do not have permission to access this item.",
  not_found: "The requested item was not found or is no longer available.",
  conflict: "This item changed elsewhere. Refresh and try again.",
  invalid_data: "The submitted information is not valid.",
  network: "Could not connect to the server. Check your connection and try again.",
  service_unavailable: "The data service is currently unavailable. Try again shortly.",
};

const ERROR_MESSAGES_SQ: Record<SupabaseDataErrorCode, string> = {
  "not_configured": "Lidhja e të dhënave nuk është konfiguruar ende.",
  "not_authenticated": "Hyr në llogarinë tënde për këtë veprim.",
  "forbidden": "Nuk ke leje për të parë këtë regjistrim.",
  "not_found": "Regjistrimi i kërkuar nuk u gjet ose nuk është më i disponueshëm.",
  "conflict": "Ky regjistrim ka ndryshuar diku tjetër. Rifresko dhe provo sërish.",
  "invalid_data": "Të dhënat e dërguara nuk janë të vlefshme.",
  "network": "Nuk u lidhëm me serverin. Kontrollo lidhjen dhe provo sërish.",
  "service_unavailable": "Shërbimi i të dhënave nuk është i disponueshëm për momentin. Provo pas pak."
};

export class SupabaseDataError extends Error {
  readonly code: SupabaseDataErrorCode;
  readonly status: number;

  constructor(code: SupabaseDataErrorCode, status = 0) {
    super(ERROR_MESSAGES[code]);
    this.name = "SupabaseDataError";
    this.code = code;
    this.status = status;
  }
}

export function getSupabaseDataErrorMessage(error: unknown, fallback?: string) {
  const locale = localeFromStorage();
  const messages = locale === "sq" ? ERROR_MESSAGES_SQ : locale === "en" ? ERROR_MESSAGES_EN : ERROR_MESSAGES;
  if (!(error instanceof SupabaseDataError)) return fallback ?? messages.service_unavailable;
  return messages[error.code];
}

export type UserProfileData = {
  id: string;
  username: string | null;
  wishlistCountries: string[];
  visitedCountries: string[];
  optInLeaderboard: boolean;
};

export type UserProfileUpdate = {
  username?: string;
  wishlistCountries?: string[];
  visitedCountries?: string[];
  optInLeaderboard?: boolean;
};

export type UserTripData = {
  id: number | string;
  userId: string;
  title: string;
  destination: string;
  tripData: Record<string, unknown>;
  mobileKind: string | null;
  clientKey: string | null;
  createdAt: string;
};

export type UserTripUpsertInput = {
  title: string;
  destination: string;
  mobileKind: string;
  clientKey: string;
  tripData: Record<string, unknown>;
};

export type TripStatus = "upcoming" | "active" | "completed" | "cancelled";
export type ChecklistCategory = "documents" | "health" | "technology" | "luggage" | "other";

export type ChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  category: ChecklistCategory;
  createdAt: string;
  kind?: "checklist" | "event";
  eventId?: string;
  eventStartsAt?: string;
  eventLocalDate?: string;
  eventTimeZone?: string | null;
  eventTimePrecision?: "exact" | "date";
  eventCity?: string;
  eventVenue?: string;
  eventCountryCode?: string;
  eventSourceUrl?: string;
};

export type CockpitTrip = {
  id: string;
  userId: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string | null;
  startDate: string;
  endDate: string;
  departureAt: string | null;
  arrivalAt: string | null;
  appLanguage: "tr" | "en" | "sq";
  flightPnr: string | null;
  originIata: string | null;
  destinationIata: string | null;
  airline: string | null;
  flightNumber: string | null;
  checklistItems: ChecklistItem[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
  flightLookupManaged?: boolean;
  flightLookupExpiresAt?: string | null;
  /** Cockpit-only, short-lived display data. Never merge into the stored base. */
  providerFlight?: FlightMatch;
};

export type CreateCockpitTripInput = {
  flightSelectionReceipt?: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity?: string;
  startDate: string;
  endDate: string;
  departureAt?: string | null;
  arrivalAt?: string | null;
  appLanguage?: "tr" | "en" | "sq";
  flightPnr?: string;
  originIata?: string;
  destinationIata?: string;
  airline?: string;
  flightNumber?: string;
  checklistItems?: ChecklistItem[];
};

export type UpdateCockpitTripInput = Partial<CreateCockpitTripInput> & {
  status?: TripStatus;
};

type ProfileRow = {
  id?: unknown;
  username?: unknown;
  wishlist_countries?: unknown;
  visited_countries?: unknown;
  opt_in_leaderboard?: unknown;
};

type UserTripRow = {
  id?: unknown;
  user_id?: unknown;
  title?: unknown;
  destination?: unknown;
  trip_data?: unknown;
  created_at?: unknown;
};

type TripRow = {
  flight_lookup_managed?: unknown;
  flight_lookup_expires_at?: unknown;
  id?: unknown;
  user_id?: unknown;
  destination_country?: unknown;
  destination_code?: unknown;
  destination_city?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  departure_at?: unknown;
  arrival_at?: unknown;
  app_language?: unknown;
  flight_pnr?: unknown;
  origin_iata?: unknown;
  destination_iata?: unknown;
  airline?: unknown;
  flight_number?: unknown;
  checklist_items?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const TRIP_BASE_COLUMNS = [
  "id",
  "user_id",
  "destination_country",
  "destination_code",
  "destination_city",
  "start_date",
  "end_date",
  "departure_at",
  "flight_pnr",
  "checklist_items",
  "status",
  "created_at",
  "updated_at",
];
// 20260902100000_cockpit_flight_fields.sql migration'ının eklediği sütunlar.
const TRIP_FLIGHT_COLUMNS = ["origin_iata", "destination_iata", "airline", "flight_number", "arrival_at", "app_language"];
const TRIP_LOOKUP_COLUMNS = ["flight_lookup_managed", "flight_lookup_expires_at"];
let lookupColumnsSupported = true;

// GÜVENLİ DAĞITIM SIRASI: uygulama, migration üretime uygulanmadan da
// çalışmalı. İlk 42703 (undefined column) yanıtında bu bayrak kapanır;
// SELECT eski sütun listesine döner, INSERT/UPDATE yeni alanları yazmaz.
// Migration uygulandıktan sonra uygulama yeniden açıldığında alanlar
// otomatik devreye girer. (Bayrak oturumluk; kalıcı durum tutulmaz.)
let flightColumnsSupported = true;

/** Uçuş alanı sütunları bu oturumda kullanılabilir mi? (UI notu için) */
export function areFlightFieldsSupported() {
  return flightColumnsSupported;
}

function isUndefinedColumnError(error: unknown) {
  return error instanceof ApiError && error.code === "42703";
}

function tripSelect() {
  return [...TRIP_BASE_COLUMNS, ...(flightColumnsSupported ? TRIP_FLIGHT_COLUMNS : []), ...(lookupColumnsSupported ? TRIP_LOOKUP_COLUMNS : [])].join(",");
}

async function withTripColumns<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); }
  catch (error) {
    if (!isUndefinedColumnError(error)) throw error;
    if (lookupColumnsSupported) lookupColumnsSupported = false;
    else if (flightColumnsSupported) flightColumnsSupported = false;
    else throw error;
    return withTripColumns(request);
  }
}

const USER_TRIP_SELECT = "id,user_id,title,destination,trip_data,created_at";
const inFlightUserTripUpserts = new Map<string, Promise<UserTripData>>();

function safeString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableString(value: unknown, maxLength = 500) {
  const normalized = safeString(value, maxLength);
  return normalized || null;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeStringList(value: unknown, limit = 250) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => safeString(item, 16)).filter(Boolean))).slice(0, limit);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function dataUrl(table: string, params?: URLSearchParams) {
  const query = params?.toString();
  return `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

function dataHeaders(accessToken: string, prefer?: string) {
  if (!isSupabaseConfigured) throw new SupabaseDataError("not_configured");
  const token = accessToken.trim();
  if (!token || token.length > 4096 || /\s/.test(token)) throw new SupabaseDataError("not_authenticated", 401);
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function normalizeError(error: unknown): SupabaseDataError {
  if (error instanceof SupabaseDataError) return error;
  if (!(error instanceof ApiError)) return new SupabaseDataError("network");
  if (error.status === 401) return new SupabaseDataError("not_authenticated", error.status);
  if (error.status === 403) return new SupabaseDataError("forbidden", error.status);
  if (error.status === 404) return new SupabaseDataError("not_found", error.status);
  if (error.status === 409 || error.status === 412) return new SupabaseDataError("conflict", error.status);
  if (error.status === 400 || error.status === 406 || error.status === 422) return new SupabaseDataError("invalid_data", error.status);
  if (error.status >= 500) return new SupabaseDataError("service_unavailable", error.status);
  return new SupabaseDataError("network", error.status);
}

async function safely<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeError(error);
  }
}

function normalizeProfile(row: ProfileRow): UserProfileData | null {
  const id = safeString(row.id, 80);
  if (!id) return null;
  return {
    id,
    username: nullableString(row.username, 40),
    wishlistCountries: safeStringList(row.wishlist_countries),
    visitedCountries: safeStringList(row.visited_countries),
    optInLeaderboard: row.opt_in_leaderboard === true,
  };
}

function normalizeUserTrip(row: UserTripRow): UserTripData | null {
  const id = typeof row.id === "number" || typeof row.id === "string" ? row.id : null;
  const userId = safeString(row.user_id, 80);
  if (id === null || !userId) return null;
  const tripData = safeRecord(row.trip_data);
  return {
    id,
    userId,
    title: safeString(row.title, 160),
    destination: safeString(row.destination, 160),
    tripData,
    mobileKind: nullableString(tripData.mobile_kind, 60),
    clientKey: nullableString(tripData.client_key, 160),
    createdAt: safeString(row.created_at, 40),
  };
}

function normalizeCategory(value: unknown): ChecklistCategory {
  return new Set(["documents", "health", "technology", "luggage", "other"]).has(value as string)
    ? value as ChecklistCategory
    : "other";
}

function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.slice(0, 50).flatMap((item, index) => {
    const row = safeRecord(item);
    const label = safeString(row.label, 90);
    if (!label) return [];
    const id = safeString(row.id, 100) || `item-${index}`;
    if (seenIds.has(id)) return [];
    seenIds.add(id);
    const kind = row.kind === "event" ? "event" : "checklist";
    const eventId = kind === "event" ? safeString(row.eventId ?? row.event_id, 180) : "";
    const eventStartsAt = kind === "event" ? safeString(row.eventStartsAt ?? row.event_starts_at, 40) : "";
    if (kind === "event" && (!eventId || Number.isNaN(Date.parse(eventStartsAt)))) return [];
    const sourceUrl = safeString(row.eventSourceUrl ?? row.event_source_url, 800);
    return [{
      id,
      label,
      completed: row.completed === true,
      category: normalizeCategory(row.category),
      createdAt: safeString(row.createdAt, 40) || safeString(row.created_at, 40) || new Date(0).toISOString(),
      kind,
      ...(kind === "event" ? {
        eventId,
        eventStartsAt,
        eventLocalDate: safeString(row.eventLocalDate, 10),
        eventTimeZone: nullableString(row.eventTimeZone, 80),
        eventTimePrecision: row.eventTimePrecision === "exact" ? "exact" as const : "date" as const,
        eventCity: safeString(row.eventCity ?? row.event_city, 120),
        eventVenue: safeString(row.eventVenue ?? row.event_venue, 180),
        eventCountryCode: safeString(row.eventCountryCode ?? row.event_country_code, 2).toUpperCase(),
        eventSourceUrl: /^https:\/\//i.test(sourceUrl) ? sourceUrl : "",
      } : {}),
    }];
  });
}

function normalizeTripStatus(value: unknown): TripStatus {
  return new Set(["upcoming", "active", "completed", "cancelled"]).has(value as string)
    ? value as TripStatus
    : "upcoming";
}

function normalizeTrip(row: TripRow): CockpitTrip | null {
  const id = safeString(row.id, 80);
  const userId = safeString(row.user_id, 80);
  const destinationCountry = safeString(row.destination_country, 100);
  const destinationCode = safeString(row.destination_code, 2).toUpperCase();
  const startDate = safeString(row.start_date, 10);
  const endDate = safeString(row.end_date, 10);
  const managed = row.flight_lookup_managed === true;
  if (!id || !userId || (!managed && (!destinationCountry || !destinationCode)) || !startDate || !endDate) return null;
  return {
    id,
    userId,
    destinationCountry: managed ? "" : destinationCountry,
    destinationCode: managed ? "" : destinationCode,
    destinationCity: managed ? null : nullableString(row.destination_city, 100),
    startDate,
    endDate,
    departureAt: managed ? null : nullableString(row.departure_at, 40),
    arrivalAt: managed ? null : nullableString(row.arrival_at, 40),
    appLanguage: row.app_language === "sq" ? "sq" : row.app_language === "en" ? "en" : "tr",
    flightPnr: nullableString(row.flight_pnr, 20),
    originIata: managed ? null : nullableString(row.origin_iata, 3)?.toUpperCase() || null,
    destinationIata: managed ? null : nullableString(row.destination_iata, 3)?.toUpperCase() || null,
    airline: managed ? null : nullableString(row.airline, 80),
    flightNumber: nullableString(row.flight_number, 8)?.toUpperCase() || null,
    checklistItems: normalizeChecklist(row.checklist_items),
    status: normalizeTripStatus(row.status),
    createdAt: safeString(row.created_at, 40),
    updatedAt: safeString(row.updated_at, 40),
    flightLookupManaged: managed,
    flightLookupExpiresAt: managed ? nullableString(row.flight_lookup_expires_at, 40) : null,
  };
}

function cleanChecklist(items: ChecklistItem[] | undefined) {
  if (!items) return undefined;
  return normalizeChecklist(items);
}

function assertUserId(userId: string) {
  if (!validUuid(userId)) throw new SupabaseDataError("invalid_data", 400);
}

function assertTripId(tripId: string) {
  if (!validUuid(tripId)) throw new SupabaseDataError("invalid_data", 400);
}

function assertUserTripId(tripId: number | string) {
  if (!/^\d+$/.test(String(tripId))) throw new SupabaseDataError("invalid_data", 400);
}

function assertUserTripInput(input: UserTripUpsertInput) {
  if (!safeString(input.title, 160)
    || !safeString(input.destination, 160)
    || !/^[a-z0-9_-]{1,60}$/.test(input.mobileKind)
    || !/^[A-Za-z0-9._:-]{8,160}$/.test(input.clientKey)) {
    throw new SupabaseDataError("invalid_data", 400);
  }
}

function assertTripInput(input: CreateCockpitTripInput) {
  const country = safeString(input.destinationCountry, 100);
  const code = safeString(input.destinationCode, 2).toUpperCase();
  const pnr = safeString(input.flightPnr, 20);
  const departureAt = safeString(input.departureAt, 40);
  const arrivalAt = safeString(input.arrivalAt, 40);
  const originIata = safeString(input.originIata, 3).toUpperCase();
  const destinationIata = safeString(input.destinationIata, 3).toUpperCase();
  const flightNumber = safeString(input.flightNumber, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (country.length < 2 || !/^[A-Z]{2}$/.test(code)
    || (input.appLanguage !== undefined && input.appLanguage !== "tr" && input.appLanguage !== "en" && input.appLanguage !== "sq")
    || !validDate(input.startDate) || !validDate(input.endDate)
    || (!departureAt && input.startDate < localIsoDate(0)) || input.startDate > localIsoDate(730)
    || (departureAt && Date.parse(departureAt) < Date.now() - 48 * 3600000)
    || (departureAt && Date.parse(departureAt) <= Date.now() && (!arrivalAt || Date.parse(arrivalAt) <= Date.now()))
    || input.endDate < input.startDate || input.endDate > localIsoDate(730)
    || (departureAt && Number.isNaN(Date.parse(departureAt)))
    || (arrivalAt && Number.isNaN(Date.parse(arrivalAt)))
    || (departureAt && arrivalAt && Date.parse(arrivalAt) <= Date.parse(departureAt))
    || (pnr && !/^[A-Za-z0-9-]{3,20}$/.test(pnr))
    || (originIata && !/^[A-Z]{3}$/.test(originIata))
    || (destinationIata && !/^[A-Z]{3}$/.test(destinationIata))
    || (flightNumber && !/^[A-Z0-9]{2,8}$/.test(flightNumber))) {
    throw new SupabaseDataError("invalid_data", 400);
  }
}

function flightFieldValues(input: Pick<CreateCockpitTripInput, "originIata" | "destinationIata" | "airline" | "flightNumber" | "arrivalAt" | "appLanguage">) {
  return {
    origin_iata: nullableString(input.originIata, 3)?.toUpperCase() || null,
    destination_iata: nullableString(input.destinationIata, 3)?.toUpperCase() || null,
    airline: nullableString(input.airline, 80),
    flight_number: nullableString(safeString(input.flightNumber, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""), 8),
    arrival_at: nullableString(input.arrivalAt, 40),
    app_language: input.appLanguage === "sq" ? "sq" : input.appLanguage === "en" ? "en" : "tr",
  };
}

export async function getUserProfile(userId: string, accessToken: string) {
  assertUserId(userId);
  return safely(async () => {
    const params = new URLSearchParams({
      select: "id,username,wishlist_countries,visited_countries,opt_in_leaderboard",
      id: `eq.${userId}`,
      limit: "1",
    });
    const rows = await requestJson<ProfileRow[]>(dataUrl("profiles", params), {
      headers: dataHeaders(accessToken),
    });
    return rows[0] ? normalizeProfile(rows[0]) : null;
  });
}

export async function updateUserProfile(userId: string, update: UserProfileUpdate, accessToken: string) {
  assertUserId(userId);
  return safely(async () => {
    const body: Record<string, unknown> = {};
    if (update.username !== undefined) {
      const username = safeString(update.username, 20).toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new SupabaseDataError("invalid_data", 400);
      body.username = username;
    }
    if (update.wishlistCountries !== undefined) body.wishlist_countries = safeStringList(update.wishlistCountries);
    if (update.visitedCountries !== undefined) body.visited_countries = safeStringList(update.visitedCountries);
    if (update.optInLeaderboard !== undefined) body.opt_in_leaderboard = Boolean(update.optInLeaderboard);
    if (!Object.keys(body).length) {
      const profile = await getUserProfile(userId, accessToken);
      if (!profile) throw new SupabaseDataError("not_found", 404);
      return profile;
    }

    const params = new URLSearchParams({
      select: "id,username,wishlist_countries,visited_countries,opt_in_leaderboard",
      id: `eq.${userId}`,
    });
    const rows = await requestJson<ProfileRow[]>(dataUrl("profiles", params), {
      method: "PATCH",
      headers: dataHeaders(accessToken, "return=representation"),
      body,
    });
    const profile = rows[0] ? normalizeProfile(rows[0]) : null;
    if (!profile) throw new SupabaseDataError("not_found", 404);
    return profile;
  });
}

/** Favori ve ziyaret ülke kimliklerini sunucuda tek satır kilidiyle birleştirir. */
export async function mergeUserProfileCountries(
  userId: string,
  wishlistCountries: string[],
  visitedCountries: string[],
  accessToken: string,
) {
  assertUserId(userId);
  return safely(async () => {
    const rows = await requestJson<Array<{
      wishlist_countries?: unknown;
      visited_countries?: unknown;
      wishlist_added?: unknown;
      visited_added?: unknown;
    }>>(dataUrl("rpc/merge_mobile_profile_countries"), {
      method: "POST",
      headers: dataHeaders(accessToken),
      body: {
        p_wishlist: safeStringList(wishlistCountries),
        p_visited: safeStringList(visitedCountries),
      },
    });
    const row = rows[0];
    if (!row) throw new SupabaseDataError("not_found", 404);
    return {
      wishlistCountries: safeStringList(row.wishlist_countries),
      visitedCountries: safeStringList(row.visited_countries),
      wishlistAdded: Math.max(0, Number(row.wishlist_added) || 0),
      visitedAdded: Math.max(0, Number(row.visited_added) || 0),
    };
  });
}

export async function listUserTrips(userId: string, accessToken: string, mobileKind?: string) {
  assertUserId(userId);
  if (mobileKind && !/^[a-z0-9_-]{1,60}$/.test(mobileKind)) throw new SupabaseDataError("invalid_data", 400);
  return safely(async () => {
    const params = new URLSearchParams({
      select: USER_TRIP_SELECT,
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: "100",
    });
    if (mobileKind) params.set("trip_data->>mobile_kind", `eq.${safeString(mobileKind, 60)}`);
    const rows: UserTripRow[] = [];
    for (let offset = 0; ; offset += 100) {
      params.set("offset",String(offset));
      const page = await requestJson<UserTripRow[]>(dataUrl("user_trips", params), { headers:dataHeaders(accessToken) });
      rows.push(...page);
      if (!mobileKind || page.length < 100) break;
    }
    return rows.flatMap((row) => {
      const normalized = normalizeUserTrip(row);
      return normalized ? [normalized] : [];
    });
  });
}

async function performUserTripUpsert(userId: string, input: UserTripUpsertInput, accessToken: string) {
  assertUserId(userId);
  assertUserTripInput(input);
  return safely(async () => {
    const tripData = {
      ...safeRecord(input.tripData),
      mobile_kind: input.mobileKind,
      client_key: input.clientKey,
    };
    const rows = await requestJson<UserTripRow[]>(dataUrl("rpc/upsert_mobile_user_trip"), {
      method: "POST",
      headers: dataHeaders(accessToken),
      body: {
        p_title: safeString(input.title, 160),
        p_destination: safeString(input.destination, 160),
        p_mobile_kind: input.mobileKind,
        p_client_key: input.clientKey,
        p_trip_data: tripData,
      },
    });
    const saved = rows[0] ? normalizeUserTrip(rows[0]) : null;
    if (!saved) throw new SupabaseDataError("service_unavailable", 500);
    return saved;
  });
}

export function upsertUserTrip(userId: string, input: UserTripUpsertInput, accessToken: string) {
  // Sunucu RPC'si ayrı cihazlardaki eş anahtarları transaction kilidiyle
  // birleştirir; bu harita aynı çalışma zamanındaki gereksiz paralel çağrıları da
  // önler.
  const inFlightKey = `${userId}:${input.mobileKind}:${input.clientKey}`;
  const existing = inFlightUserTripUpserts.get(inFlightKey);
  if (existing) return existing;
  const operation = performUserTripUpsert(userId, input, accessToken)
    .finally(() => inFlightUserTripUpserts.delete(inFlightKey));
  inFlightUserTripUpserts.set(inFlightKey, operation);
  return operation;
}

export async function deleteUserTrip(userId: string, tripId: number | string, accessToken: string) {
  assertUserId(userId);
  assertUserTripId(tripId);
  return safely(async () => {
    const params = new URLSearchParams({
      select: "id",
      id: `eq.${String(tripId)}`,
      user_id: `eq.${userId}`,
    });
    const rows = await requestJson<Array<{ id?: unknown }>>(dataUrl("user_trips", params), {
      method: "DELETE",
      headers: dataHeaders(accessToken, "return=representation"),
    });
    if (!rows.length) throw new SupabaseDataError("not_found", 404);
  });
}

/** Delete without needing a successful cloud-list request first. Idempotent. */
export async function deleteUserRouteByClientKey(userId: string, clientKey: string, accessToken: string) {
  assertUserId(userId);
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(clientKey)) throw new SupabaseDataError("invalid_data", 400);
  return safely(async () => {
    const params = new URLSearchParams({ user_id: `eq.${userId}`, "trip_data->>mobile_kind": "eq.route_plan", "trip_data->>client_key": `eq.${clientKey}`, select: "id" });
    await requestJson(dataUrl("user_trips", params), { method: "DELETE", headers: dataHeaders(accessToken, "return=representation") });
  });
}

export async function listCockpitTrips(userId: string, accessToken: string, includeCancelled = false, includeFlightDetails = false) {
  assertUserId(userId);
  return safely(async () => {
    const fetchRows = async () => {
      const params = new URLSearchParams({
        select: tripSelect(),
        user_id: `eq.${userId}`,
        order: "start_date.asc",
        limit: "100",
      });
      if (!includeCancelled) params.set("status", "neq.cancelled");
      return requestJson<TripRow[]>(dataUrl("trips", params), {
        headers: dataHeaders(accessToken),
      });
    };
    const rows = await withTripColumns(fetchRows);
    const trips = rows.flatMap((row) => {
      const normalized = normalizeTrip(row);
      return normalized ? [normalized] : [];
    });
    const ids = trips.filter(trip => trip.flightLookupManaged && Date.parse(trip.flightLookupExpiresAt || "") > Date.now()).map(trip => trip.id);
    if (!includeFlightDetails || !ids.length) return trips;
    try {
      const details = await requestJson<Array<{ trip_id: string; data: unknown; fetched_at: string; expires_at: string }>>(dataUrl("rpc/read_cockpit_flight_details"), {
        method: "POST", headers: dataHeaders(accessToken), body: { p_trip_ids: ids },
      });
      if (!Array.isArray(details)) return trips;
      return trips.map(trip => {
        if (!ids.includes(trip.id)) return trip;
        const detail = details.find(item => item?.trip_id === trip.id);
        const flight = detail && parseFlightMatch(detail.data, trip.flightNumber || undefined, trip.startDate);
        return flight && detail && Date.parse(detail.fetched_at) === Date.parse(flight.fetchedAt) && activeFlightExpiry(detail.expires_at, flight.fetchedAt)
          && Date.parse(detail.expires_at) === Date.parse(trip.flightLookupExpiresAt || "") ? { ...trip, providerFlight: flight } : trip;
      });
    } catch { return trips; } // A failed detail refresh must not hide PNR or checklists.
  });
}

export async function createCockpitTrip(userId: string, input: CreateCockpitTripInput, accessToken: string) {
  assertUserId(userId);
  if (input.flightSelectionReceipt !== undefined) {
    return safely(async () => {
      if (typeof input.flightSelectionReceipt !== "string" || !input.flightSelectionReceipt || input.flightSelectionReceipt.length > 16000) throw new SupabaseDataError("invalid_data", 400);
      const result = await requestJson<{ trip: TripRow; flight: unknown; expiresAt: string }>(`${config.apiBaseUrl}/api/cockpit/flight-trips`, {
        method: "POST", headers: { Authorization: dataHeaders(accessToken).Authorization, "X-Flight-Lookup-Version": "3" },
        body: { receipt: input.flightSelectionReceipt, endDate: input.endDate, flightPnr: nullableString(input.flightPnr, 20),
          checklistItems: cleanChecklist(input.checklistItems) || [], appLanguage: input.appLanguage === "sq" ? "sq" : input.appLanguage === "en" ? "en" : "tr" },
      });
      const trip = result?.trip && normalizeTrip(result.trip);
      if (!trip || trip.userId !== userId || !trip.flightLookupManaged) throw new SupabaseDataError("service_unavailable", 500);
      const flight = parseFlightMatch(result.flight, trip.flightNumber || undefined, trip.startDate);
      return flight && activeFlightExpiry(result.expiresAt, flight.fetchedAt) && Date.parse(result.expiresAt) === Date.parse(trip.flightLookupExpiresAt || "")
        ? { ...trip, providerFlight: flight } : trip;
    });
  }
  assertTripInput(input);
  return safely(async () => {
    const post = async () => {
      const params = new URLSearchParams({ select: tripSelect() });
      return requestJson<TripRow[]>(dataUrl("trips", params), {
        method: "POST",
        headers: dataHeaders(accessToken, "return=representation"),
        body: {
          user_id: userId,
          destination_country: safeString(input.destinationCountry, 100),
          destination_code: safeString(input.destinationCode, 2).toUpperCase(),
          destination_city: nullableString(input.destinationCity, 100),
          start_date: input.startDate,
          end_date: input.endDate,
          departure_at: nullableString(input.departureAt, 40),
          flight_pnr: nullableString(input.flightPnr, 20),
          // Uçuş alanları yalnız sütunlar varken gönderilir (42703 emniyeti).
          ...(flightColumnsSupported ? flightFieldValues(input) : {}),
          checklist_items: cleanChecklist(input.checklistItems) || [],
          status: "upcoming",
        },
      });
    };
    const rows = await withTripColumns(post);
    const trip = rows[0] ? normalizeTrip(rows[0]) : null;
    if (!trip) throw new SupabaseDataError("service_unavailable", 500);
    return trip;
  });
}

/** Refresh only the managed overlay; provider fields never enter the trip base. */
export async function refreshCockpitFlight(userId: string, tripId: string, accessToken: string, signal?: AbortSignal) {
  assertUserId(userId); assertTripId(tripId);
  return safely(async () => {
    const result = await requestJson<{ protocol: number; trip: TripRow; flight: unknown; expiresAt: string | null; refreshAfterSeconds?: number }>(`${config.apiBaseUrl}/api/cockpit/flight-trips/refresh`, {
      method: "POST", headers: { Authorization: dataHeaders(accessToken).Authorization, "X-Flight-Lookup-Version": "3" }, body: { tripId, requestId: createId() }, signal,
    });
    const trip = result?.trip && normalizeTrip(result.trip);
    if (result.protocol !== 3 || !trip || trip.id !== tripId || trip.userId !== userId || !trip.flightLookupManaged) throw new SupabaseDataError("service_unavailable", 500);
    const flight = result.flight === null ? null : parseFlightMatch(result.flight, trip.flightNumber || undefined, trip.startDate);
    if (result.flight !== null && (!flight || !activeFlightExpiry(result.expiresAt, flight.fetchedAt) || Date.parse(result.expiresAt) !== Date.parse(trip.flightLookupExpiresAt || ""))) throw new SupabaseDataError("service_unavailable", 500);
    return { trip: { ...trip, providerFlight: flight || undefined }, refreshAfterSeconds: Math.min(3600, Math.max(30, Number(result.refreshAfterSeconds) || 300)) };
  });
}

export async function updateCockpitTrip(
  userId: string,
  tripId: string,
  update: UpdateCockpitTripInput,
  accessToken: string,
  expectedUpdatedAt?: string,
) {
  assertUserId(userId);
  assertTripId(tripId);
  return safely(async () => {
    const body: Record<string, unknown> = {};
    if (update.destinationCountry !== undefined) body.destination_country = safeString(update.destinationCountry, 100);
    if (update.destinationCode !== undefined) body.destination_code = safeString(update.destinationCode, 2).toUpperCase();
    if (update.destinationCity !== undefined) body.destination_city = nullableString(update.destinationCity, 100);
    if (update.startDate !== undefined) body.start_date = update.startDate;
    if (update.endDate !== undefined) body.end_date = update.endDate;
    if (update.departureAt !== undefined) body.departure_at = nullableString(update.departureAt, 40);
    if (update.flightPnr !== undefined) body.flight_pnr = nullableString(update.flightPnr, 20);
    if (flightColumnsSupported) {
      const flightValues = flightFieldValues(update);
      if (update.originIata !== undefined) body.origin_iata = flightValues.origin_iata;
      if (update.destinationIata !== undefined) body.destination_iata = flightValues.destination_iata;
      if (update.airline !== undefined) body.airline = flightValues.airline;
      if (update.flightNumber !== undefined) body.flight_number = flightValues.flight_number;
      if (update.arrivalAt !== undefined) body.arrival_at = flightValues.arrival_at;
      if (update.appLanguage !== undefined) body.app_language = flightValues.app_language;
    }
    if (update.checklistItems !== undefined) body.checklist_items = cleanChecklist(update.checklistItems) || [];
    if (update.status !== undefined) body.status = normalizeTripStatus(update.status);
    if (!Object.keys(body).length) throw new SupabaseDataError("invalid_data", 400);

    const patch = async (payload: Record<string, unknown>) => {
      const params = new URLSearchParams({
        select: tripSelect(),
        id: `eq.${tripId}`,
        user_id: `eq.${userId}`,
      });
      if (expectedUpdatedAt) params.set("updated_at", `eq.${expectedUpdatedAt}`);
      return requestJson<TripRow[]>(dataUrl("trips", params), {
        method: "PATCH",
        headers: dataHeaders(accessToken, "return=representation"),
        body: payload,
      });
    };
    const rows = await withTripColumns(() => {
      const payload = flightColumnsSupported ? body : Object.fromEntries(Object.entries(body).filter(([key]) => !TRIP_FLIGHT_COLUMNS.includes(key)));
      if (!Object.keys(payload).length) throw new SupabaseDataError("invalid_data", 400);
      return patch(payload);
    });
    const trip = rows[0] ? normalizeTrip(rows[0]) : null;
    if (!trip) throw new SupabaseDataError(expectedUpdatedAt ? "conflict" : "not_found", expectedUpdatedAt ? 409 : 404);
    return trip;
  });
}

export function updateCockpitChecklist(
  userId: string,
  trip: Pick<CockpitTrip, "id" | "updatedAt">,
  checklistItems: ChecklistItem[],
  accessToken: string,
) {
  return updateCockpitTrip(userId, trip.id, { checklistItems }, accessToken, trip.updatedAt);
}

export async function attachTravelEventToCockpitTrip(
  userId: string,
  trip: CockpitTrip,
  event: TravelEvent,
  accessToken: string,
) {
  const existing = trip.checklistItems.some((item) => item.kind === "event" && item.eventId === event.id);
  if (existing) return { trip, attached: false };
  if (trip.checklistItems.length >= 50) throw new SupabaseDataError("invalid_data", 400);

  const next: ChecklistItem[] = [...trip.checklistItems, {
    id: createId(),
    label: event.title.slice(0, 90),
    completed: false,
    category: "other",
    createdAt: new Date().toISOString(),
    kind: "event",
    eventId: event.id,
    eventStartsAt: event.startsAt,
    eventLocalDate: event.localDate,
    eventTimeZone: event.timeZone,
    eventTimePrecision: event.timePrecision,
    eventCity: event.city,
    eventVenue: event.venue || "",
    eventCountryCode: event.countryCode,
    eventSourceUrl: event.ticketUrl || event.sourceUrl,
  }];
  const updated = await updateCockpitChecklist(userId, trip, next, accessToken);
  return { trip: updated, attached: true };
}

export async function deleteCockpitTrip(
  userId: string,
  tripId: string,
  accessToken: string,
  expectedUpdatedAt?: string,
) {
  assertUserId(userId);
  assertTripId(tripId);
  return safely(async () => {
    const params = new URLSearchParams({
      select: "id",
      id: `eq.${tripId}`,
      user_id: `eq.${userId}`,
    });
    if (expectedUpdatedAt) params.set("updated_at", `eq.${expectedUpdatedAt}`);
    const rows = await requestJson<Array<{ id?: unknown }>>(dataUrl("trips", params), {
      method: "DELETE",
      headers: dataHeaders(accessToken, "return=representation"),
    });
    if (!rows.length) throw new SupabaseDataError(expectedUpdatedAt ? "conflict" : "not_found", expectedUpdatedAt ? 409 : 404);
  });
}
