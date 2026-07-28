function cleanUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = cleanUrl(
  import.meta.env.VITE_API_BASE_URL || "https://www.letsgo2travel.com.tr",
);
export const SITE_URL = cleanUrl(
  import.meta.env.VITE_SITE_URL || "https://www.letsgo2travel.com.tr",
);
export const SUPABASE_URL = cleanUrl(import.meta.env.VITE_SUPABASE_URL || "");
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const AUTH_REDIRECT =
  import.meta.env.VITE_AUTH_REDIRECT || "tr.com.letsgo2travel.app://auth/callback";

export function absoluteUrl(value?: string | null) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_BASE_URL}/${value.replace(/^\/+/, "")}`;
}
