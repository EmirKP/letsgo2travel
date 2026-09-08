import { plainText, publicLink } from "./fetch";
import type { NewsItem } from "./types";

// RSS from a fixed publisher allowlist only. No entity expansion, scripts,
// remote XML resources or arbitrary URL fetching.
export function parseNewsRss(xml: string, code: string, provider: "Anadolu Ajansı" | "BBC", now = new Date()): NewsItem[] {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
  const names = [new Intl.DisplayNames(["tr"], {type:"region"}).of(code), new Intl.DisplayNames(["en"], {type:"region"}).of(code)].filter(Boolean) as string[];
  if (code === "TR") names.push("Turkey", "Turkish");
  if (code === "US") names.push("ABD", "United States", "Washington");
  const matcher = new RegExp(`(^|[^\\p{L}])(${names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")})([^\\p{L}]|$)`, "iu");
  const tag = (raw: string, name: string) => plainText((raw.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,"i"))?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1"), 600);
  const rows: NewsItem[] = [];
  for (const block of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const title = tag(block[1],"title"); const url = publicLink(tag(block[1],"link"));
    const timestamp = Date.parse(tag(block[1],"pubDate")); const age = now.getTime()-timestamp;
    if (!title || !url || !matcher.test(title+" "+tag(block[1],"description")) || !Number.isFinite(timestamp) || age < 0 || age > 7*86400000) continue;
    if (!/^(www\.)?(aa\.com\.tr|bbc\.com|bbc\.co\.uk)$/.test(new URL(url).hostname)) continue;
    rows.push({ title, url, publisher: provider, provider, language: provider === "Anadolu Ajansı" ? "Turkish" : "English", firstSeenAt: now.toISOString(), publishedAt: new Date(timestamp).toISOString(), eventDate:null, topic:"general" });
    if (rows.length===8) break;
  }
  return rows;
}
