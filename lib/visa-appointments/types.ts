export const VISA_CATEGORIES = [
  { value: "tourism", label: "Turistik" },
  { value: "family_visit", label: "Aile / arkadaş ziyareti" },
  { value: "business", label: "Ticari" },
  { value: "education", label: "Eğitim / kurs" },
  { value: "cultural", label: "Kültürel / sportif etkinlik" },
  { value: "transit", label: "Transit" },
] as const;

export const APPLICATION_CITIES = [
  "İstanbul",
  "Ankara",
  "İzmir",
  "Antalya",
  "Bursa",
  "Gaziantep",
  "Trabzon",
] as const;

export type VisaCategory = (typeof VISA_CATEGORIES)[number]["value"];
export type ApplicationCity = (typeof APPLICATION_CITIES)[number];

export type VisaAppointmentTrackStatus =
  | "pending_activation"
  | "active"
  | "paused"
  | "match_found"
  | "verification_required"
  | "expired"
  | "error";

export type VisaAppointmentTrack = {
  id: string;
  country_code: string;
  country_name: string;
  provider_code: string | null;
  provider_name: string | null;
  application_city: string;
  alternative_city: string | null;
  visa_category: VisaCategory;
  applicants_count: number;
  earliest_date: string;
  latest_date: string;
  notify_email: boolean;
  notify_push: boolean;
  notify_in_app: boolean;
  status: VisaAppointmentTrackStatus;
  access_expires_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_result: string | null;
  created_at: string;
  updated_at: string;
};

export type TrackCreateInput = {
  countryCode: string;
  applicationCity: ApplicationCity;
  alternativeCity?: ApplicationCity | "";
  visaCategory: VisaCategory;
  applicantsCount: number;
  earliestDate: string;
  latestDate: string;
  notifyEmail: boolean;
  notifyPush: boolean;
  notifyInApp: boolean;
};

export const TRACK_STATUS_LABELS: Record<VisaAppointmentTrackStatus, string> = {
  pending_activation: "Aktivasyon bekliyor",
  active: "Randevu aranıyor",
  paused: "Takip duraklatıldı",
  match_found: "Uygun tarih bulundu",
  verification_required: "Kullanıcı işlemi gerekiyor",
  expired: "Takip süresi doldu",
  error: "Teknik kontrol gerekiyor",
};
