// Read-only retry. Never wrap claims, writes or APNs delivery in this helper.
type ReadResult<T> = { data: T | null; error: unknown; status?: number };
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 3000;

function diagnostic(error: unknown, status?: number) {
  const fields = error && typeof error === "object" ? error as Record<string, unknown> : {};
  // Codes, unlike raw error messages/details, contain no URLs or user data.
  const code = typeof fields.code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3}|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(fields.code) ? fields.code : "unknown";
  const http = Number.isInteger(status) && status! >= 0 && status! <= 599 ? status! : 0;
  const message = typeof fields.message === "string" ? fields.message : "";
  const transport = fields.name === "TimeoutError" || fields.name === "AbortError"
    || /fetch failed|network|ECONNRESET|ETIMEDOUT|socket|aborted|timeout/i.test(message);
  const transientCode = /^(08[A-Z0-9]{3}|57P0[123]|57014|PGRST00[012]|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(code);
  // A known DB/auth/schema error wins over an ambiguous HTTP 500.
  const retryable = transientCode || (code === "unknown" && (transport || status === 0 || [408,429,500,502,503,504].includes(http)));
  return { code, status: http, category: transport ? "transport" : transientCode ? "database_unavailable" : http >= 500 ? "upstream" : "database", retryable };
}

export async function readLiveActivityTrips<T>(
  query: (signal: AbortSignal) => PromiseLike<ReadResult<T>>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<ReadResult<T>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ReadResult<T>;
    try { result = await query(AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)); }
    catch (error) { result = { data: null, error }; }
    if (!result.error) {
      if (attempt > 1) console.info("live_activity_trip_read_recovered", { attempts: attempt });
      return result;
    }
    const info = diagnostic(result.error, result.status);
    const retry = info.retryable && attempt < MAX_ATTEMPTS;
    console.warn("live_activity_trip_read_failed", { ...info, attempt, retry });
    if (!retry) return result;
    await wait(200 * attempt);
  }
  throw new Error("unreachable_trip_read_state");
}

export function tripReadFailure(error: unknown, status?: number) {
  const { code, status: http, category } = diagnostic(error, status);
  return new Error(`trips_query_failed:${code}:http_${http}:${category}`);
}
