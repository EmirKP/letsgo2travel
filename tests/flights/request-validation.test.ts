import assert from "node:assert/strict";
import test from "node:test";
import { validateFlightSearchRequest } from "../../lib/flights/core/request-validation";
import { FIXED_NOW } from "./fixtures";

test("strict request validation normalizes safe values and explicit defaults", () => {
  const result = validateFlightSearchRequest({
    tripType: "round_trip",
    origin: "saw",
    destination: "ayt",
    departureDate: "2026-10-10",
    returnDate: "2026-10-17",
    passengers: { adults: 2, children: 1, infants: 1 },
    cabinClass: "economy",
    baggage: {
      cabinBagsPerPassenger: 1,
      checkedBagsPerPassenger: 1,
      checkedBagWeightKg: 20,
    },
    currency: "try",
  }, { now: FIXED_NOW });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.origin, "SAW");
  assert.equal(result.value.destination, "AYT");
  assert.equal(result.value.currency, "TRY");
  assert.equal(result.value.directOnly, false);
  assert.deepEqual(result.value.eligiblePriceConditions, []);
});

test("strict request validation rejects unknown fields, silent fallbacks and invalid dates", () => {
  const result = validateFlightSearchRequest({
    tripType: "round_trip",
    origin: "TR",
    destination: "TR",
    departureDate: "2026-02-31",
    returnDate: "2026-01-01",
    passengers: { adults: 1, children: 0, infants: 2, secret: true },
    cabinClass: "coach",
    currency: "TL",
    unexpected: "field",
  }, { now: FIXED_NOW });

  assert.equal(result.ok, false);
  if (result.ok) return;
  const paths = result.issues.map((item) => item.path);
  assert(paths.includes("unexpected"));
  assert(paths.includes("passengers.secret"));
  assert(paths.includes("origin"));
  assert(paths.includes("departureDate"));
  assert(paths.includes("passengers.infants"));
  assert(paths.includes("cabinClass"));
  assert(paths.includes("currency"));
});

test("strict request validation rejects conflicting source preferences and invalid booleans", () => {
  const result = validateFlightSearchRequest({
    tripType: "one_way",
    origin: "SAW",
    destination: "AYT",
    departureDate: "2026-10-10",
    passengers: { adults: 1 },
    cabinClass: "economy",
    preferredSources: ["enuygun"],
    excludedSources: ["enuygun"],
    directOnly: "yes",
  }, { now: FIXED_NOW });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert(result.issues.some((item) => item.path === "preferredSources" && item.code === "conflict"));
  assert(result.issues.some((item) => item.path === "directOnly" && item.code === "invalid_type"));
});

test("strict request validation rejects empty and out-of-window return dates", () => {
  const empty = validateFlightSearchRequest({
    tripType: "one_way",
    origin: "SAW",
    destination: "AYT",
    departureDate: "2026-08-20",
    returnDate: "",
    passengers: { adults: 1 },
    cabinClass: "economy",
  }, { now: FIXED_NOW });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert(empty.issues.some((item) => item.path === "returnDate" && item.code === "invalid_format"));
  }

  const tooLate = validateFlightSearchRequest({
    tripType: "round_trip",
    origin: "SAW",
    destination: "AYT",
    departureDate: "2026-08-20",
    returnDate: "2026-10-01",
    passengers: { adults: 1 },
    cabinClass: "economy",
  }, { now: FIXED_NOW, maxDaysAhead: 30 });
  assert.equal(tooLate.ok, false);
  if (!tooLate.ok) {
    assert(tooLate.issues.some((item) => item.path === "returnDate" && item.code === "out_of_range"));
  }
});

test("conditional-price eligibility can only enter through verified server context", () => {
  const input = {
    tripType: "one_way",
    origin: "SAW",
    destination: "AYT",
    departureDate: "2026-10-10",
    passengers: { adults: 1 },
    cabinClass: "economy",
  };
  const selfAsserted = validateFlightSearchRequest({
    ...input,
    eligiblePriceConditions: ["fixture.member"],
  }, { now: FIXED_NOW });
  assert.equal(selfAsserted.ok, false);
  if (!selfAsserted.ok) {
    assert(selfAsserted.issues.some(
      (item) => item.path === "eligiblePriceConditions" && item.code === "unsupported_field",
    ));
  }

  const verified = validateFlightSearchRequest(input, {
    now: FIXED_NOW,
    verifiedPriceConditions: ["FIXTURE.MEMBER"],
  });
  assert.equal(verified.ok, true);
  if (verified.ok) assert.deepEqual(verified.value.eligiblePriceConditions, ["fixture.member"]);
});
