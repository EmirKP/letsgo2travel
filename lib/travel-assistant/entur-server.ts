import { normalizeEnturStops, normalizeEnturTransit, validEnturStop } from "./entur";

// Entur open services, NLOD: https://developer.entur.no/terms-of-service
// Fixed application identity; no user/account identifiers are sent upstream.
const clientName = "letsgo2travel-traveltools";
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let cooldown = 0;
const query = `query TravelTools($from:String!,$to:String!) {
  trip(from:{place:$from},to:{place:$to},numTripPatterns:3) {
    tripPatterns { duration expectedStartTime expectedEndTime
      legs { mode duration expectedStartTime expectedEndTime fromPlace { name } toPlace { name }
        line { publicCode name } situations { summary { value language } } }
    }
  }
}`;
async function request(key: string, url: string, ttl: number, body?: object): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (cooldown > Date.now()) throw new Error("Entur cooldown");
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 4) throw new Error("Entur busy");
  const operation = (async () => {
    const response = await fetch(url, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
      headers: { Accept: "application/json", "Content-Type": "application/json", "ET-Client-Name": clientName },
      redirect: "error", signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (response.status === 429) {
      const quota = Date.parse(response.headers.get("Rate-Limit-Expiry-Time") || "");
      const retry = response.headers.get("Retry-After") || "60";
      const retryAt = /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry);
      cooldown = Math.max(Date.now() + 60000, Number.isFinite(quota) ? quota : 0, Number.isFinite(retryAt) ? retryAt : 0);
    }
    if (!response.ok || !response.body) throw new Error("Entur unavailable");
    if (Number(response.headers.get("Content-Length")) > 1000000) { await response.body.cancel(); throw new Error("Entur response too large"); }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let size = 0, raw = "";
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1000000) { await reader.cancel(); throw new Error("Entur response too large"); } raw += decoder.decode(value, { stream: true }); }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(raw);
    // Validate before caching; GraphQL errors are often returned with HTTP 200.
    if (body) normalizeEnturTransit(data); else normalizeEnturStops(data);
    if (cache.size >= 150) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + ttl, value: data });
    return data;
  })();
  pending.set(key, operation);
  try { return await operation; }
  catch (error) { cooldown = Math.max(cooldown, Date.now() + 5000); throw error; }
  finally { pending.delete(key); }
}
export async function searchEnturStops(term: string) {
  const q = term.trim();
  if (q.length < 2 || q.length > 60) throw new Error("Invalid Entur search");
  const params = new URLSearchParams({ q, lang: "en", limit: "16", layers: "stopPlace", countries: "NO" });
  return normalizeEnturStops(await request(`stops:${q.toLowerCase()}`, `https://api.entur.io/geocoder/v3/autocomplete?${params}`, 86400000));
}
export async function readEnturJourney(from: string, to: string) {
  if (!validEnturStop(from) || !validEnturStop(to) || from === to) throw new Error("Invalid Entur stops");
  return normalizeEnturTransit(await request(`trip:${from}:${to}`, "https://api.entur.io/journey-planner/v3/graphql", 30000, { query, variables: { from, to } }));
}
