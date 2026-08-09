import assert from "node:assert/strict";
import test from "node:test";
import { internalFlightSearchUrl } from "../../lib/affiliate";
import { safeFlightCheckoutUrl } from "../../lib/flights/server/source-domains";

test("internal flight links never invent a default destination", () => {
  const url = new URL(internalFlightSearchUrl({}));
  assert.equal(url.pathname, "/ucak-bileti-ara");
  assert.equal(url.searchParams.has("origin"), false);
  assert.equal(url.searchParams.has("destination"), false);
});

test("unknown three-letter country values cannot masquerade as airport codes", () => {
  const url = new URL(internalFlightSearchUrl({ origin: "IST", destination: "ARE" }));
  assert.equal(url.searchParams.get("origin"), "IST");
  assert.equal(url.searchParams.has("destination"), false);
});

test("known airport links preserve route, date and currency", () => {
  const url = new URL(internalFlightSearchUrl({
    origin: "IST",
    destination: "AYT",
    departDate: "2026-08-20",
    currency: "TRY",
  }));
  assert.equal(url.searchParams.get("destination"), "AYT");
  assert.equal(url.searchParams.get("departureDate"), "2026-08-20");
  assert.equal(url.searchParams.get("currency"), "TRY");
});

const oneWayEnuygunCheckout = "https://www.enuygun.com/ucak-bileti/deep-link-handler/"
  + "?origin=ISTA&destination=AYT&adult=1&child=0&infant=0"
  + "&departure=20.08.2026&flight_ids%5B%5D=VF3048%3AP%3A2026-08-20+00%3A15%3A00%3A15X1"
  + "&currency=TRY&affiliate=1234";

const roundTripEnuygunCheckout = "https://www.enuygun.com/ucak-bileti/deep-link-handler/"
  + "?origin=ISTA&destination=AYT&adult=2&child=1&infant=1"
  + "&departure=20.08.2026&return=23.08.2026"
  + "&flight_ids%5B%5D=VF3048%3AP%3A2026-08-20+00%3A15%3A00%3A15X1"
  + "&flight_ids%5B%5D=VF3047%3AP%3A2026-08-23+07%3A50%3A00%3A15X1"
  + "&currency=TRY&affiliate=1234";

test("Enuygun checkout accepts only the observed query contract", () => {
  assert.equal(
    safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout)?.startsWith("https://www.enuygun.com/"),
    true,
  );
  assert.notEqual(safeFlightCheckoutUrl("enuygun", roundTripEnuygunCheckout), null);
});

test("Enuygun checkout rejects alternate hosts, paths, trailing dots and fragments", () => {
  const query = oneWayEnuygunCheckout.slice(oneWayEnuygunCheckout.indexOf("?"));
  assert.equal(safeFlightCheckoutUrl("enuygun", `https://evil.www.enuygun.com/ucak-bileti/deep-link-handler/${query}`), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", `https://www.enuygun.com./ucak-bileti/deep-link-handler/${query}`), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", `https://www.enuygun.com/ucak-bileti/arama/${query}`), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", `${oneWayEnuygunCheckout}#checkout`), null);
});

test("Enuygun checkout rejects unexpected, duplicate and nested URL query values", () => {
  assert.equal(safeFlightCheckoutUrl("enuygun", `${oneWayEnuygunCheckout}&token=x`), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", `${oneWayEnuygunCheckout}&origin=SAW`), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("affiliate=1234", "affiliate=https%3A%2F%2Fevil.example")), null);
});

test("Enuygun checkout enforces one flight per leg and scalar value shapes", () => {
  const secondId = "&flight_ids%5B%5D=VF3047%3AP%3A2026-08-23+07%3A50%3A00%3A15X1";
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("&currency=TRY", `${secondId}&currency=TRY`)), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", roundTripEnuygunCheckout.replace(/&flight_ids%5B%5D=VF3047[^&]+/, "")), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("adult=1", "adult=0")), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("destination=AYT", "destination=AYTA")), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("currency=TRY", "currency=try")), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("affiliate=1234", "affiliate=mcp")), null);
  assert.equal(safeFlightCheckoutUrl("enuygun", oneWayEnuygunCheckout.replace("departure=20.08.2026", "departure=31.02.2026")), null);
  assert.equal(
    safeFlightCheckoutUrl("enuygun", roundTripEnuygunCheckout.replace("VF3047%3AP%3A2026-08-23+07%3A50%3A00%3A15X1", "VF3048%3AP%3A2026-08-20+00%3A15%3A00%3A15X1")),
    null,
  );
});
