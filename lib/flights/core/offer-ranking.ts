import { calculateOfferPrice } from "./price-calculator";
import { roundMoney } from "./sanitize";
import type {
  BestValueFactor,
  FlightItinerary,
  FlightSearchRequest,
  NormalizedFlightOffer,
  OfferRanking,
  RankedFlightItinerary,
} from "./types";

const WEIGHTS = {
  price: 0.48,
  duration: 0.2,
  stops: 0.12,
  baggage: 0.1,
  flexibility: 0.06,
  direct_seller: 0.04,
} as const;

function clampScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function factor(
  key: BestValueFactor["key"],
  label: string,
  score: number,
): BestValueFactor {
  const normalizedScore = clampScore(score);
  const weight = WEIGHTS[key];
  return {
    key,
    label,
    weight,
    score: roundMoney(normalizedScore),
    contribution: roundMoney(normalizedScore * weight * 100),
  };
}

function flexibilityScore(offer: NormalizedFlightOffer) {
  const value = (flag: boolean | null) => flag === true ? 1 : flag === false ? 0 : 0.35;
  return (value(offer.refundable) + value(offer.changeable)) / 2;
}

function baggageScore(offer: NormalizedFlightOffer, request: FlightSearchRequest) {
  const requested = request.baggage.cabinBagsPerPassenger > 0
    || request.baggage.checkedBagsPerPassenger > 0;
  if (!requested) return 0.5;
  const cabinIncluded = offer.baggage.cabinBagsPerPassenger
    >= request.baggage.cabinBagsPerPassenger;
  const checkedIncluded = offer.baggage.checkedBagsPerPassenger
    >= request.baggage.checkedBagsPerPassenger;
  const weightIncluded = request.baggage.checkedBagWeightKg === null
    || (offer.baggage.checkedBagWeightKg !== null
      && offer.baggage.checkedBagWeightKg >= request.baggage.checkedBagWeightKg);
  return cabinIncluded && checkedIncluded && weightIncluded ? 1 : 0.55;
}

function rankingReasons(
  offer: NormalizedFlightOffer,
  ranking: Omit<OfferRanking, "reasons">,
  globalMinimumPrice: number,
  request: FlightSearchRequest,
) {
  const reasons: string[] = [];
  const total = ranking.calculatedPrice.total;
  if (total !== null) {
    const difference = roundMoney(total - globalMinimumPrice);
    if (difference <= 0) reasons.push("Bilinen zorunlu ücretlerle en düşük toplam fiyat.");
    else reasons.push(`En düşük uygun fiyattan ${difference.toLocaleString("tr-TR")} ${request.currency} daha yüksek.`);
  }
  if (request.baggage.checkedBagsPerPassenger > 0) {
    if (ranking.calculatedPrice.addedCheckedBaggageFee === 0) {
      reasons.push("İstenen kayıtlı bagaj fiyata dahil.");
    } else {
      reasons.push("İstenen kayıtlı bagajın doğrulanmış ek ücreti toplama dahil.");
    }
  }
  if (offer.refundable === true) reasons.push("İade hakkı kaynak verisinde doğrulandı.");
  if (offer.changeable === true) reasons.push("Değişiklik hakkı kaynak verisinde doğrulandı.");
  if (offer.directAirlineSale) reasons.push("Doğrudan havayolu satış kanalı.");
  return reasons.slice(0, 5);
}

export function rankFlightItineraries(
  itineraries: readonly FlightItinerary[],
  request: FlightSearchRequest,
): RankedFlightItinerary[] {
  const calculated = itineraries.flatMap((itinerary) => itinerary.offers.map((offer) => ({
    itinerary,
    offer,
    calculatedPrice: calculateOfferPrice(offer, request),
  })));
  const eligible = calculated.filter(
    (item): item is typeof item & { calculatedPrice: typeof item.calculatedPrice & { total: number } } =>
      !item.offer.sponsored
      && item.calculatedPrice.eligible
      && item.calculatedPrice.total !== null,
  );
  const minimumPrice = eligible.length
    ? Math.min(...eligible.map((item) => item.calculatedPrice.total))
    : 0;
  const minimumDuration = eligible.length
    ? Math.min(...eligible.map((item) => item.itinerary.totalDurationMinutes))
    : 0;

  const rankingsByItinerary = new Map<string, OfferRanking[]>();
  for (const item of calculated) {
    if (item.offer.sponsored || !item.calculatedPrice.eligible || item.calculatedPrice.total === null) continue;
    const factors = [
      factor("price", "Toplam fiyat", minimumPrice / item.calculatedPrice.total),
      factor("duration", "Toplam seyahat süresi", minimumDuration / item.itinerary.totalDurationMinutes),
      factor("stops", "Aktarma sayısı", 1 / (1 + item.itinerary.totalStops)),
      factor("baggage", "Bagaj uygunluğu", baggageScore(item.offer, request)),
      factor("flexibility", "İade ve değişiklik", flexibilityScore(item.offer)),
      factor("direct_seller", "Doğrudan havayolu", item.offer.directAirlineSale ? 1 : 0),
    ];
    const withoutReasons = {
      offerId: item.offer.id,
      calculatedPrice: item.calculatedPrice,
      bestValueScore: roundMoney(factors.reduce((total, current) => total + current.contribution, 0)),
      factors,
    };
    const ranking: OfferRanking = {
      ...withoutReasons,
      reasons: rankingReasons(item.offer, withoutReasons, minimumPrice, request),
    };
    const current = rankingsByItinerary.get(item.itinerary.id) || [];
    current.push(ranking);
    rankingsByItinerary.set(item.itinerary.id, current);
  }

  let cheapestItineraryId: string | null = null;
  let fastestItineraryId: string | null = null;
  let bestValueItineraryId: string | null = null;
  let cheapestValue = Number.POSITIVE_INFINITY;
  let fastestValue = Number.POSITIVE_INFINITY;
  let bestValue = Number.NEGATIVE_INFINITY;

  const ranked = itineraries.map<RankedFlightItinerary>((itinerary) => {
    const offerRankings = (rankingsByItinerary.get(itinerary.id) || []).sort((left, right) =>
      right.bestValueScore - left.bestValueScore
      || (left.calculatedPrice.total || Number.POSITIVE_INFINITY)
        - (right.calculatedPrice.total || Number.POSITIVE_INFINITY)
      || left.offerId.localeCompare(right.offerId));
    const cheapest = [...offerRankings].sort((left, right) =>
      (left.calculatedPrice.total || Number.POSITIVE_INFINITY)
        - (right.calculatedPrice.total || Number.POSITIVE_INFINITY)
      || left.offerId.localeCompare(right.offerId))[0] || null;
    const best = offerRankings[0] || null;
    const cheapestTotal = cheapest?.calculatedPrice.total;
    if (cheapestTotal !== null && cheapestTotal !== undefined && cheapestTotal < cheapestValue) {
      cheapestValue = cheapestTotal;
      cheapestItineraryId = itinerary.id;
    }
    if (offerRankings.length && itinerary.totalDurationMinutes < fastestValue) {
      fastestValue = itinerary.totalDurationMinutes;
      fastestItineraryId = itinerary.id;
    }
    if (best && best.bestValueScore > bestValue) {
      bestValue = best.bestValueScore;
      bestValueItineraryId = itinerary.id;
    }
    return {
      ...itinerary,
      labels: [],
      cheapestOfferId: cheapest?.offerId || null,
      bestValueOfferId: best?.offerId || null,
      offerRankings,
    };
  });

  for (const itinerary of ranked) {
    if (itinerary.id === cheapestItineraryId) itinerary.labels.push("cheapest");
    if (itinerary.id === fastestItineraryId) itinerary.labels.push("fastest");
    if (itinerary.id === bestValueItineraryId) itinerary.labels.push("best_value");
  }

  return ranked.sort((left, right) => {
    const leftBest = left.offerRankings[0]?.bestValueScore ?? -1;
    const rightBest = right.offerRankings[0]?.bestValueScore ?? -1;
    const leftPrice = left.offerRankings.find((ranking) => ranking.offerId === left.cheapestOfferId)
      ?.calculatedPrice.total ?? Number.POSITIVE_INFINITY;
    const rightPrice = right.offerRankings.find((ranking) => ranking.offerId === right.cheapestOfferId)
      ?.calculatedPrice.total ?? Number.POSITIVE_INFINITY;
    return rightBest - leftBest
      || leftPrice - rightPrice
      || left.totalDurationMinutes - right.totalDurationMinutes
      || left.id.localeCompare(right.id);
  });
}
