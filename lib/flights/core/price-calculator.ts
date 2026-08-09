import { roundMoney } from "./sanitize";
import type {
  CalculatedOfferPrice,
  FlightSearchRequest,
  NormalizedFlightOffer,
  OfferPriceEligibilityReason,
} from "./types";

function passengerCount(request: FlightSearchRequest) {
  return request.passengers.adults + request.passengers.children + request.passengers.infants;
}

export function calculateOfferPrice(
  offer: NormalizedFlightOffer,
  request: FlightSearchRequest,
): CalculatedOfferPrice {
  const reasons: OfferPriceEligibilityReason[] = [];
  if (offer.price.currency !== request.currency) reasons.push("currency_mismatch");
  if (!offer.price.includesMandatoryFees) reasons.push("mandatory_fees_unknown");

  const eligibleConditions = new Set(request.eligiblePriceConditions);
  const eligibleConditionalPrices = offer.price.conditionalPrices
    .filter((price) => eligibleConditions.has(price.eligibilityKey))
    .filter((price) => price.currency === request.currency)
    .sort((left, right) => left.total - right.total);
  const selectedConditional = eligibleConditionalPrices[0] || null;
  let total = selectedConditional
    ? selectedConditional.total
    : offer.price.total;

  let addedCabinBaggageFee = 0;
  if (offer.baggage.cabinBagsPerPassenger < request.baggage.cabinBagsPerPassenger) {
    if (offer.baggage.additionalCabinBagFeeTotal === null
      || offer.baggage.additionalCabinBagFeeTotal === undefined) {
      reasons.push("cabin_baggage_price_unknown");
    } else {
      addedCabinBaggageFee = offer.baggage.additionalCabinBagFeeTotal;
      total += addedCabinBaggageFee;
    }
  }

  const checkedBagCountMissing = offer.baggage.checkedBagsPerPassenger
    < request.baggage.checkedBagsPerPassenger;
  const requestedWeight = request.baggage.checkedBagWeightKg;
  const knownWeight = offer.baggage.checkedBagWeightKg;
  const checkedBagWeightMissing = request.baggage.checkedBagsPerPassenger > 0
    && requestedWeight !== null
    && knownWeight === null;
  const checkedBagWeightInsufficient = request.baggage.checkedBagsPerPassenger > 0
    && requestedWeight !== null
    && knownWeight !== null
    && knownWeight < requestedWeight;

  let addedCheckedBaggageFee = 0;
  if (checkedBagCountMissing || checkedBagWeightMissing || checkedBagWeightInsufficient) {
    if (offer.baggage.additionalCheckedBagFeeTotal === null
      || offer.baggage.additionalCheckedBagFeeTotal === undefined) {
      if (checkedBagCountMissing) reasons.push("checked_baggage_price_unknown");
      else if (checkedBagWeightMissing) reasons.push("checked_baggage_weight_unknown");
      else reasons.push("checked_baggage_weight_insufficient");
    } else {
      addedCheckedBaggageFee = offer.baggage.additionalCheckedBagFeeTotal;
      total += addedCheckedBaggageFee;
    }
  }

  const eligible = reasons.length === 0;
  const normalizedTotal = eligible ? roundMoney(total) : null;
  const count = passengerCount(request);
  return {
    eligible,
    total: normalizedTotal,
    perPassenger: normalizedTotal === null ? null : roundMoney(normalizedTotal / count),
    currency: request.currency,
    usedConditionalPriceId: selectedConditional?.id || null,
    addedCabinBaggageFee: roundMoney(addedCabinBaggageFee),
    addedCheckedBaggageFee: roundMoney(addedCheckedBaggageFee),
    reasons,
  };
}

