export type DisplayPriceCandidate = {
  rankingEligible: boolean;
  effectiveTotalPrice: number | null;
  totalPrice: number | null;
  currency: string;
  conditional: boolean;
  sponsored: boolean;
  eligibilityReasons: string[];
  verifiedAt: string | null;
  expiresAt: string | null;
};

export type HeadlinePriceSelection<T extends DisplayPriceCandidate> = {
  offer: T | null;
  amount: number | null;
  kind: "comparable" | "source_total" | "unavailable";
};

function positiveMoney(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isDisplayPriceStale(offer: DisplayPriceCandidate, now = Date.now()) {
  const verifiedAt = offer.verifiedAt ? Date.parse(offer.verifiedAt) : Number.NaN;
  const expiresAt = offer.expiresAt ? Date.parse(offer.expiresAt) : Number.NaN;
  return offer.eligibilityReasons.includes("stale_price")
    || !Number.isFinite(verifiedAt)
    || !Number.isFinite(expiresAt)
    || verifiedAt > now + 120_000
    || now - verifiedAt > 10 * 60 * 1000
    || expiresAt <= now;
}

export function selectHeadlinePrice<T extends DisplayPriceCandidate>(
  offers: readonly T[],
  requestedCurrency: string,
  now = Date.now(),
): HeadlinePriceSelection<T> {
  const comparable = offers
    .filter((offer) => offer.rankingEligible
      && offer.currency === requestedCurrency
      && positiveMoney(offer.effectiveTotalPrice)
      && !isDisplayPriceStale(offer, now))
    .sort((left, right) => Number(left.effectiveTotalPrice) - Number(right.effectiveTotalPrice))[0];
  if (comparable) {
    return { offer: comparable, amount: comparable.effectiveTotalPrice, kind: "comparable" };
  }

  const sourceTotal = offers
    .filter((offer) => offer.currency === requestedCurrency
      && positiveMoney(offer.totalPrice)
      && !offer.conditional
      && !offer.sponsored
      && !isDisplayPriceStale(offer, now))
    .sort((left, right) => Number(left.totalPrice) - Number(right.totalPrice))[0];
  if (sourceTotal) {
    return { offer: sourceTotal, amount: sourceTotal.totalPrice, kind: "source_total" };
  }

  return { offer: null, amount: null, kind: "unavailable" };
}

export function compareHeadlinePrices(
  left: HeadlinePriceSelection<DisplayPriceCandidate>,
  right: HeadlinePriceSelection<DisplayPriceCandidate>,
) {
  const priority = (kind: HeadlinePriceSelection<DisplayPriceCandidate>["kind"]) => (
    kind === "comparable" ? 0 : kind === "source_total" ? 1 : 2
  );
  return priority(left.kind) - priority(right.kind)
    || (left.amount ?? Number.POSITIVE_INFINITY) - (right.amount ?? Number.POSITIVE_INFINITY);
}
