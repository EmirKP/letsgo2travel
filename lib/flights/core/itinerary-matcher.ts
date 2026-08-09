import type {
  FlightItinerary,
  FlightLegSummary,
  NormalizedFlightOffer,
  NormalizedFlightSegment,
} from "./types";
import { stableId } from "./sanitize";

function utcMinute(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  parsed.setUTCSeconds(0, 0);
  return parsed.toISOString();
}

export function itineraryFingerprint(segments: readonly NormalizedFlightSegment[]) {
  return segments
    .map((segment) => [
      segment.legIndex,
      segment.marketingCarrierCode,
      segment.flightNumber,
      segment.operatingCarrierCode,
      segment.origin.code,
      segment.destination.code,
      utcMinute(segment.departureUtc),
      utcMinute(segment.arrivalUtc),
      segment.cabinClass,
    ].join("~"))
    .join("|");
}

function summarizeLeg(legIndex: number, segments: NormalizedFlightSegment[]): FlightLegSummary {
  const ordered = [...segments].sort(
    (left, right) => Date.parse(left.departureUtc) - Date.parse(right.departureUtc),
  );
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const durationMinutes = Math.max(
    0,
    Math.round((Date.parse(last.arrivalUtc) - Date.parse(first.departureUtc)) / 60_000),
  );
  return {
    legIndex,
    origin: first.origin.code,
    destination: last.destination.code,
    departureUtc: first.departureUtc,
    arrivalUtc: last.arrivalUtc,
    durationMinutes,
    stops: Math.max(0, ordered.length - 1),
    stopAirports: ordered.slice(0, -1).map((segment) => segment.destination.code),
  };
}

function buildItinerary(key: string, offers: NormalizedFlightOffer[]): FlightItinerary {
  const segments = offers[0].segments;
  const legIndexes = [...new Set(segments.map((segment) => segment.legIndex))].sort((a, b) => a - b);
  const legs = legIndexes.map((legIndex) => summarizeLeg(
    legIndex,
    segments.filter((segment) => segment.legIndex === legIndex),
  ));
  return {
    id: stableId("itin", key),
    itineraryKey: key,
    segments,
    legs,
    totalDurationMinutes: legs.reduce((total, leg) => total + leg.durationMinutes, 0),
    totalStops: legs.reduce((total, leg) => total + leg.stops, 0),
    hasSelfTransfer: offers.some((offer) => offer.segments.some((segment) => segment.selfTransfer)),
    offers: [...offers].sort((left, right) => left.price.total - right.price.total),
  };
}

export function groupOffersByItinerary(
  offers: readonly NormalizedFlightOffer[],
): FlightItinerary[] {
  const groups = new Map<string, NormalizedFlightOffer[]>();
  const seenOffers = new Set<string>();

  for (const offer of offers) {
    const offerIdentity = JSON.stringify([
      offer.sourceId,
      offer.sourceOfferId,
      offer.farePackage,
      offer.itineraryKey,
    ]);
    if (seenOffers.has(offerIdentity)) continue;
    seenOffers.add(offerIdentity);
    const current = groups.get(offer.itineraryKey) || [];
    current.push(offer);
    groups.set(offer.itineraryKey, current);
  }

  return [...groups.entries()]
    .map(([key, groupedOffers]) => buildItinerary(key, groupedOffers))
    .sort((left, right) => {
      const leftDeparture = Date.parse(left.legs[0]?.departureUtc || "");
      const rightDeparture = Date.parse(right.legs[0]?.departureUtc || "");
      return leftDeparture - rightDeparture || left.itineraryKey.localeCompare(right.itineraryKey);
    });
}
