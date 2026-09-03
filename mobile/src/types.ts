export type TabId = "home" | "explore" | "route" | "trips" | "profile";

export type ViewId = TabId | "passport" | "surprise" | "cockpit" | "community" | "alerts" | "events" | "companion" | "phrases" | "admin";

export type VisaStatus = "id_card" | "free" | "evisa" | "on_arrival" | "required" | "unknown";

export type Country = {
  name: string;
  alpha3: string;
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

export type WeatherSummary = {
  place: string;
  temperature: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  min: number;
  max: number;
};

export type TravelEvent = {
  id: string;
  provider: "curated" | "ticketmaster";
  title: string;
  description: string;
  category: "concert" | "festival" | "sport" | "culture" | "food" | "family" | "other";
  countryCode: string;
  city: string;
  venue: string;
  startsAt: string;
  endsAt: string | null;
  status: "scheduled" | "postponed" | "cancelled" | "completed";
  imageUrl: string | null;
  ticketUrl: string | null;
  sourceUrl: string;
  featured: boolean;
  updatedAt: string;
};

export type TravelNowResult = {
  weather: {
    temperature: number;
    apparentTemperature: number;
    precipitation: number;
    weatherCode: number;
    description: string;
    localTime: string;
    timeZone: string;
  };
  recommendations: Array<{
    id: string;
    title: string;
    reason: string;
    duration: string;
    mapQuery: string;
    indoor: boolean;
  }>;
  privacy: string;
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
  admin_note?: string | null;
};

export type FlightAlert = {
  id: string;
  origin_code: string;
  origin_label: string;
  destination_code: string;
  destination_label: string;
  departure_date: string;
  target_price?: number | null;
  threshold_percent?: number | null;
  base_price?: number | null;
  last_checked_price?: number | null;
  last_checked_at?: string | null;
  last_notified_at?: string | null;
  notify_email?: boolean;
  notify_push?: boolean;
  is_active?: boolean;
  status?: string;
  last_mail_status?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
  error_count?: number | null;
  created_at: string;
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

export type AppNotificationKind = "release" | "route" | "visa" | "price";

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
