import { ApiError, requestJson } from "./api";
import { config, isSupabaseConfigured } from "./config";

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

export function getSupabaseDataErrorMessage(error: unknown, fallback = ERROR_MESSAGES.service_unavailable) {
  return error instanceof SupabaseDataError ? error.message : fallback;
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
  flightPnr: string | null;
  checklistItems: ChecklistItem[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateCockpitTripInput = {
  destinationCountry: string;
  destinationCode: string;
  destinationCity?: string;
  startDate: string;
  endDate: string;
  departureAt?: string | null;
  flightPnr?: string;
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
  id?: unknown;
  user_id?: unknown;
  destination_country?: unknown;
  destination_code?: unknown;
  destination_city?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  departure_at?: unknown;
  flight_pnr?: unknown;
  checklist_items?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const TRIP_SELECT = [
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
].join(",");

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
    return [{
      id,
      label,
      completed: row.completed === true,
      category: normalizeCategory(row.category),
      createdAt: safeString(row.createdAt, 40) || safeString(row.created_at, 40) || new Date(0).toISOString(),
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
  if (!id || !userId || !destinationCountry || !destinationCode || !startDate || !endDate) return null;
  return {
    id,
    userId,
    destinationCountry,
    destinationCode,
    destinationCity: nullableString(row.destination_city, 100),
    startDate,
    endDate,
    departureAt: nullableString(row.departure_at, 40),
    flightPnr: nullableString(row.flight_pnr, 20),
    checklistItems: normalizeChecklist(row.checklist_items),
    status: normalizeTripStatus(row.status),
    createdAt: safeString(row.created_at, 40),
    updatedAt: safeString(row.updated_at, 40),
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
  if (country.length < 2 || !/^[A-Z]{2}$/.test(code)
    || !validDate(input.startDate) || !validDate(input.endDate) || input.endDate < input.startDate
    || (departureAt && Number.isNaN(Date.parse(departureAt)))
    || (pnr && !/^[A-Za-z0-9-]{3,20}$/.test(pnr))) {
    throw new SupabaseDataError("invalid_data", 400);
  }
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
    const rows = await requestJson<UserTripRow[]>(dataUrl("user_trips", params), {
      headers: dataHeaders(accessToken),
    });
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
    const matchParams = new URLSearchParams({
      select: USER_TRIP_SELECT,
      user_id: `eq.${userId}`,
      "trip_data->>mobile_kind": `eq.${input.mobileKind}`,
      "trip_data->>client_key": `eq.${input.clientKey}`,
      order: "created_at.desc",
      limit: "1",
    });
    const matches = await requestJson<UserTripRow[]>(dataUrl("user_trips", matchParams), {
      headers: dataHeaders(accessToken),
    });
    const existing = matches[0] ? normalizeUserTrip(matches[0]) : null;
    const tripData = {
      ...(existing?.tripData || {}),
      ...safeRecord(input.tripData),
      mobile_kind: input.mobileKind,
      client_key: input.clientKey,
    };
    const payload = {
      title: safeString(input.title, 160),
      destination: safeString(input.destination, 160),
      trip_data: tripData,
    };

    if (existing) {
      const params = new URLSearchParams({
        select: USER_TRIP_SELECT,
        id: `eq.${String(existing.id)}`,
        user_id: `eq.${userId}`,
      });
      const rows = await requestJson<UserTripRow[]>(dataUrl("user_trips", params), {
        method: "PATCH",
        headers: dataHeaders(accessToken, "return=representation"),
        body: payload,
      });
      const updated = rows[0] ? normalizeUserTrip(rows[0]) : null;
      if (!updated) throw new SupabaseDataError("conflict", 409);
      return updated;
    }

    const params = new URLSearchParams({ select: USER_TRIP_SELECT });
    const rows = await requestJson<UserTripRow[]>(dataUrl("user_trips", params), {
      method: "POST",
      headers: dataHeaders(accessToken, "return=representation"),
      body: { user_id: userId, ...payload },
    });
    const created = rows[0] ? normalizeUserTrip(rows[0]) : null;
    if (!created) throw new SupabaseDataError("service_unavailable", 500);
    return created;
  });
}

export function upsertUserTrip(userId: string, input: UserTripUpsertInput, accessToken: string) {
  // Mevcut tabloda client_key için benzersiz kolon/indeks bulunmadığından aynı
  // çalışma zamanındaki eş anahtarları tek istekte birleştirir, sunucuda da önce
  // JSONB anahtarıyla arayıp varsa güncelleriz. Ayrı cihazlardan tam eşzamanlı iki
  // ilk kayıt için atomik garanti ancak ileride eklenecek bir DB constraint ile mümkündür.
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

export async function listCockpitTrips(userId: string, accessToken: string, includeCancelled = false) {
  assertUserId(userId);
  return safely(async () => {
    const params = new URLSearchParams({
      select: TRIP_SELECT,
      user_id: `eq.${userId}`,
      order: "start_date.asc",
      limit: "100",
    });
    if (!includeCancelled) params.set("status", "neq.cancelled");
    const rows = await requestJson<TripRow[]>(dataUrl("trips", params), {
      headers: dataHeaders(accessToken),
    });
    return rows.flatMap((row) => {
      const normalized = normalizeTrip(row);
      return normalized ? [normalized] : [];
    });
  });
}

export async function createCockpitTrip(userId: string, input: CreateCockpitTripInput, accessToken: string) {
  assertUserId(userId);
  assertTripInput(input);
  return safely(async () => {
    const params = new URLSearchParams({ select: TRIP_SELECT });
    const rows = await requestJson<TripRow[]>(dataUrl("trips", params), {
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
        checklist_items: cleanChecklist(input.checklistItems) || [],
        status: "upcoming",
      },
    });
    const trip = rows[0] ? normalizeTrip(rows[0]) : null;
    if (!trip) throw new SupabaseDataError("service_unavailable", 500);
    return trip;
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
    if (update.checklistItems !== undefined) body.checklist_items = cleanChecklist(update.checklistItems) || [];
    if (update.status !== undefined) body.status = normalizeTripStatus(update.status);
    if (!Object.keys(body).length) throw new SupabaseDataError("invalid_data", 400);

    const params = new URLSearchParams({
      select: TRIP_SELECT,
      id: `eq.${tripId}`,
      user_id: `eq.${userId}`,
    });
    if (expectedUpdatedAt) params.set("updated_at", `eq.${expectedUpdatedAt}`);
    const rows = await requestJson<TripRow[]>(dataUrl("trips", params), {
      method: "PATCH",
      headers: dataHeaders(accessToken, "return=representation"),
      body,
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
