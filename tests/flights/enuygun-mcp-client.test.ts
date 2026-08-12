import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateEnuygunMcpInSession,
  EnuygunMcpClientError,
  livePriceForEnuygunOffer,
  searchEnuygunMcp,
} from "../../lib/flights/connectors/enuygun/mcp-client";
import type { FlightSearchRequest } from "../../lib/flights/core/types";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const sourceOfferRef = "VF3048:P:2026-08-20 00:15:00:15X1";
const request: FlightSearchRequest = {
  tripType: "one_way",
  origin: "SAW",
  destination: "AYT",
  departureDate: "2026-08-20",
  returnDate: null,
  passengers: { adults: 1, children: 0, infants: 0 },
  cabinClass: "economy",
  baggage: { cabinBagsPerPassenger: 1, checkedBagsPerPassenger: 0, checkedBagWeightKg: null },
  currency: "TRY",
  directOnly: false,
  includeNearbyAirports: false,
  flexibleDates: 0,
  preferredAirlines: [],
  excludedAirlines: [],
  preferredSources: [],
  excludedSources: [],
  eligiblePriceConditions: [],
};

function selectedFlight() {
  return {
    enuid: sourceOfferRef,
    price_breakdown: { total: 3_940, currency: "TRY" },
    infos: {
      baggage_info: {
        carryOn: { part: 1, allowance: 8 },
        firstBaggageCollection: [{ paxType: "adult", part: 1, allowance: 15 }],
      },
    },
    provider_packages: [{ name: "BASIC" }],
    segments: [{
      origin: "SAW",
      destination: "AYT",
      cabin_class: "economy",
      departure_datetime: { date: "20.08.2026", time: "00:15", timestamp: 1787174100 },
      arrival_datetime: { date: "20.08.2026", time: "01:40", timestamp: 1787179200 },
    }],
  };
}

function searchData() {
  return { flights: { departure: [selectedFlight()], return: [] } };
}

test("only an absent selected ID is reported unavailable", () => {
  const absent = livePriceForEnuygunOffer(
    { flights: { departure: [], return: [] } },
    sourceOfferRef,
    request,
  );
  assert.equal(absent.available, false);

  assert.throws(
    () => livePriceForEnuygunOffer(searchData(), "bad||id", request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );

  const malformedPrice = searchData();
  malformedPrice.flights.departure[0].price_breakdown.total = Number.NaN;
  assert.throws(
    () => livePriceForEnuygunOffer(malformedPrice, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );
});

test("selected-flight baggage stays unknown when absent and rejects malformed part values", () => {
  const absentBaggage = searchData();
  delete (absentBaggage.flights.departure[0].infos as { baggage_info?: unknown }).baggage_info;
  const live = livePriceForEnuygunOffer(absentBaggage, sourceOfferRef, request);
  assert.equal(live.available, true);
  assert.equal(live.baggage, null);

  const malformedBaggage = searchData();
  (malformedBaggage.flights.departure[0].infos.baggage_info.carryOn as { part: unknown }).part = "1";
  assert.throws(
    () => livePriceForEnuygunOffer(malformedBaggage, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );
});

test("current MCP package items revalidate baggage without the legacy collection", () => {
  const currentShape = searchData();
  const currentFlight = currentShape.flights.departure[0] as unknown as {
    infos: { baggage_info: { firstBaggageCollection?: unknown } };
    provider_packages: Array<{ name: string; items?: Array<Record<string, unknown>> }>;
  };
  delete (currentFlight.infos.baggage_info as {
    firstBaggageCollection?: unknown;
  }).firstBaggageCollection;
  currentFlight.provider_packages = [{
    name: "LIGHT",
    items: [
      { type: "hand_bag", is_available: 1, attributes: { piece: 1, allowance: "3" } },
      { type: "change", is_available: 0 },
      { type: "refund", is_available: 0 },
    ],
  }];

  const live = livePriceForEnuygunOffer(currentShape, sourceOfferRef, request);
  assert.equal(live.available, true);
  assert.equal(live.baggage?.cabinBagsPerPassenger, 1);
  assert.equal(live.baggage?.checkedBagsPerPassenger, 0);
  assert.equal(live.baggage?.checkedBagWeightKg, null);
});

test("alternate MCP package labels revalidate a verified zero checked-bag fare", () => {
  const alternateShape = searchData();
  const alternateFlight = alternateShape.flights.departure[0] as unknown as {
    infos: { baggage_info: { firstBaggageCollection?: unknown } };
    provider_packages: Array<{ name: string; items?: Array<Record<string, unknown>> }>;
  };
  delete alternateFlight.infos.baggage_info.firstBaggageCollection;
  alternateFlight.provider_packages = [{
    name: "LIGHT",
    items: [
      { key: "hand-baggage", included: "yes", attributes: { count: "1", kg: "3" } },
      { label: "Change", status: "not_available" },
      { title: "Refund", available: false },
    ],
  }];

  const live = livePriceForEnuygunOffer(alternateShape, sourceOfferRef, request);
  assert.equal(live.available, true);
  assert.equal(live.baggage?.cabinBagsPerPassenger, 1);
  assert.equal(live.baggage?.checkedBagsPerPassenger, 0);
  assert.equal(live.baggage?.checkedBagWeightKg, null);
});

test("current MCP baggage shape fails closed without valid package evidence", () => {
  const missingItems = searchData();
  const missingItemsFlight = missingItems.flights.departure[0] as unknown as {
    infos: { baggage_info: { firstBaggageCollection?: unknown } };
  };
  delete (missingItemsFlight.infos.baggage_info as {
    firstBaggageCollection?: unknown;
  }).firstBaggageCollection;
  assert.throws(
    () => livePriceForEnuygunOffer(missingItems, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );

  const malformedCheckedBag = searchData();
  const malformedCheckedBagFlight = malformedCheckedBag.flights.departure[0] as unknown as {
    infos: { baggage_info: { firstBaggageCollection?: unknown } };
    provider_packages: Array<{ name: string; items?: Array<Record<string, unknown>> }>;
  };
  delete (malformedCheckedBagFlight.infos.baggage_info as {
    firstBaggageCollection?: unknown;
  }).firstBaggageCollection;
  malformedCheckedBagFlight.provider_packages = [{
    name: "BASIC",
    items: [{
      type: "checked_baggage",
      is_available: 1,
      attributes: { piece: 1, allowance: "unknown" },
    }],
  }];
  assert.throws(
    () => livePriceForEnuygunOffer(malformedCheckedBag, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );
});

test("selected-flight date, chronology, route and cabin changes fail closed", () => {
  const wrongDate = searchData();
  wrongDate.flights.departure[0].segments[0].departure_datetime.date = "21.08.2026";
  assert.throws(
    () => livePriceForEnuygunOffer(wrongDate, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );

  const reversedTime = searchData();
  reversedTime.flights.departure[0].segments[0].arrival_datetime.timestamp = 1787170000;
  assert.throws(
    () => livePriceForEnuygunOffer(reversedTime, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );

  const wrongCabin = searchData();
  wrongCabin.flights.departure[0].segments[0].cabin_class = "business";
  assert.throws(
    () => livePriceForEnuygunOffer(wrongCabin, sourceOfferRef, request),
    (error) => error instanceof EnuygunMcpClientError && error.code === "format_changed",
  );
});

function initializeResponse(sessionId: string) {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} } },
  }), {
    status: 200,
    headers: { "content-type": "application/json", "mcp-session-id": sessionId },
  });
}

function searchToolResponse() {
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: { structuredContent: { success: true, data: searchData() } },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("search retries one expired MCP session and tolerantly deletes both sessions", async () => {
  const originalFetch = globalThis.fetch;
  let initializeCalls = 0;
  let toolCalls = 0;
  let deleteCalls = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") {
      deleteCalls += 1;
      throw new Error("DELETE unsupported");
    }
    const body = JSON.parse(String(init?.body || "{}")) as { method?: string };
    if (body.method === "initialize") {
      initializeCalls += 1;
      return initializeResponse(`session-${initializeCalls}`);
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") {
      toolCalls += 1;
      return toolCalls === 1
        ? new Response("expired", { status: 404 })
        : searchToolResponse();
    }
    throw new Error(`Unexpected method: ${String(body.method)}`);
  }) as typeof fetch;
  try {
    const result = await searchEnuygunMcp(request);
    assert.equal(result.flights.departure.length, 1);
    assert.equal(initializeCalls, 2);
    assert.equal(toolCalls, 2);
    assert.equal(deleteCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("allocate never retries an expired stateful session and still closes it", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(String(init?.method || "GET"));
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response("expired", { status: 404 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => allocateEnuygunMcpInSession(sourceOfferRef, {
        sessionId: "expired-session",
        protocolVersion: MCP_PROTOCOL_VERSION,
      }),
      (error) => error instanceof EnuygunMcpClientError && error.httpStatus === 404,
    );
    assert.deepEqual(methods, ["POST", "DELETE"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
