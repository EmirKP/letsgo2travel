import { ISO_COUNTRIES } from "../countries/isoSource";
import { plainText, publicText } from "./fetch";
import { TURKISH_TRAVEL_SOURCES } from "./turkish-travel-sources";
import type { TurkishTravelNotice, TurkishTravelNotices } from "./types";

const MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];
const names = new Intl.DisplayNames(["tr"], { type: "region" });
const aliases: Record<string, string[]> = { US: ["ABD"], GB: ["İngiltere"], PS: ["Filistin"], MM: ["Myanmar"], KG: ["Kırgız Cumhuriyeti"] };
const countryNames = new Map(ISO_COUNTRIES.flatMap(row => [names.of(row.alpha2), ...(aliases[row.alpha2] || [])]
  .filter((name): name is string => !!name).map(name => [name.toLocaleLowerCase("tr"), row.alpha2])));
const countryPattern = new RegExp(`(?<![\\p{L}\\p{N}])(${[...countryNames.keys()].sort((a, b) => b.length - a.length)
  .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\p{L}\\p{N}])`, "gu");

export function noticeCountries(title: string): string[] {
  // Only destination names in the heading, never people or issuing ministries.
  // Longest matches prevent a South Sudan notice from appearing under Sudan.
  const destination = title.toLocaleLowerCase("tr").split(/yönelik|için/)[0];
  return [...new Set([...destination.matchAll(countryPattern)].map(match => countryNames.get(match[1])!))];
}

function noticeText(html: string, max: number) {
  return plainText(html.replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, digits: string) => {
    const point = digits.toLowerCase().startsWith("x") ? Number.parseInt(digits.slice(1), 16) : Number(digits);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  }), max);
}

export function parseTurkishNotices(html: string, code: string, now = new Date()): TurkishTravelNotices {
  const result: TurkishTravelNotices = { code, state: "unavailable", notices: [], verifiedAt: null,
    source: { name: "T.C. Dışişleri Bakanlığı", url: TURKISH_TRAVEL_SOURCES.notices, checkedAt: now.toISOString() } };
  if (!/Yurt\s+Dışı\s+Seyahat\s+Duyuruları/iu.test(noticeText(html, 2_000_000))) return result;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const found = new Map<string, TurkishTravelNotice>();
  let recognized = 0;
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = noticeText(match[2], 500);
    if (!/seyahat\s+(duyurusu|uyarısı)/iu.test(title)) continue;
    const date = title.toLocaleLowerCase("tr").match(/,\s*(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})$/u);
    if (!date || !MONTHS.includes(date[2])) continue;
    const publishedAt = `${date[3]}-${String(MONTHS.indexOf(date[2]) + 1).padStart(2, "0")}-${date[1].padStart(2, "0")}`;
    if (!Number.isFinite(Date.parse(publishedAt)) || new Date(publishedAt).toISOString().slice(0, 10) !== publishedAt || publishedAt > today) continue;
    let url: URL;
    try { url = new URL(match[1], "https://www.mfa.gov.tr/"); } catch { continue; }
    if (url.origin !== "https://www.mfa.gov.tr" || url.username || url.password || url.search || url.hash || !/^\/[a-z0-9_-]+\.tr\.mfa$/i.test(url.pathname)) continue;
    recognized++;
    if (noticeCountries(title).includes(code)) found.set(url.href, { title, url: url.href, publishedAt });
  }
  // A changed/challenge page is not an empty, successful advisory search.
  if (!recognized) return result;
  return { ...result, state: "ok", verifiedAt: now.toISOString(), notices: [...found.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3) };
}

// Verified links, not cached risk judgements. Retain the original publication
// date and explicitly mark the live list unavailable if it cannot be retrieved.
const REVIEWED: Array<[string[], string, string, string]> = [
  [["MM"], "Myanmar’a Yönelik Güvenlik ve Seyahat Duyurusu, 1 Kasım 2025", "2025-11-01", "myanmar-a-yonelik-guvenlik-ve-seyahat-duyurusu--1-kasim-2025.tr.mfa"],
  [["ML"], "Mali’ye Yönelik Güvenlik ve Seyahat Duyurusu, 24 Ekim 2025", "2025-10-24", "mali-ye-yonelik-guvenlik-ve-seyahat-duyurusu-24-ekim-2025.tr.mfa"],
  [["NP"], "Nepal’e Yönelik Güvenlik ve Seyahat Duyurusu, 9 Eylül 2025", "2025-09-09", "nepal-e-yonelik-guvenlik-ve-seyahat-duyurusu--9-eylul-2025.tr.mfa"],
  [["IR"], "İran’a Yönelik Güvenlik ve Seyahat Duyurusu, 13 Haziran 2025", "2025-06-13", "iran-a-yonelik-guvenlik-ve-seyahat-duyurusu-13-haziran-2025.tr.mfa"],
  [["SD"], "Sudan’a Yönelik Güvenlik ve Seyahat Duyurusu, 8 Mayıs 2025", "2025-05-08", "sudan-a-yonelik-guvenlik-ve-seyahat-duyurusu-8-mayis-2025.tr.mfa"],
  [["SS"], "Güney Sudan’a Yönelik Güvenlik ve Seyahat Duyurusu, 30 Mart 2025", "2025-03-30", "guney-sudan-a-iliskin-seyahat-uyarisi-30-mart-2025.tr.mfa"],
  [["LB"], "Lübnan’a Yönelik Güvenlik ve Seyahat Duyurusu, 4 Ağustos 2024", "2024-08-04", "lubnan-icin-seyahat-uyarisi-4-agustos-2024.tr.mfa"],
  [["IL", "PS"], "İsrail’e ve Filistin’e Yönelik Güvenlik ve Seyahat Duyurusu, 7 Ekim 2023", "2023-10-07", "israil-ve-filistin-icin-seyahat-uyarisi-7-ekim-2023.tr.mfa"],
  [["US"], "ABD’ye Yönelik Güvenlik ve Seyahat Duyurusu, 28 Ocak 2023", "2023-01-28", "abd-icin-seyahat-uyarisi-28-ocak-2023.tr.mfa"],
  [["UA"], "Ukrayna’ya Yönelik Güvenlik ve Seyahat Duyurusu, 24 Şubat 2022", "2022-02-24", "ukrayna-da-yasayan-vatandaslarimiz-icin-duyuru.tr.mfa"],
];

export function lastReviewedTurkishNotices(code: string, now = new Date()): TurkishTravelNotices {
  const empty = parseTurkishNotices("", code, now);
  const verifiedAt = "2026-09-10";
  if (now.toISOString().slice(0, 10) < verifiedAt) return empty;
  const notices = REVIEWED.filter(([codes]) => codes.includes(code)).map(([, title, publishedAt, path]) => ({ title, publishedAt, url: `https://www.mfa.gov.tr/${path}` }));
  return { ...empty, notices, verifiedAt: notices.length ? verifiedAt : null };
}

export async function getTurkishNotices(code: string): Promise<TurkishTravelNotices> {
  try {
    const data = parseTurkishNotices(await publicText(TURKISH_TRAVEL_SOURCES.notices, 900), code);
    if (data.state === "ok") return data;
  } catch { /* Keep verified links available; never claim the live list succeeded. */ }
  return lastReviewedTurkishNotices(code);
}
