const MCP_ENDPOINT = "https://mcp.enuygun.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_MCP_RESPONSE_BYTES = 2_500_000;
const MAX_NORMALIZED_OFFERS = 80;
const MAX_ROUND_TRIP_LEG_OPTIONS = MAX_NORMALIZED_OFFERS;
const SESSION_CLOSE_TIMEOUT_MS = 3_000;
const OFFER_TTL_MS = 5 * 60 * 1_000;

class EnuygunMcpError extends Error {
  constructor(message, code = "temporarily_unavailable", httpStatus = null, sessionBound = false) {
    super(message);
    this.name = "EnuygunMcpError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.sessionBound = sessionBound;
  }
}

function connectorErrorCode(status) {
  if (status === 401 || status === 403) return "authorization_failed";
  if (status === 429) return "quota_exceeded";
  if (status >= 400 && status < 500) return "format_changed";
  return "temporarily_unavailable";
}

async function readBoundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MCP_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new EnuygunMcpError("MCP yanıtı güvenli boyut sınırını aştı.", "format_changed");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function jsonRpcCandidates(text, contentType) {
  if (!contentType.includes("text/event-stream")) return [text.trim()];
  return text.replace(/\r\n/g, "\n").split(/\n\n+/).flatMap((event) => {
    const data = event.split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    return data.length ? [data.join("\n")] : [];
  });
}

function parseJsonRpcPayload(text, contentType, expectedId) {
  const candidates = jsonRpcCandidates(text, contentType);
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed?.jsonrpc === "2.0" && parsed.id === expectedId) return parsed;
    } catch {
      // Aynı SSE akışındaki sonraki JSON-RPC mesajını dene.
    }
  }
  throw new EnuygunMcpError("MCP JSON-RPC yanıtı istek kimliğiyle eşleşmedi.", "format_changed");
}

async function jsonRpc(method, params, options = {}) {
  const requestId = options.id ?? 1;
  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": options.protocolVersion || MCP_PROTOCOL_VERSION,
      ...(options.sessionId ? { "Mcp-Session-Id": options.sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
    redirect: "error",
    signal: options.signal,
  }).catch((error) => {
    if (options.signal?.aborted) throw error;
    throw new EnuygunMcpError("Enuygun MCP ağına bağlanılamadı.", "network_error");
  });
  const text = await readBoundedText(response);
  if (!response.ok) {
    throw new EnuygunMcpError(
      `Enuygun MCP HTTP ${response.status} yanıtı verdi.`,
      connectorErrorCode(response.status),
      response.status,
      Boolean(options.sessionId),
    );
  }
  const payload = parseJsonRpcPayload(text, response.headers.get("content-type") || "", requestId);
  if (payload.error) {
    throw new EnuygunMcpError("Enuygun MCP çağrısı hata döndürdü.", "temporarily_unavailable");
  }
  return { payload, sessionId: response.headers.get("mcp-session-id") || options.sessionId || "" };
}

async function sendInitializedNotification(sessionId, protocolVersion, signal) {
  const response = await fetch(MCP_ENDPOINT, {
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
  }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new EnuygunMcpError("Enuygun MCP oturumu başlatılamadı.", "network_error");
  });
  if (response.status !== 202) {
    await readBoundedText(response).catch(() => "");
    throw new EnuygunMcpError(
      "Enuygun MCP initialized bildirimi kabul edilmedi.",
      connectorErrorCode(response.status),
      response.status,
      true,
    );
  }
  if (response.body) await response.body.cancel().catch(() => undefined);
}

async function closeSession(sessionId, protocolVersion) {
  if (!sessionId) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_CLOSE_TIMEOUT_MS);
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: "DELETE",
      headers: {
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": protocolVersion || MCP_PROTOCOL_VERSION,
        "Mcp-Session-Id": sessionId,
      },
      redirect: "error",
      signal: controller.signal,
    });
    if (response.body) await response.body.cancel().catch(() => undefined);
  } catch {
    // Oturum kapatma best-effort'tur; ana çağrının sonucunu veya hatasını maskelemez.
  } finally {
    clearTimeout(timeout);
  }
}

function parsedToolEnvelope(result) {
  if (!result || result.isError === true) {
    throw new EnuygunMcpError("Enuygun MCP araç yanıtı geçersiz.", "format_changed");
  }
  const candidates = [];
  if (result.structuredContent && typeof result.structuredContent === "object") {
    candidates.push(result.structuredContent);
  }
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item?.type !== "text" || typeof item.text !== "string") continue;
      try {
        candidates.push(JSON.parse(item.text));
      } catch {
        // Araçlar açıklama metni de döndürebilir; yalnız JSON bloklarını değerlendir.
      }
    }
  }
  if (candidates.some((candidate) => (
    candidate && typeof candidate === "object" && candidate.success === false
  ))) {
    throw new EnuygunMcpError("Enuygun MCP araç blokları başarı ve hata açısından çelişiyor.", "format_changed");
  }
  const envelopes = candidates.filter((candidate) => (
    candidate && typeof candidate === "object" && candidate.success === true
    && candidate.data && typeof candidate.data === "object"
  ));
  if (!envelopes.length) {
    throw new EnuygunMcpError("Enuygun MCP araç verisi doğrulanamadı.", "format_changed");
  }
  const canonical = JSON.stringify(envelopes[0]);
  if (envelopes.some((candidate) => JSON.stringify(candidate) !== canonical)) {
    throw new EnuygunMcpError("Enuygun MCP araç blokları birbiriyle çelişiyor.", "format_changed");
  }
  return envelopes[0];
}

async function createSession(signal) {
  const initialized = await jsonRpc("initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "letsgo2travel-flight-worker", version: "0.2.0" },
  }, { id: 1, signal });
  const sessionId = initialized.sessionId;
  const protocolVersion = initialized.payload?.result?.protocolVersion;
  try {
    if (!sessionId) {
      throw new EnuygunMcpError("Enuygun MCP oturumu oluşturulamadı.", "format_changed");
    }
    const toolsCapability = initialized.payload?.result?.capabilities?.tools;
    if (protocolVersion !== MCP_PROTOCOL_VERSION || !toolsCapability || typeof toolsCapability !== "object") {
      throw new EnuygunMcpError("Enuygun MCP protokol veya araç yeteneği doğrulanamadı.", "format_changed");
    }
    await sendInitializedNotification(sessionId, protocolVersion, signal);
    return { sessionId, protocolVersion };
  } catch (error) {
    await closeSession(sessionId, protocolVersion || MCP_PROTOCOL_VERSION);
    throw error;
  }
}

async function callToolOnce(name, args, signal) {
  const session = await createSession(signal);
  try {
    const called = await jsonRpc("tools/call", { name, arguments: args }, {
      id: 2,
      sessionId: session.sessionId,
      protocolVersion: session.protocolVersion,
      signal,
    });
    return parsedToolEnvelope(called.payload?.result).data;
  } finally {
    await closeSession(session.sessionId, session.protocolVersion);
  }
}

async function callTool(name, args, signal) {
  try {
    return await callToolOnce(name, args, signal);
  } catch (error) {
    const expiredReadSession = name === "flight_search"
      && error instanceof EnuygunMcpError
      && error.httpStatus === 404
      && error.sessionBound === true
      && !signal?.aborted;
    if (!expiredReadSession) throw error;
    return callToolOnce(name, args, signal);
  }
}

function ddmmyyyy(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "";
}

function cabinClass(value) {
  return String(value || "economy").toUpperCase();
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plain(value, maximum = 100) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum) : "";
}

function localIso(dateValue, timeValue, timestampValue) {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(dateValue || ""));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ""));
  const timestamp = finiteNumber(timestampValue);
  if (!dateMatch || !timeMatch || timestamp === null) return "";
  const year = Number(dateMatch[3]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[1]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const utcInstant = Math.round(timestamp) * 1_000;
  const offsetMinutes = Math.round((localAsUtc - utcInstant) / 60_000);
  if (Math.abs(offsetMinutes) > 14 * 60) return "";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
}

function normalizedCabin(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["economy", "premium_economy", "business", "first"].includes(normalized)) return normalized;
  return null;
}

function airlineNames(data) {
  return new Map((Array.isArray(data?.airlines) ? data.airlines : []).flatMap((airline) => {
    const code = plain(airline?.code, 3).toUpperCase();
    const name = plain(airline?.name || airline?.originalName, 100);
    return code && name ? [[code, name]] : [];
  }));
}

function convertSegment(segment, legIndex, requestedCabin, names) {
  const departureTimestamp = finiteNumber(segment?.departure_datetime?.timestamp);
  const arrivalTimestamp = finiteNumber(segment?.arrival_datetime?.timestamp);
  const marketingCode = plain(segment?.marketing_airline, 3).toUpperCase();
  const operatingCode = plain(segment?.operating_airline || segment?.marketing_airline, 3).toUpperCase();
  const segmentCabin = normalizedCabin(segment?.cabin_class);
  if (departureTimestamp === null || arrivalTimestamp === null) return null;
  const departureLocal = localIso(
    segment?.departure_datetime?.date,
    segment?.departure_datetime?.time,
    departureTimestamp,
  );
  const arrivalLocal = localIso(
    segment?.arrival_datetime?.date,
    segment?.arrival_datetime?.time,
    arrivalTimestamp,
  );
  if (!departureLocal || !arrivalLocal || !segmentCabin || segmentCabin !== requestedCabin) return null;
  return {
    legIndex,
    marketingCarrierCode: marketingCode,
    marketingCarrierName: names.get(marketingCode) || null,
    operatingCarrierCode: operatingCode,
    operatingCarrierName: names.get(operatingCode) || null,
    flightNumber: plain(segment?.flight_number, 12),
    origin: { code: plain(segment?.origin, 3).toUpperCase(), terminal: plain(segment?.origin_terminal, 20) || null },
    destination: { code: plain(segment?.destination, 3).toUpperCase(), terminal: plain(segment?.destination_terminal, 20) || null },
    departureLocal,
    departureUtc: new Date(departureTimestamp * 1_000).toISOString(),
    arrivalLocal,
    arrivalUtc: new Date(arrivalTimestamp * 1_000).toISOString(),
    durationMinutes: Math.max(1, Math.round((arrivalTimestamp - departureTimestamp) / 60)),
    cabinClass: segmentCabin,
    aircraft: null,
    selfTransfer: segment?.is_virtual_interlining === 1,
  };
}

function baggageForFlight(flight) {
  const baggage = flight?.infos?.baggage_info;
  if (!baggage || typeof baggage !== "object" || Array.isArray(baggage)) return null;
  const carry = baggage?.carryOn;
  if (!carry || typeof carry !== "object" || Array.isArray(carry)
      || !Number.isSafeInteger(carry.part) || carry.part < 0 || carry.part > 3
      || !Array.isArray(baggage.firstBaggageCollection)) return null;
  const checkedRows = baggage.firstBaggageCollection
    .filter((item) => !item?.paxType || item.paxType === "adult");
  if (baggage.firstBaggageCollection.length > 0 && checkedRows.length === 0) return null;
  if (checkedRows.some((item) => typeof item !== "object" || Array.isArray(item)
      || !Number.isSafeInteger(item.part) || item.part < 0 || item.part > 3)) return null;
  const cabinBags = carry.part;
  const checkedBags = checkedRows.length ? Math.min(...checkedRows.map((item) => item.part)) : 0;
  const checkedAllowances = checkedRows
    .filter((item) => item.part > 0)
    .map((item) => finiteNumber(item.allowance));
  if (checkedAllowances.some((allowance) => allowance === null || allowance <= 0 || allowance > 50)) return null;
  return {
    cabinBags,
    checkedBags,
    checkedWeight: checkedBags > 0 ? Math.min(...checkedAllowances) : null,
  };
}

function combinedBaggage(flights) {
  const rows = flights.map(baggageForFlight);
  if (rows.some((row) => row === null)) return null;
  return {
    cabinBagsPerPassenger: rows.length ? Math.min(...rows.map((row) => row.cabinBags)) : 0,
    checkedBagsPerPassenger: rows.length ? Math.min(...rows.map((row) => row.checkedBags)) : 0,
    checkedBagWeightKg: rows.length && rows.every((row) => row.checkedWeight !== null)
      ? Math.min(...rows.map((row) => row.checkedWeight))
      : null,
    additionalCabinBagFeeTotal: null,
    additionalCheckedBagFeeTotal: null,
  };
}

function flightPrice(flight) {
  const total = finiteNumber(flight?.price_breakdown?.total);
  const currency = plain(flight?.price_breakdown?.currency, 3).toUpperCase();
  return total !== null && total > 0 && /^[A-Z]{3}$/.test(currency) ? { total, currency } : null;
}

function recognizableFlight(flight, requestedCabin, requestedCurrency) {
  const price = flightPrice(flight);
  if (!flight || typeof flight !== "object" || !plain(flight.enuid, 100)
      || !price || price.currency !== requestedCurrency) return false;
  if (!Array.isArray(flight.segments) || flight.segments.length < 1 || flight.segments.length > 8) return false;
  return flight.segments.every((segment) => normalizedCabin(segment?.cabin_class) === requestedCabin);
}

export function validateEnuygunSearchData(data, request) {
  const flights = data?.flights;
  if (!flights || typeof flights !== "object" || !Array.isArray(flights.departure)) {
    throw new EnuygunMcpError("Enuygun uçuş yanıt şeması değişti.", "format_changed");
  }
  if (request.tripType === "round_trip" && !Array.isArray(flights.return)) {
    throw new EnuygunMcpError("Enuygun dönüş uçuşu şeması değişti.", "format_changed");
  }
  const returning = Array.isArray(flights.return) ? flights.return : [];
  if (flights.departure.length
      && !flights.departure.some((flight) => recognizableFlight(flight, request.cabinClass, request.currency))) {
    throw new EnuygunMcpError("Enuygun gidiş teklifleri doğrulanamadı.", "format_changed");
  }
  if (returning.length
      && !returning.some((flight) => recognizableFlight(flight, request.cabinClass, request.currency))) {
    throw new EnuygunMcpError("Enuygun dönüş teklifleri doğrulanamadı.", "format_changed");
  }
  return data;
}

function farePackage(flights) {
  const names = flights.map((flight) => plain(flight?.provider_packages?.[0]?.name, 30)).filter(Boolean);
  return names.length && names.every((name) => name === names[0]) ? names[0] : "STANDARD";
}

function flightBenefits(baggage) {
  const values = [];
  if (baggage.cabinBagsPerPassenger > 0) values.push(`${baggage.cabinBagsPerPassenger} parça kabin bagajı`);
  if (baggage.checkedBagsPerPassenger > 0 && baggage.checkedBagWeightKg) {
    values.push(`${baggage.checkedBagsPerPassenger} parça, ${baggage.checkedBagWeightKg} kg kayıtlı bagaj`);
  }
  return values;
}

function offerFromFlights(flights, request, data, observedAt) {
  const prices = flights.map(flightPrice);
  if (prices.some((price) => !price) || prices.some((price) => price.currency !== request.currency)) return null;
  const names = airlineNames(data);
  const segments = flights.flatMap((flight, legIndex) => (
    (Array.isArray(flight?.segments) ? flight.segments : [])
      .map((segment) => convertSegment(segment, legIndex, request.cabinClass, names))
      .filter(Boolean)
  ));
  if (!segments.length || segments.length > 8) return null;
  const ids = flights.map((flight) => plain(flight?.enuid, 100));
  if (ids.some((id) => !id)) return null;
  const sourceOfferId = ids.join("|");
  if (sourceOfferId.length > 200) return null;
  const baggage = combinedBaggage(flights);
  if (!baggage) return null;
  return {
    sourceOfferId,
    segments,
    passengerCount: request.passengers.adults + request.passengers.children + request.passengers.infants,
    farePackage: farePackage(flights),
    price: {
      total: prices.reduce((sum, price) => sum + price.total, 0),
      currency: request.currency,
      includesMandatoryFees: false,
      baseFareTotal: null,
      taxesTotal: null,
      mandatoryFeesTotal: null,
      conditionalPrices: [],
    },
    baggage,
    refundable: null,
    changeable: null,
    installmentOptions: [],
    benefits: flightBenefits(baggage),
    directAirlineSale: false,
    checkoutUrl: null,
    observedAt,
    expiresAt: new Date(Date.parse(observedAt) + OFFER_TTL_MS).toISOString(),
    sponsored: flights.some((flight) => flight?.infos?.is_sponsor === 1),
  };
}

function pairFlights(data, request, observedAt) {
  const departure = Array.isArray(data?.flights?.departure) ? data.flights.departure : [];
  const returning = Array.isArray(data?.flights?.return) ? data.flights.return : [];
  if (request.tripType === "one_way") {
    return departure
      .map((flight) => offerFromFlights([flight], request, data, observedAt))
      .filter(Boolean)
      .sort((left, right) => left.price.total - right.price.total)
      .slice(0, MAX_NORMALIZED_OFFERS);
  }
  const boundedLeg = (flights) => flights
    .map((flight) => ({ flight, offer: offerFromFlights([flight], request, data, observedAt) }))
    .filter((row) => row.offer)
    .sort((left, right) => (
      left.offer.price.total - right.offer.price.total
      || left.offer.sourceOfferId.localeCompare(right.offer.sourceOfferId)
    ))
    .slice(0, MAX_ROUND_TRIP_LEG_OPTIONS)
    .map((row) => row.flight);
  const boundedDeparture = boundedLeg(departure);
  const boundedReturn = boundedLeg(returning);
  const combinations = [];
  for (const outbound of boundedDeparture) {
    for (const inbound of boundedReturn) {
      const offer = offerFromFlights([outbound, inbound], request, data, observedAt);
      if (offer) combinations.push(offer);
    }
  }
  return combinations
    .sort((left, right) => left.price.total - right.price.total)
    .slice(0, MAX_NORMALIZED_OFFERS);
}

export function normalizeEnuygunSearchData(data, request, observedAt = new Date().toISOString()) {
  return pairFlights(validateEnuygunSearchData(data, request), request, observedAt);
}

export function parseEnuygunFlightIds(sourceOfferId) {
  if (typeof sourceOfferId !== "string" || sourceOfferId.length < 3 || sourceOfferId.length > 200) return [];
  const ids = sourceOfferId.split("|");
  return ids.length >= 1 && ids.length <= 2
    && ids.every((value) => value === value.trim() && value.length >= 3 && value.length <= 100)
    ? ids
    : [];
}

export const enuygunMcpConnector = {
  id: "enuygun",
  name: "Enuygun",
  async search(request, context) {
    if (String(process.env.ENUYGUN_MCP_ENABLED || "true").toLowerCase() === "false") {
      return {
        outcome: "integration_required",
        offers: [],
        message: "Enuygun MCP connector ortam ayarıyla pasif.",
        errorCode: "integration_required",
      };
    }
    if (request.currency !== "TRY") {
      return {
        outcome: "no_results",
        offers: [],
        message: "Enuygun açık MCP kaynağı bu pilotta yalnız TRY fiyat döndürüyor.",
      };
    }
    try {
      const data = await callTool("flight_search", {
        origin: request.origin,
        destination: request.destination,
        departure_date: ddmmyyyy(request.departureDate),
        ...(request.tripType === "round_trip" && request.returnDate
          ? { return_date: ddmmyyyy(request.returnDate) }
          : {}),
        adults: request.passengers.adults,
        children: request.passengers.children,
        infants: request.passengers.infants,
        cabin_class: cabinClass(request.cabinClass),
        direct_flight: request.directOnly,
      }, context.signal);
      const observedAt = new Date().toISOString();
      const offers = normalizeEnuygunSearchData(data, request, observedAt);
      return offers.length
        ? { outcome: "success", offers, message: `${offers.length} Enuygun teklifi canlı olarak doğrulandı.` }
        : { outcome: "no_results", offers: [], message: "Enuygun bu arama için doğrulanabilir teklif döndürmedi." };
    } catch (error) {
      if (context.signal?.aborted) throw error;
      const code = error instanceof EnuygunMcpError ? error.code : "unknown";
      return {
        outcome: "temporarily_unavailable",
        offers: [],
        message: "Enuygun canlı uçuş kaynağı geçici olarak yanıt veremedi.",
        errorCode: code,
      };
    }
  },
};
