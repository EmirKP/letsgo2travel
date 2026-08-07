export type TabId = "home" | "explore" | "route" | "trips" | "profile";

export type ViewId = TabId | "passport" | "search";

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

export type FlightSearchInput = {
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  departureDate: string;
  returnDate: string;
  tripType: "round_trip" | "one_way";
  adults: number;
  cabinClass: "economy" | "business";
};

export type SavedFlightSearch = FlightSearchInput & {
  id: string;
  createdAt: string;
  resultUrl?: string;
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

export type AppNotificationKind = "release" | "route" | "price" | "tip";

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
