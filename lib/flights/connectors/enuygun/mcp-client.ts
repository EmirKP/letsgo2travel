import type { FlightSearchRequest } from "../../core/types";
import { airportMatchesRequest } from "../../core/airport-match";

const MCP_ENDPOINT = "https://mcp.enuygun.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_RESPONSE_BYTES = 2_500_000;
const SESSION_CLOSE_TIMEOUT_MS = 3_000;
const OFFER_TTL_MS = 5 * 60 * 1_000;

type JsonRecord = Record<string, any>;

export class EnuygunMcpClientError extends Error {
  readonly code: "authorization_failed" | "quota_exceeded" | "temporarily_unavailable" | "format_changed" | "network_error";
  readonly httpStatus: number | null;
  readonly sessionBound: boolean;

  constructor(
    message: string,
    code: EnuygunMcpClientError["code"] = "temporarily_unavailable",
    httpStatus: number | null = null,
    sessionBound = false,
  ) {
    super(message);
    this.name = "EnuygunMcpClientError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.sessionBound = sessionBound;
  }
}

function statusCode(status: number): EnuygunMcpClientError["code"] {
  if (status === 401 || status === 403) return "authorization_failed";
  if (status === 429) return "quota_exceeded";
  if (status >= 400 && status < 500) return "format_changed";
  return "temporarily_unavailable";
}

async function boundedText(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new EnuygunMcpClientError("MCP yanıtı güvenli boyut sınırını aştı.", "format_changed");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function transportCandidates(text: string, contentType: string) {
  if (!contentType.includes("text/event-stream")) return [text.trim()];
  return text.replace(/\r\n/g, "\n").split(/\n\n+/).flatMap((event) => {
    const data = event.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    return data.length ? [data.join("\n")] : [];
  });
}

function parseTransport(text: string, contentType: string, expectedId: number): JsonRecord {
  const candidates = transportCandidates(text, contentType);
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const value = JSON.parse(candidates[index]);
      if (value?.jsonrpc === "2.0" && value.id === expectedId) return value as JsonRecord;
    } catch {
      // Aynı SSE akışındaki sonraki JSON-RPC mesajını dene.
    }
  }
  throw new EnuygunMcpClientError("MCP JSON-RPC yanıtı istek kimliğiyle eşleşmedi.", "format_changed");
}

async function jsonRpc(params: {
  id: number;
  method: string;
  rpcParams: JsonRecord;
  sessionId?: string;
  protocolVersion?: string;
  signal?: AbortSignal;
}) {
  let response: Response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": params.protocolVersion || MCP_PROTOCOL_VERSION,
        ...(params.sessionId ? { "Mcp-Session-Id": params.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: params.id,
        method: params.method,
        params: params.rpcParams,
      }),
      redirect: "error",
      signal: params.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (params.signal?.aborted) throw error;
    throw new EnuygunMcpClientError("Enuygun MCP ağına bağlanılamadı.", "network_error");
  }
  const text = await boundedText(response);
  if (!response.ok) {
    throw new EnuygunMcpClientError(
      `Enuygun MCP HTTP ${response.status} yanıtı verdi.`,
      statusCode(response.status),
      response.status,
      Boolean(params.sessionId),
    );
  }
  const payload = parseTransport(text, response.headers.get("content-type") || "", params.id);
  if (payload.error) throw new EnuygunMcpClientError("Enuygun MCP çağrısı hata döndürdü.");
  return {
    payload,
    sessionId: response.headers.get("mcp-session-id") || params.sessionId || "",
  };
}

async function sendInitializedNotification(sessionId: string, protocolVersion: string, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": protocolVersion,
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
      redirect: "error",
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new EnuygunMcpClientError("Enuygun MCP oturumu başlatılamadı.", "network_error");
  }
  if (response.status !== 202) {
    await boundedText(response).catch(() => "");
    throw new EnuygunMcpClientError(
      "Enuygun MCP initialized bildirimi kabul edilmedi.",
      statusCode(response.status),
      response.status,
      true,
    );
  }
  if (response.body) await response.body.cancel().catch(() => undefined);
}

function parsedToolEnvelope(result: JsonRecord | undefined) {
  if (!result || result.isError === true) {
    throw new EnuygunMcpClientError("Enuygun MCP araç yanıtı geçersiz.", "format_changed");
  }
  const candidates: JsonRecord[] = [];
  if (result.structuredContent && typeof result.structuredContent === "object") {
    candidates.push(result.structuredContent as JsonRecord);
  }
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item?.type !== "text" || typeof item.text !== "string") continue;
      try {
        candidates.push(JSON.parse(item.text) as JsonRecord);
      } catch {
        // Açıklama metinlerini atla; yalnız JSON blokları sözleşme adayıdır.
      }
    }
  }
  if (candidates.some((candidate) => (
    candidate && typeof candidate === "object" && candidate.success === false
  ))) {
    throw new EnuygunMcpClientError("Enuygun MCP araç blokları başarı ve hata açısından çelişiyor.", "format_changed");
  }
  const envelopes = candidates.filter((candidate) => (
    candidate && typeof candidate === "object" && candidate.success === true
    && candidate.data && typeof candidate.data === "object"
  ));
  if (!envelopes.length) {
    throw new EnuygunMcpClientError("Enuygun MCP araç verisi doğrulanamadı.", "format_changed");
  }
  const canonical = JSON.stringify(envelopes[0]);
  if (envelopes.some((candidate) => JSON.stringify(candidate) !== canonical)) {
    throw new EnuygunMcpClientError("Enuygun MCP araç blokları birbiriyle çelişiyor.", "format_changed");
  }
  return envelopes[0];
}

export type EnuygunMcpSession = {
  sessionId: string;
  protocolVersion: string;
};

export async function closeEnuygunMcpSession(session: EnuygunMcpSession | null | undefined) {
  if (!session?.sessionId) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_CLOSE_TIMEOUT_MS);
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: "DELETE",
      headers: {
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": session.protocolVersion || MCP_PROTOCOL_VERSION,
        "Mcp-Session-Id": session.sessionId,
      },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.body) await response.body.cancel().catch(() => undefined);
  } catch {
    // Oturum kapatma best-effort'tur; ana çağrının sonucunu veya hatasını maskelemez.
  } finally {
    clearTimeout(timeout);
  }
}

async function createSession(signal?: AbortSignal): Promise<EnuygunMcpSession> {
  const initialized = await jsonRpc({
    id: 1,
    method: "initialize",
    rpcParams: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "letsgo2travel-web", version: "0.2.0" },
    },
    signal,
  });
  const sessionId = initialized.sessionId;
  const protocolVersion = initialized.payload?.result?.protocolVersion;
  try {
    if (!sessionId) {
      throw new EnuygunMcpClientError("Enuygun MCP oturumu oluşturulamadı.", "format_changed");
    }
    const toolsCapability = initialized.payload?.result?.capabilities?.tools;
    if (protocolVersion !== MCP_PROTOCOL_VERSION || !toolsCapability || typeof toolsCapability !== "object") {
      throw new EnuygunMcpClientError("Enuygun MCP protokol veya araç yeteneği doğrulanamadı.", "format_changed");
    }
    await sendInitializedNotification(sessionId, protocolVersion, signal);
    return { sessionId, protocolVersion };
  } catch (error) {
    await closeEnuygunMcpSession({
      sessionId,
      protocolVersion: typeof protocolVersion === "string" ? protocolVersion : MCP_PROTOCOL_VERSION,
    });
    throw error;
  }
}

async function invokeTool(
  name: "flight_search" | "flight_allocate",
  args: JsonRecord,
  session: EnuygunMcpSession,
  id: number,
  signal?: AbortSignal,
) {
  const called = await jsonRpc({
    id,
    method: "tools/call",
    rpcParams: { name, arguments: args },
    sessionId: session.sessionId,
    protocolVersion: session.protocolVersion,
    signal,
  });
  return {
    data: parsedToolEnvelope(called.payload.result).data as JsonRecord,
    session,
  };
}

async function callTool(
  name: "flight_search" | "flight_allocate",
  args: JsonRecord,
  signal?: AbortSignal,
  existingSession?: EnuygunMcpSession,
) {
  if (existingSession) return invokeTool(name, args, existingSession, 3, signal);

  const callInOwnedSession = async () => {
    const session = await createSession(signal);
    try {
      return await invokeTool(name, args, session, 2, signal);
    } catch (error) {
      await closeEnuygunMcpSession(session);
      throw error;
    }
  };

  try {
    return await callInOwnedSession();
  } catch (error) {
    const expiredReadSession = name === "flight_search"
      && error instanceof EnuygunMcpClientError
      && error.httpStatus === 404
      && error.sessionBound === true
      && !signal?.aborted;
    if (!expiredReadSession) throw error;
    return callInOwnedSession();
  }
}

function ddmmyyyy(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new EnuygunMcpClientError("Uçuş tarihi geçersiz.", "format_changed");
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finitePackageNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

function normalizedCabin(value: unknown) {
  const cabin = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[ -]+/g, "_")
    : "";
  return ["economy", "premium_economy", "business", "first"].includes(cabin) ? cabin : "";
}

function providerDateTime(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as JsonRecord;
  const date = typeof row.date === "string" ? row.date.trim() : "";
  const time = typeof row.time === "string" ? row.time.trim() : "";
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  const timestamp = finite(row.timestamp);
  if (!dateMatch || !timeMatch || timestamp === null || !Number.isSafeInteger(timestamp) || timestamp <= 0) return null;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
      || calendar.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  if (Math.abs(timestamp * 1_000 - calendar.getTime()) > 2 * 24 * 60 * 60 * 1_000) return null;
  return { date, timestamp };
}

function selectedScheduleValid(flight: JsonRecord, expectedDepartureDate: string) {
  const segments = Array.isArray(flight?.segments) ? flight.segments as JsonRecord[] : [];
  let previousArrival = 0;
  let previousDestination = "";
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const departure = providerDateTime(segment?.departure_datetime);
    const arrival = providerDateTime(segment?.arrival_datetime);
    const origin = typeof segment?.origin === "string" ? segment.origin.trim().toUpperCase() : "";
    const destination = typeof segment?.destination === "string" ? segment.destination.trim().toUpperCase() : "";
    if (!departure || !arrival || arrival.timestamp <= departure.timestamp
        || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination
        || (index === 0 && departure.date !== expectedDepartureDate)
        || (index > 0 && (departure.timestamp < previousArrival || origin !== previousDestination))) {
      return false;
    }
    previousArrival = arrival.timestamp;
    previousDestination = destination;
  }
  return segments.length > 0;
}

function recognizableFlight(flight: JsonRecord, requestedCabin: string, requestedCurrency: string) {
  const total = finite(flight?.price_breakdown?.total);
  const currency = cleanCurrency(flight?.price_breakdown?.currency);
  const segments = Array.isArray(flight?.segments) ? flight.segments : [];
  return typeof flight?.enuid === "string" && flight.enuid.trim().length > 0
    && total !== null && total > 0 && currency === requestedCurrency
    && segments.length >= 1 && segments.length <= 8
    && segments.every((segment: JsonRecord) => normalizedCabin(segment?.cabin_class) === requestedCabin);
}

export function validateEnuygunSearchSnapshot(data: JsonRecord, request: FlightSearchRequest) {
  const flights = data?.flights;
  if (!flights || typeof flights !== "object" || !Array.isArray(flights.departure)) {
    throw new EnuygunMcpClientError("Enuygun uçuş yanıt şeması değişti.", "format_changed");
  }
  if (request.tripType === "round_trip" && !Array.isArray(flights.return)) {
    throw new EnuygunMcpClientError("Enuygun dönüş uçuşu şeması değişti.", "format_changed");
  }
  const returning = Array.isArray(flights.return) ? flights.return : [];
  if (flights.departure.length
      && !flights.departure.some((flight: JsonRecord) => recognizableFlight(flight, request.cabinClass, request.currency))) {
    throw new EnuygunMcpClientError("Enuygun gidiş teklifleri doğrulanamadı.", "format_changed");
  }
  if (returning.length
      && !returning.some((flight: JsonRecord) => recognizableFlight(flight, request.cabinClass, request.currency))) {
    throw new EnuygunMcpClientError("Enuygun dönüş teklifleri doğrulanamadı.", "format_changed");
  }
  return data;
}

export function parseEnuygunSourceOfferRef(value: unknown) {
  if (typeof value !== "string" || value.length < 3 || value.length > 200) return [];
  const ids = value.split("|");
  return ids.length >= 1 && ids.length <= 2
    && ids.every((item) => item === item.trim() && item.length >= 3 && item.length <= 100)
    ? ids
    : [];
}

export async function searchEnuygunMcpSession(request: FlightSearchRequest, signal?: AbortSignal) {
  if (request.currency !== "TRY") {
    throw new EnuygunMcpClientError("Enuygun açık MCP kaynağı bu pilotta yalnız TRY destekliyor.", "format_changed");
  }
  const called = await callTool("flight_search", {
    origin: request.origin,
    destination: request.destination,
    departure_date: ddmmyyyy(request.departureDate),
    ...(request.tripType === "round_trip" && request.returnDate
      ? { return_date: ddmmyyyy(request.returnDate) }
      : {}),
    adults: request.passengers.adults,
    children: request.passengers.children,
    infants: request.passengers.infants,
    cabin_class: request.cabinClass.toUpperCase(),
    direct_flight: request.directOnly,
  }, signal);
  try {
    return {
      data: validateEnuygunSearchSnapshot(called.data, request),
      session: called.session,
    };
  } catch (error) {
    await closeEnuygunMcpSession(called.session);
    throw error;
  }
}

export async function searchEnuygunMcp(request: FlightSearchRequest, signal?: AbortSignal) {
  const result = await searchEnuygunMcpSession(request, signal);
  try {
    return result.data;
  } finally {
    await closeEnuygunMcpSession(result.session);
  }
}

export type EnuygunLivePrice = {
  available: boolean;
  total: number | null;
  currency: string | null;
  baggage: {
    cabinBagsPerPassenger: number;
    checkedBagsPerPassenger: number;
    checkedBagWeightKg: number | null;
    additionalCabinBagFeeTotal: null;
    additionalCheckedBagFeeTotal: null;
  } | null;
  fareFamily: string | null;
  observedAt: string;
  expiresAt: string;
};

function selectedPackageCheckedBaggage(flight: JsonRecord) {
  const selectedPackage = Array.isArray(flight?.provider_packages)
    ? flight.provider_packages[0]
    : null;
  if (!selectedPackage || typeof selectedPackage !== "object" || Array.isArray(selectedPackage)
      || typeof selectedPackage.name !== "string" || !selectedPackage.name.trim()
      || selectedPackage.name.trim().length > 80
      || !Array.isArray(selectedPackage.items)
      || selectedPackage.items.length === 0) {
    throw new EnuygunMcpClientError("Enuygun tarife bagaj bilgisi doğrulanamadı.", "format_changed");
  }

  const checkedRows: Array<{ part: number; allowance: number }> = [];
  for (const item of selectedPackage.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new EnuygunMcpClientError("Enuygun tarife bagaj bilgisi doğrulanamadı.", "format_changed");
    }
    const rawType = typeof item.type === "string"
      ? item.type
      : typeof item.item_type === "string"
        ? item.item_type
        : typeof item.code === "string" ? item.code : "";
    const itemType = rawType.trim().slice(0, 60).toLowerCase().replace(/[ -]+/g, "_");
    if (!itemType) {
      throw new EnuygunMcpClientError("Enuygun tarife bagaj bilgisi doğrulanamadı.", "format_changed");
    }
    const looksLikeBaggage = itemType.includes("bag") || itemType.includes("luggage");
    const isCheckedBaggage = ["checked_baggage", "checked_bag", "hold_baggage", "hold_luggage"]
      .includes(itemType);
    if (looksLikeBaggage && !isCheckedBaggage
        && !["cabin_baggage", "cabin_bag", "hand_baggage", "hand_bag"].includes(itemType)) {
      throw new EnuygunMcpClientError("Enuygun tarife bagaj türü doğrulanamadı.", "format_changed");
    }
    if (!isCheckedBaggage) continue;

    const availability = item.is_available ?? item.available;
    if (availability === 0 || availability === false || availability === "0") continue;
    if (availability !== 1 && availability !== true && availability !== "1") {
      throw new EnuygunMcpClientError("Enuygun tarife bagaj hakkı doğrulanamadı.", "format_changed");
    }
    const part = finitePackageNumber(item?.attributes?.piece ?? item?.piece ?? item?.part);
    const allowance = finitePackageNumber(item?.attributes?.allowance ?? item?.allowance);
    if (!Number.isSafeInteger(part) || (part as number) < 1 || (part as number) > 3
        || allowance === null || allowance <= 0 || allowance > 50) {
      throw new EnuygunMcpClientError("Enuygun tarife bagaj hakkı doğrulanamadı.", "format_changed");
    }
    checkedRows.push({ part: part as number, allowance });
  }

  return {
    checkedBags: checkedRows.length ? Math.min(...checkedRows.map((item) => item.part)) : 0,
    checkedWeight: checkedRows.length ? Math.min(...checkedRows.map((item) => item.allowance)) : null,
  };
}

function baggageForFlight(flight: JsonRecord) {
  const baggage = flight?.infos?.baggage_info;
  if (baggage === null || baggage === undefined) return null;
  if (typeof baggage !== "object" || Array.isArray(baggage)) {
    throw new EnuygunMcpClientError("Enuygun bagaj bilgisi doğrulanamadı.", "format_changed");
  }
  const carry = baggage?.carryOn;
  if (!carry || typeof carry !== "object" || Array.isArray(carry)
      || !Number.isSafeInteger(carry.part) || carry.part < 0 || carry.part > 3) {
    throw new EnuygunMcpClientError("Enuygun bagaj bilgisi doğrulanamadı.", "format_changed");
  }

  if (baggage.firstBaggageCollection === undefined) {
    return { cabinBags: carry.part, ...selectedPackageCheckedBaggage(flight) };
  }
  if (!Array.isArray(baggage.firstBaggageCollection)) {
    throw new EnuygunMcpClientError("Enuygun bagaj bilgisi doğrulanamadı.", "format_changed");
  }
  const checkedRows = baggage.firstBaggageCollection
    .filter((item: JsonRecord) => !item?.paxType || item.paxType === "adult");
  if (baggage.firstBaggageCollection.length > 0 && checkedRows.length === 0) {
    throw new EnuygunMcpClientError("Enuygun bagaj bilgisi doğrulanamadı.", "format_changed");
  }
  if (checkedRows.some((item: JsonRecord) => typeof item !== "object" || Array.isArray(item)
      || !Number.isSafeInteger(item.part) || item.part < 0 || item.part > 3)) {
    throw new EnuygunMcpClientError("Enuygun bagaj bilgisi doğrulanamadı.", "format_changed");
  }
  const cabinBags = carry.part;
  const checkedBags = checkedRows.length
    ? Math.min(...checkedRows.map((item: JsonRecord) => item.part as number))
    : 0;
  const checkedAllowances: Array<number | null> = checkedRows
    .filter((item: JsonRecord) => item.part > 0)
    .map((item: JsonRecord) => finite(item.allowance));
  if (checkedAllowances.some((allowance) => allowance === null || allowance <= 0 || allowance > 50)) {
    throw new EnuygunMcpClientError("Enuygun bagaj hakkı doğrulanamadı.", "format_changed");
  }
  return {
    cabinBags,
    checkedBags,
    checkedWeight: checkedBags > 0
      ? Math.min(...checkedAllowances.map((allowance) => allowance as number))
      : null,
  };
}

function combinedBaggage(flights: JsonRecord[]) {
  const rows = flights.map(baggageForFlight);
  if (rows.some((row) => row === null)) return null;
  const knownRows = rows.filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    cabinBagsPerPassenger: knownRows.length ? Math.min(...knownRows.map((row) => row.cabinBags)) : 0,
    checkedBagsPerPassenger: knownRows.length ? Math.min(...knownRows.map((row) => row.checkedBags)) : 0,
    checkedBagWeightKg: knownRows.length && knownRows.every((row) => row.checkedWeight !== null)
      ? Math.min(...knownRows.map((row) => row.checkedWeight as number))
      : null,
    additionalCabinBagFeeTotal: null,
    additionalCheckedBagFeeTotal: null,
  } as const;
}

function combinedFareFamily(flights: JsonRecord[]) {
  const names = flights.map((flight) => (
    typeof flight?.provider_packages?.[0]?.name === "string"
      ? flight.provider_packages[0].name.trim().slice(0, 80)
      : ""
  )).filter(Boolean);
  return names.length && names.every((name) => name === names[0]) ? names[0] : null;
}

export function livePriceForEnuygunOffer(
  data: JsonRecord,
  sourceOfferRef: string,
  request: FlightSearchRequest,
): EnuygunLivePrice {
  const ids = parseEnuygunSourceOfferRef(sourceOfferRef);
  const observedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(observedAt) + OFFER_TTL_MS).toISOString();
  const expectedLegCount = request.tripType === "round_trip" ? 2 : 1;
  if (!ids.length || ids.length !== expectedLegCount) {
    throw new EnuygunMcpClientError("Enuygun uçuş seçimi geçersiz.", "format_changed");
  }

  if (!data?.flights || typeof data.flights !== "object" || !Array.isArray(data.flights.departure)
      || (ids.length === 2 && !Array.isArray(data.flights.return))) {
    throw new EnuygunMcpClientError("Enuygun uçuş yanıt şeması değişti.", "format_changed");
  }
  const departure = data.flights.departure;
  const returning = Array.isArray(data.flights.return) ? data.flights.return : [];
  const first = departure.find((flight: JsonRecord) => flight?.enuid === ids[0]);
  const second = ids.length === 2
    ? returning.find((flight: JsonRecord) => flight?.enuid === ids[1])
    : null;
  const selected = ids.length === 2 ? [first, second] : [first];
  if (selected.some((flight) => !flight)) {
    return { available: false, total: null, currency: null, baggage: null, fareFamily: null, observedAt, expiresAt };
  }
  const selectedFlights = selected as JsonRecord[];
  const selectedSegments = selectedFlights.flatMap((flight) => (
    Array.isArray(flight?.segments) ? flight.segments : []
  ));
  if (selectedFlights.some((flight) => !Array.isArray(flight?.segments)
      || flight.segments.length < 1 || flight.segments.length > 8
      || flight.segments.some((segment: JsonRecord) => !normalizedCabin(segment?.cabin_class)))
      || selectedSegments.length > 8) {
    throw new EnuygunMcpClientError("Enuygun seçili uçuş ayrıntıları doğrulanamadı.", "format_changed");
  }
  const routeMatches = selectedFlights.every((flight, legIndex) => {
    if (!recognizableFlight(flight, request.cabinClass, request.currency)) return false;
    const segments = flight.segments as JsonRecord[];
    if (request.directOnly && segments.length !== 1) return false;
    const expectedOrigin = legIndex === 0 ? request.origin : request.destination;
    const expectedDestination = legIndex === 0 ? request.destination : request.origin;
    const expectedDate = legIndex === 0 ? request.departureDate : request.returnDate;
    if (!expectedDate || !selectedScheduleValid(flight, ddmmyyyy(expectedDate))) return false;
    const actualOrigin = typeof segments[0]?.origin === "string" ? segments[0].origin.trim().toUpperCase() : "";
    const lastSegment = segments[segments.length - 1];
    const actualDestination = typeof lastSegment?.destination === "string"
      ? lastSegment.destination.trim().toUpperCase()
      : "";
    return airportMatchesRequest(expectedOrigin, actualOrigin, request.includeNearbyAirports)
      && airportMatchesRequest(expectedDestination, actualDestination, request.includeNearbyAirports);
  });
  if (!routeMatches) {
    throw new EnuygunMcpClientError("Enuygun seçili uçuş rotası veya kabini değişti.", "format_changed");
  }
  const prices = selectedFlights.map((flight) => ({
    total: finite(flight?.price_breakdown?.total),
    currency: cleanCurrency(flight?.price_breakdown?.currency),
  }));
  if (prices.some((price) => price.total === null || price.total <= 0 || !price.currency)
      || prices.some((price) => price.currency !== request.currency || price.currency !== prices[0].currency)) {
    throw new EnuygunMcpClientError("Enuygun seçili uçuş fiyatı doğrulanamadı.", "format_changed");
  }
  return {
    available: true,
    total: prices.reduce((sum, price) => sum + (price.total || 0), 0),
    currency: prices[0].currency,
    baggage: combinedBaggage(selectedFlights),
    fareFamily: combinedFareFamily(selectedFlights),
    observedAt,
    expiresAt,
  };
}

export async function allocateEnuygunMcpInSession(
  sourceOfferRef: string,
  session: EnuygunMcpSession,
  signal?: AbortSignal,
) {
  try {
    const flightIds = parseEnuygunSourceOfferRef(sourceOfferRef);
    if (!flightIds.length) throw new EnuygunMcpClientError("Enuygun uçuş seçimi geçersiz.", "format_changed");
    const called = await callTool("flight_allocate", { flight_ids: flightIds }, signal, session);
    const deepLink = typeof called.data.deep_link_url === "string" ? called.data.deep_link_url.trim() : "";
    if (!deepLink) throw new EnuygunMcpClientError("Enuygun yönlendirme bağlantısı üretilemedi.", "format_changed");
    return deepLink;
  } finally {
    await closeEnuygunMcpSession(session);
  }
}
