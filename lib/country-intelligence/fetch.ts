type CacheEntry = { until: number; value: unknown };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
const failures = new Map<string, number>();
const providerCooldown = new Map<string, number>();
const ALLOWED_HOSTS = new Set(["api.frankfurter.dev", "ec.europa.eu", "api.worldbank.org", "www.gov.uk", "api.gdeltproject.org", "date.nager.at"]);

export async function publicJson<T>(url: string, ttlSeconds: number, timeoutMs = 8000): Promise<T> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !ALLOWED_HOSTS.has(parsed.hostname)) throw new Error("Invalid public data source");
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.value as T;
  if ((failures.get(url) || 0) > Date.now()) throw new Error("Source retry cooldown");
  if ((providerCooldown.get(parsed.hostname) || 0) > Date.now()) throw new Error("Provider retry cooldown");
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;
  const operation = (async () => {
    const response = await fetch(url, {
      redirect: "error", signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json", "User-Agent": "LetsGo2Travel/1.4 (public travel information)" },
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get("retry-after") || "180";
        const seconds = /^\d+$/.test(retry) ? Number(retry) : (Date.parse(retry) - Date.now()) / 1000;
        failures.set(url, Date.now() + Math.max(180, Number.isFinite(seconds) ? seconds : 180) * 1000);
        providerCooldown.set(parsed.hostname, failures.get(url)!);
      }
      throw new Error(`Public data unavailable (${response.status})`);
    }
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new Error("Public response too large");
    const value: unknown = JSON.parse(raw);
    if (cache.size >= 350) cache.delete(cache.keys().next().value!);
    cache.set(url, { until: Date.now() + ttlSeconds * 1000, value });
    return value;
  })();
  inFlight.set(url, operation);
  try { return await operation as T; } catch (error) {
    if (!failures.has(url) || failures.get(url)! <= Date.now()) failures.set(url, Date.now() + 60_000);
    if (failures.size > 350) failures.delete(failures.keys().next().value!);
    throw error;
  } finally { inFlight.delete(url); }
}

export function plainText(input: unknown, max = 600) {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim().slice(0, max);
}

export function publicLink(input: unknown): string | null {
  try {
    if (typeof input !== "string") return null;
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".")
      || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
