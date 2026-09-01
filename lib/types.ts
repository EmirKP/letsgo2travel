export type VisaStatus = "vizesiz" | "kapida-vize" | "e-vize" | "kimlikle" | "vizeli";

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
  supportEmail: string;
};
