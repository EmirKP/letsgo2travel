import type {
  FlightSearchRequest,
  FlightSourceDescriptor,
  SourceFlightOffer,
  SourceFlightSegment,
} from "../../lib/flights/core/types";

export const FIXED_NOW = new Date("2026-08-09T10:00:00.000Z");

export function searchRequest(
  overrides: Partial<FlightSearchRequest> = {},
): FlightSearchRequest {
  return {
    tripType: "one_way",
    origin: "SAW",
    destination: "AYT",
    departureDate: "2026-10-10",
    returnDate: null,
    passengers: { adults: 1, children: 0, infants: 0 },
    cabinClass: "economy",
    baggage: {
      cabinBagsPerPassenger: 1,
      checkedBagsPerPassenger: 1,
      checkedBagWeightKg: 20,
    },
    currency: "TRY",
    directOnly: false,
    includeNearbyAirports: false,
    flexibleDates: 0,
    preferredAirlines: [],
    excludedAirlines: [],
    preferredSources: [],
    excludedSources: [],
    eligiblePriceConditions: [],
    ...overrides,
  };
}

export function segment(
  overrides: Partial<SourceFlightSegment> = {},
): SourceFlightSegment {
  return {
    legIndex: 0,
    marketingCarrierCode: "PC",
    marketingCarrierName: "Pegasus",
    operatingCarrierCode: "PC",
    operatingCarrierName: "Pegasus",
    flightNumber: "PC2004",
    origin: { code: "SAW", terminal: null },
    destination: { code: "AYT", terminal: "1" },
    departureLocal: "2026-10-10T08:30:00+03:00",
    departureUtc: "2026-10-10T05:30:00.000Z",
    arrivalLocal: "2026-10-10T09:45:00+03:00",
    arrivalUtc: "2026-10-10T06:45:00.000Z",
    durationMinutes: 75,
    cabinClass: "economy",
    aircraft: "Airbus A320",
    selfTransfer: false,
    ...overrides,
  };
}

export function sourceDescriptor(
  overrides: Partial<FlightSourceDescriptor> = {},
): FlightSourceDescriptor {
  return {
    id: "fixture-source",
    name: "Fixture Source",
    sourceType: "ota",
    officialUrl: "https://fixture.test/",
    integrationState: "active",
    enabled: true,
    checkoutHosts: [{ hostname: "fixture.test", allowSubdomains: true }],
    ...overrides,
  };
}

export function offer(
  overrides: Partial<SourceFlightOffer> = {},
): SourceFlightOffer {
  return {
    sourceOfferId: "fixture-offer-1",
    segments: [segment()],
    passengerCount: 1,
    farePackage: "Eco",
    price: {
      total: 4_850,
      currency: "TRY",
      includesMandatoryFees: true,
      baseFareTotal: 4_000,
      taxesTotal: 700,
      mandatoryFeesTotal: 150,
      conditionalPrices: [{
        id: "member-price",
        total: 4_600,
        currency: "TRY",
        conditionType: "membership",
        label: "Üyelere özel",
        eligibilityKey: "fixture.member",
      }],
    },
    baggage: {
      cabinBagsPerPassenger: 1,
      checkedBagsPerPassenger: 1,
      checkedBagWeightKg: 20,
      additionalCabinBagFeeTotal: null,
      additionalCheckedBagFeeTotal: null,
    },
    refundable: false,
    changeable: false,
    installmentOptions: ["3 taksit"],
    benefits: ["20 kg bagaj dahil"],
    directAirlineSale: false,
    checkoutUrl: "https://checkout.fixture.test/book/fixture-offer-1",
    observedAt: "2026-08-09T10:00:00.000Z",
    expiresAt: "2026-08-09T10:15:00.000Z",
    sponsored: false,
    ...overrides,
  };
}

