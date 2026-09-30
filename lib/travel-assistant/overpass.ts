// One budget shared by online places and explicit offline-pack downloads in each worker.
let active = 0;
let started = 0;
let requests = 0;
let cooldown = 0;
export async function queryOverpass(
  query: string,
  timeout = 16000,
): Promise<unknown> {
  const now = Date.now();
  if (now - started >= 60000) {
    started = now;
    requests = 0;
  }
  if (active >= 2 || requests >= 12 || cooldown > now)
    throw new Error("Map service busy");
  const endpoint = new URL(
    process.env.TRAVEL_OVERPASS_URL ||
      "https://overpass.private.coffee/api/interpreter",
  );
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
    throw new Error("Invalid provider");
  active++;
  requests++;
  try {
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
    if (response.status === 429) {
      cooldown = Date.now() + 60000;
      throw new Error("Map service busy");
    }
    if (!response.ok || !response.body) throw new Error("Map unavailable");
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
          throw new Error("Map too large");
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    const raw = JSON.parse(body);
    if (raw.remark || !Array.isArray(raw.elements))
      throw new Error("Incomplete map");
    return raw;
  } catch (e) {
    // A single timed-out area must not disable every map tool for a minute.
    // Keep an upstream rate-limit cooldown; other transient failures back off briefly.
    cooldown = Math.max(cooldown, Date.now() + 5000);
    throw e;
  } finally {
    active--;
  }
}
