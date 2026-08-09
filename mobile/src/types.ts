export type TabId = "home" | "explore" | "route" | "trips" | "profile";

export type ViewId = TabId | "passport" | "search" | "surprise" | "cockpit" | "community";

export type VisaStatus = "id_card" | "free" | "evisa" | "on_arrival" | "required";

export type Country = {
  name: string;
  alpha3: string;
};

export type AirportOption = {
  id: string;
  name: string;
  type: "airport" | "city" | "country";
  countryName?: string;
  code: string;
};

export type FlightCabinClass = "economy" | "premium_economy" | "business" | "first";

export type FlightCurrency = "TRY" | "EUR" | "USD";

export type FlightResultSort = "best_value" | "cheapest" | "fastest" | "departure";

export type FlightSearchInput = {
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  departureDate: string;
  returnDate: string;
  tripType: "round_trip" | "one_way";
  adults: number;
  children: number;
  infants: number;
  cabinClass: FlightCabinClass;
  cabinBagsPerPassenger: number;
  checkedBagsPerPassenger: number;
  checkedBagWeightKg: number | null;
  currency: FlightCurrency;
  directOnly: boolean;
  includeNearbyAirports: boolean;
};

export type SavedFlightSearch = FlightSearchInput & {
  id: string;
  createdAt: string;
  searchId?: string;
  resultUrl?: string;
};

export type FlightMetaSourceStatus = {
  sourceId: string;
  sourceName: string;
  state: string;
  message: string;
  offerCount?: number;
};

export type FlightMetaOffer = {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  fareFamily?: string | null;
  totalPrice: number | null;
  perPersonPrice: number | null;
  currency: string;
  conditional: boolean;
  conditionSummary?: string | null;
  baggage?: Record<string, unknown>;
  fareRules?: { refundable?: boolean | null; changeable?: boolean | null };
  installmentOptions?: string[];
  benefits?: string[];
  directAirlineSale: boolean;
  priceCompleteness: string;
  sponsored: boolean;
  rankingEligible: boolean;
  effectiveTotalPrice: number | null;
  eligibilityReasons: string[];
  observedAt?: string | null;
  receivedAt?: string | null;
  verifiedAt?: string | null;
  expiresAt?: string | null;
};

export type FlightMetaSegment = {
  id: string;
  order: number;
  legIndex: number;
  marketingAirline: string;
  flightNumber: string;
  operatingAirline?: string | null;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  departureLocal: string;
  arrivalLocal: string;
  departureTerminal?: string | null;
  arrivalTerminal?: string | null;
  cabinClass?: FlightCabinClass;
  aircraft?: string | null;
  selfTransfer?: boolean;
};

export type FlightMetaItinerary = {
  id: string;
  totalDurationMinutes: number;
  stopCount: number;
  marketingAirlines?: string[];
  operatingAirlines?: string[];
  transferAirports?: string[];
  hasAirportChange?: boolean;
  hasSelfTransfer?: boolean;
  hasOvernightLayover?: boolean;
  labels: string[];
  rankingExplanation?: { offerId?: string; score?: number; reasons?: string[]; pending?: boolean };
  segments: FlightMetaSegment[];
  offers: FlightMetaOffer[];
};

export type FlightOfferRevalidation = {
  status: "confirmed" | "price_changed" | "unavailable";
  offerId: string;
  totalPrice: number | null;
  perPersonPrice?: number | null;
  effectiveTotalPrice: number | null;
  currency: string;
  baggage: Record<string, unknown> | null;
  fareFamily: string | null;
  benefits: string[];
  priceChanged: boolean;
  termsChanged: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  message?: string;
};

export type FlightMetaSearchCreate = {
  id: string;
  status: string;
  accessToken: string;
  createdAt: string;
  expiresAt: string;
  sourceStatuses: FlightMetaSourceStatus[];
  message: string;
};

export type FlightMetaSearchResult = {
  id: string;
  status: string;
  isComplete: boolean;
  sourceStatuses: FlightMetaSourceStatus[];
  itineraries: FlightMetaItinerary[];
  summary: {
    itineraryCount: number;
    offerCount: number;
    sourceCount: number;
    completedSourceCount: number;
    failedSourceCount: number;
  };
};

export type PlannerInput = {
  origin: string;
  days: string;
  month: string;
  budget: string;
  accommodation: string;
  who: string;
  tempo: string;
  vibe: string[];
  visa: string;
};

export type RouteSuggestion = {
  name: string;
  country: string;
  cityOrRegion: string;
  destinationCode?: string;
  why: string;
  visaStatus: string;
  visaNote?: string;
  visaSourceUrl?: string;
  visaVerifiedAt?: string | null;
  verifiedEntryStatus?: "identity_card" | "visa_free" | "e_visa" | "visa_on_arrival" | "visa_required" | "unknown";
  estimatedBudget: string;
  idealDuration: string;
  bestFor: string;
  difficulty: string;
  firstTimeFriendly: boolean;
  transportEase: string;
  safetyNote: string;
  scores: {
    budget: number;
    visaEase: number;
    firstTime: number;
    transport: number;
    overall: number;
  };
  dailyPlan: string[];
  warnings: string[];
  cta?: {
    flightSearchText?: string;
    guideText?: string;
    forumText?: string;
  };
};

export type RoutePlan = {
  summary: string;
  routes: RouteSuggestion[];
};

export type SavedRoutePlan = {
  id: string;
  createdAt: string;
  input: PlannerInput;
  plan: RoutePlan;
};

export type FlightDeal = {
  id: number | string;
  slug: string;
  title: string;
  origin: string;
  destination: string;
  origin_code: string;
  destination_code: string;
  price: number;
  currency: string;
  airline?: string;
  travel_period?: string;
  trip_type?: string;
  visa_type?: string;
  region?: string;
  image_url?: string;
  affiliate_url: string;
};

export type FlightAlert = {
  id: string;
  origin_code: string;
  origin_label: string;
  destination_code: string;
  destination_label: string;
  departure_date: string;
  return_date?: string | null;
  trip_type: string;
  target_price?: number | null;
  threshold_percent?: number | null;
  last_checked_price?: number | null;
  lowest_price_seen?: number | null;
  is_active?: boolean;
  status?: string;
  created_at: string;
};

export type WeatherSummary = {
  place: string;
  temperature: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  min: number;
  max: number;
};

export type VerifiedVisaRule = {
  country: string;
  status: "identity_card" | "visa_free" | "e_visa" | "visa_on_arrival" | "visa_required" | "unknown";
  label: string;
  note: string;
  sourceUrl: string;
  verifiedAt: string | null;
};

export type VisaAppointmentNotification = {
  id: string;
  title: string;
  message: string;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
};

export type TravelVerification = {
  id: string;
  country_code?: string;
  country_name?: string;
  status?: "pending" | "approved" | "rejected" | "expired" | string;
  created_at?: string;
};

export type AuthUser = {
  id: string;
  email?: string;
  created_at: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type?: string;
  user: AuthUser;
};

export type FavoriteDestination = {
  alpha3: string;
  name: string;
  createdAt: string;
};

export type AppNotificationKind = "release" | "route" | "price" | "visa";

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  kind: AppNotificationKind;
  view?: ViewId;
};

export type MobilePreferences = {
  inAppNotifications: boolean;
  haptics: boolean;
};
