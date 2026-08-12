import assert from "node:assert/strict";
import test from "node:test";
import {
  enuygunMcpConnector,
  normalizeEnuygunSearchData,
  parseEnuygunFlightIds,
} from "./enuygun-mcp.mjs";

const MCP_PROTOCOL_VERSION = "2025-06-18";

const request = {
  tripType: "one_way",
  origin: "IST",
  destination: "AYT",
  departureDate: "2026-08-20",
  returnDate: null,
  passengers: { adults: 2, children: 0, infants: 0 },
  cabinClass: "economy",
  baggage: { cabinBagsPerPassenger: 1, checkedBagsPerPassenger: 0, checkedBagWeightKg: null },
  currency: "TRY",
  directOnly: false,
  includeNearbyAirports: true,
  flexibleDates: 0,
  preferredAirlines: [],
  excludedAirlines: [],
  preferredSources: [],
  excludedSources: [],
  eligiblePriceConditions: [],
};

function flight(id, origin, destination, departure, arrival, total) {
  return {
    enuid: id,
    price_breakdown: { total, currency: "TRY" },
    infos: {
      baggage_info: {
        carryOn: { part: 1, allowance: 8 },
        firstBaggageCollection: [{ paxType: "adult", part: 1, allowance: 15 }],
      },
    },
    provider_packages: [{ name: "BASIC" }],
    segments: [{
      departure_datetime: departure,
      arrival_datetime: arrival,
      flight_number: id.split(":")[0],
      origin,
      destination,
      marketing_airline: "VF",
      operating_airline: "VF",
      cabin_class: "economy",
      is_virtual_interlining: 0,
    }],
  };
}

const outbound = flight(
  "VF3048:P:2026-08-20 00:15:00:15X1",
  "SAW",
  "AYT",
  { date: "20.08.2026", time: "00:15", timestamp: 1787174100 },
  { date: "20.08.2026", time: "01:40", timestamp: 1787179200 },
  3940,
);
const inbound = flight(
  "VF3047:P:2026-08-23 07:50:00:15X1",
  "AYT",
  "SAW",
  { date: "23.08.2026", time: "07:50", timestamp: 1787460600 },
  { date: "23.08.2026", time: "09:15", timestamp: 1787465700 },
  4200,
);
const data = {
  flights: { departure: [outbound], return: [inbound] },
  airlines: [{ code: "VF", name: "AJet" }],
};

test("one-way MCP response becomes a canonical real-price offer", () => {
  const offers = normalizeEnuygunSearchData(data, request, "2026-08-09T16:00:00.000Z");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price.total, 3940);
  assert.equal(offers[0].passengerCount, 2);
  assert.equal(offers[0].segments[0].origin.code, "SAW");
  assert.equal(offers[0].segments[0].departureUtc, "2026-08-19T21:15:00.000Z");
  assert.equal(offers[0].segments[0].departureLocal, "2026-08-20T00:15:00+03:00");
  assert.equal(offers[0].baggage.checkedBagWeightKg, 15);
  assert.equal(offers[0].price.includesMandatoryFees, false);
  assert.equal(offers[0].checkoutUrl, null);
});

test("round-trip price is the sum of the selected outbound and return flights", () => {
  const offers = normalizeEnuygunSearchData(data, {
    ...request,
    tripType: "round_trip",
    returnDate: "2026-08-23",
  }, "2026-08-09T16:00:00.000Z");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price.total, 8140);
  assert.equal(offers[0].segments.length, 2);
  assert.equal(offers[0].segments[1].legIndex, 1);
  assert.deepEqual(parseEnuygunFlightIds(offers[0].sourceOfferId), [outbound.enuid, inbound.enuid]);
});

test("wrong-currency and malformed flight selections are rejected", () => {
  const wrongCurrency = structuredClone(data);
  wrongCurrency.flights.departure[0].price_breakdown.currency = "EUR";
  assert.throws(() => normalizeEnuygunSearchData(wrongCurrency, request), /doğrulanamadı/);
  assert.throws(() => normalizeEnuygunSearchData({ flights: {} }, request), /şeması değişti/);
  assert.deepEqual(parseEnuygunFlightIds(""), []);
  assert.deepEqual(parseEnuygunFlightIds("a|b|c"), []);
  assert.deepEqual(parseEnuygunFlightIds("abc||def"), []);
  assert.deepEqual(parseEnuygunFlightIds(" abc"), []);
});

test("unknown or malformed baggage is never converted into a zero-bag claim", () => {
  const absent = structuredClone(data);
  delete absent.flights.departure[0].infos.baggage_info;
  assert.deepEqual(normalizeEnuygunSearchData(absent, request), []);

  const malformed = structuredClone(data);
  malformed.flights.departure[0].infos.baggage_info.carryOn.part = "1";
  assert.deepEqual(normalizeEnuygunSearchData(malformed, request), []);

  const explicitZero = structuredClone(data);
  explicitZero.flights.departure[0].infos.baggage_info.carryOn.part = 0;
  explicitZero.flights.departure[0].infos.baggage_info.firstBaggageCollection = [];
  const offers = normalizeEnuygunSearchData(explicitZero, request);
  assert.equal(offers[0].baggage.cabinBagsPerPassenger, 0);
  assert.equal(offers[0].baggage.checkedBagsPerPassenger, 0);
  assert.equal(offers[0].baggage.checkedBagWeightKg, null);
});

test("current MCP package items supply checked-baggage evidence when the legacy collection is absent", () => {
  const currentShape = structuredClone(data);
  delete currentShape.flights.departure[0].infos.baggage_info.firstBaggageCollection;
  currentShape.flights.departure[0].provider_packages = [{
    name: "LIGHT",
    items: [
      { type: "hand_bag", is_available: 1, attributes: { piece: 1, allowance: "3" } },
      { type: "change", is_available: 0 },
      { type: "refund", is_available: 0 },
    ],
  }];
  const offers = normalizeEnuygunSearchData(currentShape, request);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].baggage.cabinBagsPerPassenger, 1);
  assert.equal(offers[0].baggage.checkedBagsPerPassenger, 0);
  assert.equal(offers[0].baggage.checkedBagWeightKg, null);

  currentShape.flights.departure[0].provider_packages[0].items.push({
    type: "checked_baggage",
    is_available: 1,
    attributes: { piece: 1, allowance: "20" },
  });
  const checkedOffers = normalizeEnuygunSearchData(currentShape, request);
  assert.equal(checkedOffers[0].baggage.checkedBagsPerPassenger, 1);
  assert.equal(checkedOffers[0].baggage.checkedBagWeightKg, 20);
});

test("alternate MCP package labels and availability fields preserve a verified zero checked-bag fare", () => {
  const alternateShape = structuredClone(data);
  delete alternateShape.flights.departure[0].infos.baggage_info.firstBaggageCollection;
  alternateShape.flights.departure[0].provider_packages = [{
    name: "LIGHT",
    items: [
      { key: "hand-baggage", included: "yes", attributes: { count: "1", kg: "3" } },
      { label: "Change", status: "not_available" },
      { title: "Refund", available: false },
    ],
  }];

  const offers = normalizeEnuygunSearchData(alternateShape, request);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].baggage.cabinBagsPerPassenger, 1);
  assert.equal(offers[0].baggage.checkedBagsPerPassenger, 0);
  assert.equal(offers[0].baggage.checkedBagWeightKg, null);
});

test("missing legacy baggage collection still fails closed without valid package evidence", () => {
  const missingItems = structuredClone(data);
  delete missingItems.flights.departure[0].infos.baggage_info.firstBaggageCollection;
  assert.deepEqual(normalizeEnuygunSearchData(missingItems, request), []);

  const malformedCheckedBag = structuredClone(missingItems);
  malformedCheckedBag.flights.departure[0].provider_packages[0].items = [{
    type: "checked_baggage",
    is_available: 1,
    attributes: { piece: 1, allowance: "unknown" },
  }];
  assert.deepEqual(normalizeEnuygunSearchData(malformedCheckedBag, request), []);
});

test("round-trip normalization bounds each leg before pair allocation", { timeout: 5_000 }, () => {
  const departures = Array.from({ length: 1_000 }, (_, index) => ({
    ...structuredClone(outbound),
    enuid: `OUT${index}:P:2026-08-20 00:15:00:15X1`,
    price_breakdown: { total: 1_000 + index, currency: "TRY" },
  }));
  const returns = Array.from({ length: 1_000 }, (_, index) => ({
    ...structuredClone(inbound),
    enuid: `IN${index}:P:2026-08-23 07:50:00:15X1`,
    price_breakdown: { total: 2_000 + index, currency: "TRY" },
  }));
  const offers = normalizeEnuygunSearchData({
    ...data,
    flights: { departure: departures, return: returns },
  }, {
    ...request,
    tripType: "round_trip",
    returnDate: "2026-08-23",
  });
  assert.equal(offers.length, 80);
  assert.equal(offers[0].price.total, 3_000);
});

function initializeResponse(sessionId) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} } },
  }), {
    status: 200,
    headers: { "content-type": "application/json", "mcp-session-id": sessionId },
  });
}

function toolResponse(resultData) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: { structuredContent: { success: true, data: resultData } },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

async function withMockFetch(mock, run) {
  const originalFetch = globalThis.fetch;
  const previousEnabled = process.env.ENUYGUN_MCP_ENABLED;
  process.env.ENUYGUN_MCP_ENABLED = "true";
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnabled === undefined) delete process.env.ENUYGUN_MCP_ENABLED;
    else process.env.ENUYGUN_MCP_ENABLED = previousEnabled;
  }
}

test("worker closes a successful MCP session without letting DELETE failure mask offers", async () => {
  let deleteCalls = 0;
  const result = await withMockFetch(async (_url, init) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      throw new Error("provider does not support session deletion");
    }
    const body = JSON.parse(init.body);
    if (body.method === "initialize") return initializeResponse("success-session");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") return toolResponse(data);
    throw new Error(`unexpected method: ${body.method}`);
  }, () => enuygunMcpConnector.search(request, {}));

  assert.equal(result.outcome, "success");
  assert.equal(deleteCalls, 1);
});

test("worker closes an MCP session after a tool error", async () => {
  let deleteCalls = 0;
  const result = await withMockFetch(async (_url, init) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(init.body);
    if (body.method === "initialize") return initializeResponse("error-session");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") return new Response("temporary failure", { status: 500 });
    throw new Error(`unexpected method: ${body.method}`);
  }, () => enuygunMcpConnector.search(request, {}));

  assert.equal(result.outcome, "temporarily_unavailable");
  assert.equal(result.errorCode, "temporarily_unavailable");
  assert.equal(deleteCalls, 1);
});

test("worker retries an expired read-only MCP session only once", async () => {
  let initializeCalls = 0;
  let toolCalls = 0;
  let deleteCalls = 0;
  const result = await withMockFetch(async (_url, init) => {
    if (init.method === "DELETE") {
      deleteCalls += 1;
      return new Response(null, { status: 204 });
    }
    const body = JSON.parse(init.body);
    if (body.method === "initialize") {
      initializeCalls += 1;
      return initializeResponse(`session-${initializeCalls}`);
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") {
      toolCalls += 1;
      return toolCalls === 1
        ? new Response("expired", { status: 404 })
        : toolResponse(data);
    }
    throw new Error(`unexpected method: ${body.method}`);
  }, () => enuygunMcpConnector.search(request, {}));

  assert.equal(result.outcome, "success");
  assert.equal(initializeCalls, 2);
  assert.equal(toolCalls, 2);
  assert.equal(deleteCalls, 2);
});

test("worker rejects contradictory success and failure tool blocks", async () => {
  const result = await withMockFetch(async (_url, init) => {
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    const body = JSON.parse(init.body);
    if (body.method === "initialize") return initializeResponse("conflict-session");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
          structuredContent: { success: true, data },
          content: [{ type: "text", text: JSON.stringify({ success: false, data: { reason: "conflict" } }) }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected method: ${body.method}`);
  }, () => enuygunMcpConnector.search(request, {}));

  assert.equal(result.outcome, "temporarily_unavailable");
  assert.equal(result.errorCode, "format_changed");
});

test("malformed baggage never becomes a fabricated zero or one-piece allowance", () => {
  const malformed = structuredClone(data);
  malformed.flights.departure[0].infos.baggage_info.carryOn = {};
  assert.deepEqual(normalizeEnuygunSearchData(malformed, request), []);
});

test("round-trip normalization bounds the Cartesian result set", () => {
  const many = {
    ...data,
    flights: {
      departure: Array.from({ length: 120 }, (_, index) => ({
        ...structuredClone(outbound),
        enuid: `OUT${index}:P:2026-08-20 00:15:00:15X1`,
        price_breakdown: { total: 1000 + index, currency: "TRY" },
      })),
      return: Array.from({ length: 120 }, (_, index) => ({
        ...structuredClone(inbound),
        enuid: `IN${index}:P:2026-08-23 07:50:00:15X1`,
        price_breakdown: { total: 1200 + index, currency: "TRY" },
      })),
    },
  };
  const offers = normalizeEnuygunSearchData(many, {
    ...request,
    tripType: "round_trip",
    returnDate: "2026-08-23",
  });
  assert.equal(offers.length, 80);
  assert.ok(offers.every((offer) => offer.segments.length === 2));
});
