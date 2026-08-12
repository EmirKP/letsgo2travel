import assert from "node:assert/strict";
import test from "node:test";
import {
  compareHeadlinePrices,
  selectHeadlinePrice,
  type DisplayPriceCandidate,
} from "../../lib/flights/core/offer-display";

const NOW = Date.parse("2026-08-12T18:00:00.000Z");

function candidate(overrides: Partial<DisplayPriceCandidate> = {}): DisplayPriceCandidate {
  return {
    rankingEligible: true,
    effectiveTotalPrice: 5_000,
    totalPrice: 5_000,
    currency: "TRY",
    conditional: false,
    sponsored: false,
    eligibilityReasons: [],
    verifiedAt: "2026-08-12T17:58:00.000Z",
    expiresAt: "2026-08-12T18:08:00.000Z",
    ...overrides,
  };
}

test("a verified comparable total takes priority over a lower partial source total", () => {
  const selected = selectHeadlinePrice([
    candidate({
      rankingEligible: false,
      effectiveTotalPrice: null,
      totalPrice: 4_000,
      eligibilityReasons: ["mandatory_fees_unknown"],
    }),
    candidate({ totalPrice: 5_000, effectiveTotalPrice: 5_000 }),
  ], "TRY", NOW);
  assert.equal(selected.kind, "comparable");
  assert.equal(selected.amount, 5_000);
});

test("a fresh real source total remains visible when no comparable total exists", () => {
  const selected = selectHeadlinePrice([candidate({
    rankingEligible: false,
    effectiveTotalPrice: null,
    totalPrice: 4_000,
    eligibilityReasons: ["mandatory_fees_unknown"],
  })], "TRY", NOW);
  assert.equal(selected.kind, "source_total");
  assert.equal(selected.amount, 4_000);
});

test("stale, sponsored, conditional and wrong-currency totals cannot become the headline price", () => {
  const selected = selectHeadlinePrice([
    candidate({ rankingEligible: false, effectiveTotalPrice: null, verifiedAt: "2026-08-12T17:30:00.000Z" }),
    candidate({ rankingEligible: false, effectiveTotalPrice: null, sponsored: true }),
    candidate({ rankingEligible: false, effectiveTotalPrice: null, conditional: true }),
    candidate({ rankingEligible: false, effectiveTotalPrice: null, currency: "EUR" }),
  ], "TRY", NOW);
  assert.equal(selected.kind, "unavailable");
  assert.equal(selected.amount, null);
});

test("cheapest sorting keeps comparable totals ahead of partial totals", () => {
  const comparable = selectHeadlinePrice([candidate({ totalPrice: 5_000, effectiveTotalPrice: 5_000 })], "TRY", NOW);
  const partial = selectHeadlinePrice([candidate({
    rankingEligible: false,
    effectiveTotalPrice: null,
    totalPrice: 4_000,
    eligibilityReasons: ["mandatory_fees_unknown"],
  })], "TRY", NOW);
  assert(compareHeadlinePrices(comparable, partial) < 0);
});
