import assert from "node:assert/strict";
import test from "node:test";
import { validateCheckoutUrl } from "../../lib/flights/core/checkout-url";
import { normalizeSourceOffer } from "../../lib/flights/core/offer-normalizer";
import { calculateOfferPrice } from "../../lib/flights/core/price-calculator";
import { offer, searchRequest, sourceDescriptor } from "./fixtures";

test("checkout URLs require HTTPS and an exact allowlisted host boundary", () => {
  const rules = [{ hostname: "fixture.test", allowSubdomains: true }];
  assert.equal(validateCheckoutUrl("https://checkout.fixture.test/book/1#secret", rules).ok, true);
  assert.equal(validateCheckoutUrl("http://fixture.test/book/1", rules).ok, false);
  assert.equal(validateCheckoutUrl("https://fixture.test.evil.example/book/1", rules).ok, false);
  assert.equal(validateCheckoutUrl("https://user:pass@fixture.test/book/1", rules).ok, false);
  assert.equal(validateCheckoutUrl("https://fixture.test:8443/book/1", rules).ok, false);
  const safe = validateCheckoutUrl("https://checkout.fixture.test/book/1#secret", rules);
  assert(safe.ok && !safe.url.includes("#"));
});

test("normalizer sanitizes source text and rejects untrusted checkout domains", () => {
  const normalized = normalizeSourceOffer(offer({
    farePackage: "<b>Eco</b>\u0000 paket",
    benefits: ["<script>bad()</script> 20 kg bagaj"],
  }), sourceDescriptor(), searchRequest());
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(normalized.offer.farePackage, "Eco paket");
    assert(!normalized.offer.benefits[0].includes("<"));
  }

  const malicious = normalizeSourceOffer(
    offer({ checkoutUrl: "https://fixture.test.evil.example/book" }),
    sourceDescriptor(),
    searchRequest(),
  );
  assert.equal(malicious.ok, false);
  if (!malicious.ok) assert(malicious.issues.some((item) => item.path === "checkoutUrl"));
});

test("normalizer rejects wrong routes and passenger totals", () => {
  const result = normalizeSourceOffer(offer({
    passengerCount: 2,
    segments: [offer().segments[0], {
      ...offer().segments[0],
      origin: { code: "IST", terminal: null },
    }],
  }), sourceDescriptor(), searchRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert(result.issues.some((item) => item.path === "passengerCount"));
    assert(result.issues.some((item) => item.path.includes("segments.leg")));
  }
});

test("normalizer rejects inconsistent local times and non-boolean source claims", () => {
  const result = normalizeSourceOffer(offer({
    segments: [{
      ...offer().segments[0],
      departureLocal: "2026-10-10T09:30:00+03:00",
    }],
    refundable: "yes" as unknown as boolean,
  }), sourceDescriptor(), searchRequest());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert(result.issues.some((item) => item.path === "segments.0.departureLocal"));
    assert(result.issues.some((item) => item.path === "refundable"));
  }
});

test("conditional prices are excluded unless eligibility is explicit", () => {
  const standardRequest = searchRequest();
  const normalized = normalizeSourceOffer(offer(), sourceDescriptor(), standardRequest);
  assert(normalized.ok);
  if (!normalized.ok) return;
  const standard = calculateOfferPrice(normalized.offer, standardRequest);
  assert.equal(standard.total, 4_850);
  assert.equal(standard.usedConditionalPriceId, null);

  const eligible = calculateOfferPrice(
    normalized.offer,
    searchRequest({ eligiblePriceConditions: ["fixture.member"] }),
  );
  assert.equal(eligible.total, 4_600);
  assert.equal(eligible.usedConditionalPriceId, "member-price");
});

test("party totals stay distinct from per-passenger prices", () => {
  const request = searchRequest({
    passengers: { adults: 2, children: 0, infants: 0 },
  });
  const normalized = normalizeSourceOffer(offer({
    passengerCount: 2,
    price: {
      total: 9_700,
      currency: "TRY",
      includesMandatoryFees: true,
      baseFareTotal: 8_000,
      taxesTotal: 1_400,
      mandatoryFeesTotal: 300,
      conditionalPrices: [],
    },
  }), sourceDescriptor(), request);
  assert(normalized.ok);
  if (!normalized.ok) return;
  const price = calculateOfferPrice(normalized.offer, request);
  assert.equal(price.total, 9_700);
  assert.equal(price.perPassenger, 4_850);
});

test("a different source currency is retained but cannot enter comparable-price rankings", () => {
  const request = searchRequest();
  const normalized = normalizeSourceOffer(offer({
    price: { ...offer().price, currency: "EUR", conditionalPrices: [] },
  }), sourceDescriptor(), request);
  assert(normalized.ok);
  if (!normalized.ok) return;
  const price = calculateOfferPrice(normalized.offer, request);
  assert.equal(price.eligible, false);
  assert.equal(price.total, null);
  assert(price.reasons.includes("currency_mismatch"));
});

test("requested baggage is added only with a known fee; unknown baggage is ineligible", () => {
  const request = searchRequest();
  const withKnownFee = normalizeSourceOffer(offer({
    baggage: {
      cabinBagsPerPassenger: 1,
      checkedBagsPerPassenger: 0,
      checkedBagWeightKg: null,
      additionalCheckedBagFeeTotal: 300,
    },
  }), sourceDescriptor(), request);
  assert(withKnownFee.ok);
  if (withKnownFee.ok) {
    const price = calculateOfferPrice(withKnownFee.offer, request);
    assert.equal(price.eligible, true);
    assert.equal(price.total, 5_150);
    assert.equal(price.addedCheckedBaggageFee, 300);
  }

  const unknownFee = normalizeSourceOffer(offer({
    baggage: {
      cabinBagsPerPassenger: 1,
      checkedBagsPerPassenger: 0,
      checkedBagWeightKg: null,
    },
  }), sourceDescriptor(), request);
  assert(unknownFee.ok);
  if (unknownFee.ok) {
    const price = calculateOfferPrice(unknownFee.offer, request);
    assert.equal(price.eligible, false);
    assert.equal(price.total, null);
    assert(price.reasons.includes("checked_baggage_price_unknown"));
  }
});

test("offers without confirmed mandatory fees cannot rank as the cheapest", () => {
  const request = searchRequest();
  const normalized = normalizeSourceOffer(offer({
    price: {
      total: 4_000,
      currency: "TRY",
      includesMandatoryFees: false,
      baseFareTotal: null,
      taxesTotal: null,
      mandatoryFeesTotal: null,
      conditionalPrices: [],
    },
  }), sourceDescriptor(), request);
  assert(normalized.ok);
  if (!normalized.ok) return;
  const price = calculateOfferPrice(normalized.offer, request);
  assert.equal(price.eligible, false);
  assert(price.reasons.includes("mandatory_fees_unknown"));
});
