// One budget shared by online places and explicit offline-pack downloads in each worker.
let active = 0;
let started = 0;
let requests = 0;
let cooldown = 0;
const unavailableUntil = new Map<string, number>();
// Both instances permit any-project use. Do not fall back to the restricted
// FOSSGIS service. Policy checked 2026-09-30:
// https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
const PUBLIC_PROVIDERS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
class ProviderError extends Error {
  constructor(message: string, readonly retryable = false, readonly pause = false) { super(message); }
}
export async function queryOverpass(
  query: string,
  timeout = 26000,
): Promise<unknown> {
  const now = Date.now();
  if (now - started >= 60000) {
    started = now;
    requests = 0;
  }
  if (active >= 2 || requests >= 12 || cooldown > now)
    throw new Error("Map service busy");
  // An explicitly configured provider never sends its query to another host.
  const configured = process.env.TRAVEL_OVERPASS_URL?.trim();
  const providers = (configured ? [configured] : PUBLIC_PROVIDERS).map(value => {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("Invalid provider");
    return endpoint;
  }).filter(endpoint => (unavailableUntil.get(endpoint.href) || 0) <= now);
  if (!providers.length) throw new Error("Map service busy");
  const deadline = now + Math.max(1, Math.min(timeout, 26000));
  active++;
  try {
    for (let index = 0; index < providers.length; index++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0 || requests >= 12) throw new Error("Map service busy");
      const endpoint = providers[index];
      // Reserve time for the second provider; requests are never raced.
      const attemptTimeout = index < providers.length - 1 ? Math.min(3000, remaining) : remaining;
      requests++;
      try {
        return await readProvider(endpoint, query, attemptTimeout);
      } catch (error) {
        if (error instanceof ProviderError && error.pause) cooldown = Date.now() + 60000;
        if (error instanceof ProviderError && !error.retryable) throw error;
        unavailableUntil.set(endpoint.href, Date.now() + 60000);
        if (index === providers.length - 1) throw error;
      }
    }
    throw new Error("Map unavailable");
  } catch (error) {
    cooldown = Math.max(cooldown, Date.now() + 5000);
    throw error;
  } finally {
    active--;
  }
}

async function readProvider(endpoint: URL, query: string, timeout: number) {
    const response = await fetch(endpoint, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "LetsGo2Travel/next (+https://www.letsgo2travel.com.tr)",
      },
      signal: AbortSignal.timeout(timeout),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      // Release a failed response before trying another host. Cancellation
      // failures must not turn a denial into a retryable network error.
      await response.body?.cancel().catch(() => {});
      if (response.status >= 400 && response.status < 500)
        throw new ProviderError("Map request declined", false, true);
      throw new ProviderError("Map unavailable", response.status >= 500);
    }
    if (!response.body) throw new ProviderError("Empty map response");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4000000) {
          await reader.cancel();
          throw new ProviderError("Map too large");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let raw;
    try { raw = JSON.parse(body); } catch { throw new ProviderError("Invalid map response"); }
    if (!raw || typeof raw !== "object" || raw.remark || !Array.isArray(raw.elements))
      throw new ProviderError("Incomplete map");
    return raw;
}
