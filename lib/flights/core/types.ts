export type FlightTripType = "one_way" | "round_trip";

export type FlightCabinClass =
  | "economy"
  | "premium_economy"
  | "business"
  | "first";

export type FlightSourceType = "ota" | "airline" | "affiliate";

export type FlightSourceIntegrationState =
  | "active"
  | "integration_required"
  | "disabled"
  | "temporarily_unavailable";

export type FlightSourceSearchState =
  | "queued"
  | "searching"
  | "succeeded"
  | "no_results"
  | "integration_required"
  | "disabled"
  | "skipped"
  | "timed_out"
  | "failed";

export type ConnectorErrorCode =
  | "authorization_failed"
  | "quota_exceeded"
  | "temporarily_unavailable"
  | "format_changed"
  | "timeout"
  | "network_error"
  | "invalid_route"
  | "integration_required"
  | "unknown";

export type PassengerSelection = {
  adults: number;
  children: number;
  infants: number;
};

export type BaggageRequest = {
  cabinBagsPerPassenger: number;
  checkedBagsPerPassenger: number;
  checkedBagWeightKg: number | null;
};

export type FlightSearchRequest = {
  tripType: FlightTripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  passengers: PassengerSelection;
  cabinClass: FlightCabinClass;
  baggage: BaggageRequest;
  currency: string;
  directOnly: boolean;
  includeNearbyAirports: boolean;
  flexibleDates: number;
  preferredAirlines: string[];
  excludedAirlines: string[];
  preferredSources: string[];
  excludedSources: string[];
  eligiblePriceConditions: string[];
};

export type FlightSearchValidationIssue = {
  path: string;
  code:
    | "required"
    | "invalid_type"
    | "invalid_format"
    | "invalid_value"
    | "out_of_range"
    | "date_in_past"
    | "date_order"
    | "unsupported_field"
    | "conflict";
  message: string;
};

export type FlightSearchValidationResult =
  | { ok: true; value: FlightSearchRequest }
  | { ok: false; issues: FlightSearchValidationIssue[] };

export type CheckoutHostRule = {
  hostname: string;
  allowSubdomains?: boolean;
};

export type FlightSourceDescriptor = {
  id: string;
  name: string;
  sourceType: FlightSourceType;
  officialUrl: string | null;
  integrationState: FlightSourceIntegrationState;
  enabled: boolean;
  checkoutHosts: CheckoutHostRule[];
};

export type SourceSearchOutcome =
  | "success"
  | "no_results"
  | "integration_required"
  | "temporarily_unavailable";

export type FlightEndpoint = {
  code: string;
  terminal: string | null;
};

export type SourceFlightSegment = {
  legIndex: number;
  marketingCarrierCode: string;
  marketingCarrierName?: string | null;
  operatingCarrierCode: string;
  operatingCarrierName?: string | null;
  flightNumber: string;
  origin: FlightEndpoint;
  destination: FlightEndpoint;
  departureLocal: string;
  departureUtc: string;
  arrivalLocal: string;
  arrivalUtc: string;
  durationMinutes?: number | null;
  cabinClass: FlightCabinClass;
  aircraft?: string | null;
  selfTransfer?: boolean;
};

export type PriceConditionType =
  | "membership"
  | "coupon"
  | "payment_method"
  | "new_user"
  | "mobile_only"
  | "loyalty";

export type ConditionalFlightPrice = {
  id: string;
  total: number;
  currency: string;
  conditionType: PriceConditionType;
  label: string;
  eligibilityKey: string;
};

export type SourceOfferPrice = {
  total: number;
  currency: string;
  includesMandatoryFees: boolean;
  baseFareTotal?: number | null;
  taxesTotal?: number | null;
  mandatoryFeesTotal?: number | null;
  conditionalPrices?: ConditionalFlightPrice[];
};

export type SourceOfferBaggage = {
  cabinBagsPerPassenger: number;
  checkedBagsPerPassenger: number;
  checkedBagWeightKg: number | null;
  additionalCabinBagFeeTotal?: number | null;
  additionalCheckedBagFeeTotal?: number | null;
};

export type SourceFlightOffer = {
  sourceOfferId: string;
  segments: SourceFlightSegment[];
  passengerCount: number;
  farePackage: string;
  price: SourceOfferPrice;
  baggage: SourceOfferBaggage;
  refundable: boolean | null;
  changeable: boolean | null;
  installmentOptions: string[];
  benefits: string[];
  directAirlineSale: boolean;
  checkoutUrl: string | null;
  observedAt: string;
  expiresAt?: string | null;
  sponsored?: boolean;
};

export type ConnectorSearchResult = {
  outcome: SourceSearchOutcome;
  offers: SourceFlightOffer[];
  message?: string;
};

export type ConnectorHealth = {
  state: FlightSourceIntegrationState;
  checkedAt: string;
  message: string;
};

export type ConnectorRevalidationResult = {
  status: "confirmed" | "price_changed" | "unavailable" | "integration_required";
  offer: SourceFlightOffer | null;
  message: string;
};

export type FlightSourceStatus = {
  sourceId: string;
  sourceName: string;
  sourceType: FlightSourceType;
  state: FlightSourceSearchState;
  integrationState: FlightSourceIntegrationState;
  startedAt: string | null;
  completedAt: string;
  durationMs: number;
  receivedOfferCount: number;
  acceptedOfferCount: number;
  rejectedOfferCount: number;
  message: string;
  errorCode: ConnectorErrorCode | null;
};

export type NormalizedFlightSegment = {
  legIndex: number;
  marketingCarrierCode: string;
  marketingCarrierName: string | null;
  operatingCarrierCode: string;
  operatingCarrierName: string | null;
  flightNumber: string;
  origin: FlightEndpoint;
  destination: FlightEndpoint;
  departureLocal: string;
  departureUtc: string;
  arrivalLocal: string;
  arrivalUtc: string;
  durationMinutes: number;
  cabinClass: FlightCabinClass;
  aircraft: string | null;
  selfTransfer: boolean;
};

export type NormalizedConditionalPrice = ConditionalFlightPrice;

export type NormalizedFlightOffer = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: FlightSourceType;
  sourceOfferId: string;
  itineraryKey: string;
  passengerCount: number;
  farePackage: string;
  price: SourceOfferPrice & { conditionalPrices: NormalizedConditionalPrice[] };
  baggage: SourceOfferBaggage;
  refundable: boolean | null;
  changeable: boolean | null;
  installmentOptions: string[];
  benefits: string[];
  directAirlineSale: boolean;
  checkoutUrl: string | null;
  observedAt: string;
  expiresAt: string | null;
  sponsored: boolean;
  segments: NormalizedFlightSegment[];
};

export type FlightLegSummary = {
  legIndex: number;
  origin: string;
  destination: string;
  departureUtc: string;
  arrivalUtc: string;
  durationMinutes: number;
  stops: number;
  stopAirports: string[];
};

export type FlightItinerary = {
  id: string;
  itineraryKey: string;
  segments: NormalizedFlightSegment[];
  legs: FlightLegSummary[];
  totalDurationMinutes: number;
  totalStops: number;
  hasSelfTransfer: boolean;
  offers: NormalizedFlightOffer[];
};

export type OfferPriceEligibilityReason =
  | "currency_mismatch"
  | "mandatory_fees_unknown"
  | "cabin_baggage_price_unknown"
  | "checked_baggage_price_unknown"
  | "checked_baggage_weight_unknown"
  | "checked_baggage_weight_insufficient";

export type CalculatedOfferPrice = {
  eligible: boolean;
  total: number | null;
  perPassenger: number | null;
  currency: string;
  usedConditionalPriceId: string | null;
  addedCabinBaggageFee: number;
  addedCheckedBaggageFee: number;
  reasons: OfferPriceEligibilityReason[];
};

export type BestValueFactor = {
  key: "price" | "duration" | "stops" | "baggage" | "flexibility" | "direct_seller";
  label: string;
  weight: number;
  score: number;
  contribution: number;
};

export type OfferRanking = {
  offerId: string;
  calculatedPrice: CalculatedOfferPrice;
  bestValueScore: number;
  factors: BestValueFactor[];
  reasons: string[];
};

export type RankedFlightItinerary = FlightItinerary & {
  labels: Array<"cheapest" | "fastest" | "best_value">;
  cheapestOfferId: string | null;
  bestValueOfferId: string | null;
  offerRankings: OfferRanking[];
};

export type FlightSearchResponse = {
  searchId: string;
  status: "completed" | "partial" | "unavailable";
  request: FlightSearchRequest;
  startedAt: string;
  completedAt: string;
  sourceStatuses: FlightSourceStatus[];
  itineraries: RankedFlightItinerary[];
  summary: {
    itineraryCount: number;
    offerCount: number;
    checkedSourceCount: number;
    successfulSourceCount: number;
    failedSourceCount: number;
    integrationRequiredSourceCount: number;
  };
};

export type OfferNormalizationIssue = {
  path: string;
  message: string;
};

export type OfferNormalizationResult =
  | { ok: true; offer: NormalizedFlightOffer }
  | { ok: false; issues: OfferNormalizationIssue[] };
