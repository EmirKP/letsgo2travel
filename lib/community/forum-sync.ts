import { ISO_COUNTRIES, isoCountryByAlpha2 } from "../countries/isoSource";

export const GENERAL_FORUM_COUNTRY_CODE = "ZZ";
export const PUBLIC_FORUM_REPLY_PREVIEW_COUNT = 2;
export const MAX_FORUM_REPLIES_PER_DETAIL = 100;

const TURKISH_CHARACTERS: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
};

export function forumSlugPart(value: string) {
  return String(value || "")
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (character) => TURKISH_CHARACTERS[character] || character)
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const countryCodeBySlug = new Map(
  ISO_COUNTRIES.map((country) => [forumSlugPart(country.name), country.alpha2]),
);

// Sitede geçmişte kullanılan kısa/şehir odaklı ülke slug'ları.
const COUNTRY_SLUG_ALIASES: Record<string, string> = {
  abd: "US",
  amerika: "US",
  bae: "AE",
  dubai: "AE",
  ingiltere: "GB",
  kosova: "XK",
};

export function countryCodeFromForumSlug(value: string | null | undefined) {
  const slug = forumSlugPart(value || "");
  if (!slug) return GENERAL_FORUM_COUNTRY_CODE;
  const directCode = slug.toUpperCase();
  if (/^[A-Z]{2}$/.test(directCode) && isoCountryByAlpha2(directCode)) return directCode;
  return COUNTRY_SLUG_ALIASES[slug] || countryCodeBySlug.get(slug) || GENERAL_FORUM_COUNTRY_CODE;
}

export function forumCountrySlugFromCode(value: string) {
  const code = String(value || "").trim().toUpperCase();
  if (code === GENERAL_FORUM_COUNTRY_CODE) return null;
  const country = isoCountryByAlpha2(code);
  return country ? forumSlugPart(country.name) : null;
}

export function forumCategoryFromCommunityCategory(value: string) {
  const category = String(value || "").trim().toLocaleLowerCase("tr-TR");
  const categories: Record<string, string> = {
    general: "Ülke Bazlı Sorunlar",
    visa: "Vize & Konsolosluk",
    flight: "Uçuş & Havalimanı",
    hotel: "Otel & Konaklama",
    esim: "eSIM & İnternet",
  };
  return categories[category] || "Ülke Bazlı Sorunlar";
}

export function forumStatusFromModeration(action: "visible" | "pending_review") {
  return action === "visible" ? "published" : "pending";
}

export function forumReplyLimit(isPaywalled: boolean, hasFullAccess: boolean) {
  return isPaywalled && !hasFullAccess
    ? PUBLIC_FORUM_REPLY_PREVIEW_COUNT
    : MAX_FORUM_REPLIES_PER_DETAIL;
}

export function createForumTopicSlug(title: string, id: string) {
  const titlePart = forumSlugPart(title).slice(0, 72) || "gezgin-sorusu";
  const idPart = String(id || "").replace(/[^a-f0-9]/gi, "").slice(0, 10).toLowerCase();
  return `${titlePart}-${idPart || "yeni-konu"}`;
}
