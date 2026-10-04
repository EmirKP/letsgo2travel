// One budget shared by online places and explicit offline-pack downloads in each worker.
let active = 0;
let started = 0;
let requests = 0;
let cooldown = 0;
let preferredProvider = '';
const unavailableUntil = new Map<string, number>();
// Both instances permit any-project use. Do not fall back to the restricted
// FOSSGIS service. Policy checked 2026-10-04:
// https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
const PUBLIC_PROVIDERS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
class ProviderError extends Error {
  constructor(message: string, readonly retryable = false, readonly pauseMs = 0, readonly code = 'invalid-response') { super(message); }
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
  }).filter(endpoint => (unavailableUntil.get(endpoint.href) || 0) <= now)
    .sort((a, b) => Number(b.href === preferredProvider) - Number(a.href === preferredProvider));
  if (!providers.length) throw new Error("Map service busy");
  const deadline = now + Math.max(1, Math.min(timeout, 26000));
  active++;
  try {
    for (let index = 0; index < providers.length; index++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0 || requests >= 12) throw new Error("Map service busy");
      const endpoint = providers[index];
      // Give the bounded query its declared execution time plus transport time.
      // A 3s probe cancelled healthy 12s queries before they could finish. Keep
      // at least 5s (or half a shorter total budget) for sequential failover.
      const querySeconds = Math.min(20, Math.max(1, Number(query.match(/\[timeout:(\d+)\]/)?.[1] || 12)));
      const attemptTimeout = index < providers.length - 1
        ? Math.max(1, Math.floor(Math.min(querySeconds * 1000 + 1000, Math.max(remaining / 2, remaining - 5000))))
        : remaining;
      const attemptStarted = Date.now();
      requests++;
      try {
        const value = await readProvider(endpoint, query, attemptTimeout);
        preferredProvider = endpoint.href;
        return value;
      } catch (error) {
        // Never log the query, coordinates, full configured URL or credentials.
        // These bounded diagnostics distinguish an outage from a bad response.
        console.warn('travel_map_provider_failure', {
          provider: configured ? 'configured' : endpoint.hostname,
          code: error instanceof ProviderError ? error.code : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'network',
          durationMs: Math.max(0, Date.now() - attemptStarted),
        });
        if (error instanceof ProviderError && error.pauseMs) cooldown = Date.now() + error.pauseMs;
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
        throw new ProviderError("Map request declined", false, retryDelay(response.headers.get('retry-after')), `http-${response.status}`);
      throw new ProviderError("Map unavailable", response.status >= 500, 0, `http-${response.status}`);
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
          await reader.cancel().catch(() => {});
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
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.elements))
      throw new ProviderError("Incomplete map");
    if (raw.remark) {
      const remark = typeof raw.remark === 'string' ? raw.remark : '';
      // Overpass can return HTTP 200 with a runtime error and partial elements.
      // Never accept those elements as complete. Retry only known transient
      // execution errors, and never hop hosts to work around a denial/quota.
      if (/rate[ -]?limit|too many requests|quota|access denied|forbidden|not authori[sz]ed/i.test(remark)) {
        throw new ProviderError("Map request declined", false, 60000, 'runtime-declined');
      }
      if (/runtime error:/i.test(remark) && /query timed out|server is probably too busy|server is overloaded/i.test(remark)) {
        throw new ProviderError("Map runtime unavailable", true, 0, 'runtime-unavailable');
      }
      throw new ProviderError("Incomplete map");
    }
    return raw;
}

function retryDelay(header: string | null) {
  if (!header) return 60000;
  const ms = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.max(60000, ms) : 60000;
}
