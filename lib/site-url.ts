const DEFAULT_SITE_URL = "https://www.letsgo2travel.com.tr";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;

  try {
    const url = new URL(configured);
    if (
      url.hostname === "letsgo2travel.com.tr" ||
      url.hostname.endsWith(".vercel.app") ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1"
    ) {
      return DEFAULT_SITE_URL;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}
