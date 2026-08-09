import assert from "node:assert/strict";
import test from "node:test";
import { groupOffersByItinerary } from "../../lib/flights/core/itinerary-matcher";
import { normalizeSourceOffer } from "../../lib/flights/core/offer-normalizer";
import { rankFlightItineraries } from "../../lib/flights/core/offer-ranking";
import { offer, searchRequest, segment, sourceDescriptor } from "./fixtures";

test("the same operated flight from different sellers is grouped under one itinerary", () => {
  const request = searchRequest();
  const first = normalizeSourceOffer(
    offer({ sourceOfferId: "seller-a", farePackage: "Light", price: { ...offer().price, total: 4_850 } }),
    sourceDescriptor({ id: "seller-a", name: "Seller A" }),
    request,
  );
  const second = normalizeSourceOffer(
    offer({ sourceOfferId: "seller-b", farePackage: "Flex", price: { ...offer().price, total: 4_920 } }),
    sourceDescriptor({ id: "seller-b", name: "Seller B" }),
    request,
  );
  assert(first.ok && second.ok);
  if (!first.ok || !second.ok) return;
  const grouped = groupOffersByItinerary([first.offer, second.offer]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].offers.length, 2);
  assert.deepEqual(grouped[0].offers.map((item) => item.farePackage), ["Light", "Flex"]);
});

test("operating carrier, flight number and UTC schedule participate in matching", () => {
  const request = searchRequest();
  const variants = [
    offer({ sourceOfferId: "base" }),
    offer({ sourceOfferId: "flight", segments: [segment({ flightNumber: "PC2005" })] }),
    offer({ sourceOfferId: "operator", segments: [segment({ operatingCarrierCode: "VF" })] }),
    offer({
      sourceOfferId: "time",
      segments: [segment({
        departureLocal: "2026-10-10T08:40:00+03:00",
        departureUtc: "2026-10-10T05:40:00.000Z",
        arrivalLocal: "2026-10-10T09:55:00+03:00",
        arrivalUtc: "2026-10-10T06:55:00.000Z",
      })],
    }),
  ];
  const normalized = variants.map((item, index) => normalizeSourceOffer(
    item,
    sourceDescriptor({ id: `seller-${index}`, name: `Seller ${index}` }),
    request,
  ));
  assert(normalized.every((item) => item.ok));
  const grouped = groupOffersByItinerary(normalized.flatMap((item) => item.ok ? [item.offer] : []));
  assert.equal(grouped.length, 4);
});

test("ranking marks cheapest, fastest and a transparent best-value result without sponsor bias", () => {
  const request = searchRequest();
  const cheapest = normalizeSourceOffer(offer({
    sourceOfferId: "cheap-sponsored",
    sponsored: true,
    price: { ...offer().price, total: 4_850 },
  }), sourceDescriptor({ id: "cheap-ota", name: "Cheap OTA" }), request);
  const flexible = normalizeSourceOffer(offer({
    sourceOfferId: "airline-flex",
    segments: [segment({
      marketingCarrierCode: "VF",
      operatingCarrierCode: "VF",
      flightNumber: "3028",
      departureLocal: "2026-10-10T09:00:00+03:00",
      departureUtc: "2026-10-10T06:00:00.000Z",
      arrivalLocal: "2026-10-10T10:05:00+03:00",
      arrivalUtc: "2026-10-10T07:05:00.000Z",
    })],
    price: { ...offer().price, total: 5_030 },
    refundable: true,
    changeable: true,
    directAirlineSale: true,
  }), sourceDescriptor({
    id: "direct-airline",
    name: "Direct Airline",
    sourceType: "airline",
  }), request);
  assert(cheapest.ok && flexible.ok);
  if (!cheapest.ok || !flexible.ok) return;
  const ranked = rankFlightItineraries(
    groupOffersByItinerary([cheapest.offer, flexible.offer]),
    request,
  );
  const cheapestItinerary = ranked.find((item) => item.labels.includes("cheapest"));
  const fastestItinerary = ranked.find((item) => item.labels.includes("fastest"));
  const bestValueItinerary = ranked.find((item) => item.labels.includes("best_value"));
  assert(!cheapestItinerary?.offers.some((item) => item.sourceId === "cheap-ota"));
  assert(fastestItinerary?.offers.some((item) => item.sourceId === "direct-airline"));
  assert(bestValueItinerary?.offers.some((item) => item.sourceId === "direct-airline"));
  const best = bestValueItinerary?.offerRankings[0];
  assert(best && best.factors.reduce((sum, item) => sum + item.weight, 0) === 1);
  assert(best?.reasons.some((reason) => reason.includes("Doğrudan havayolu")));
});

test("nearby airport results are accepted only when the user enables them", () => {
  const nearbyOffer = offer({
    sourceOfferId: "istanbul-nearby",
    segments: [segment({
      origin: { code: "SAW", terminal: null },
      destination: { code: "AYT", terminal: "1" },
    })],
  });
  const exactOnly = normalizeSourceOffer(
    nearbyOffer,
    sourceDescriptor(),
    searchRequest({ origin: "IST", includeNearbyAirports: false }),
  );
  const nearbyEnabled = normalizeSourceOffer(
    nearbyOffer,
    sourceDescriptor(),
    searchRequest({ origin: "IST", includeNearbyAirports: true }),
  );
  assert.equal(exactOnly.ok, false);
  assert.equal(nearbyEnabled.ok, true);
});
