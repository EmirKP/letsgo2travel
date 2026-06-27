export type VisaStatus = "vizesiz" | "kapida-vize" | "e-vize" | "kimlikle" | "vizeli";

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
  trip_type?: "Gidiş dönüş" | "Tek yön";
  visa_type: VisaStatus | "schengen";
  region: string;
  image_url?: string;
  affiliate_url: string;
  active?: boolean;
  clicks?: number;
  created_at?: string;
};

export type BlogPost = {
  id: number | string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  read_time: string;
  image_url?: string;
  author?: string;
  published_at?: string;
};

export type CountryGuide = {
  id: number | string;
  slug: string;
  country_code: string;
  country_name: string;
  continent: string;
  region: string;
  emoji: string;
  icon_image?: string;
  visa_status: VisaStatus;
  visa_note: string;
  avg_flight_price: number;
  flight_duration: string;
  best_months: string;
  airport_code: string;
  is_popular?: boolean;
  hero_image_url?: string;
  content_markdown?: string;
};

export type SiteSettings = {
  bookingAffiliateUrl: string;
  airaloAffiliateUrl: string;
  getYourGuideAffiliateUrl: string;
  travelpayoutsMarker: string;
  supportEmail: string;
};
