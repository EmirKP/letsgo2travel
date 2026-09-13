// Read-only retry. Never wrap claims, writes or APNs delivery in this helper.
type ReadResult<T> = { data: T | null; error: unknown; status?: number };
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 6000;
export const LIVE_ACTIVITY_READ_BUDGET_MS = 20000;

function transportReason(error: unknown, aborted: boolean) {
  if (aborted) return "attempt_timeout";
  const fields = error && typeof error === "object" ? error as Record<string, unknown> : {};
  // Supabase serialises fetch.cause into details. Inspect known markers only;
  // never log the message, details, URL, stack or user data themselves.
  const text = [fields.name, fields.message, fields.details, fields.code].filter(value => typeof value === "string").join(" ");
  if (/\b(ENOTFOUND|EAI_AGAIN)\b/.test(text)) return "dns";
  if (/\b(ECONNRESET|UND_ERR_SOCKET|ECONNREFUSED)\b/.test(text)) return "connection";
  if (/\b(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT)\b/.test(text)) return "upstream_timeout";
  if (/TimeoutError|AbortError|ABORT_ERR/.test(text)) return "upstream_abort";
  return "unclassified";
}

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
  const retryable = transientCode || (code === "unknown" && (transport || status === 0 || [408,429,500,502,503,504,520,521,522,523,524].includes(http)));
  return { code, status: http, category: transport ? "transport" : transientCode ? "database_unavailable" : http >= 500 ? "upstream" : "database", retryable };
}

export async function readLiveActivityTrips<T>(
  query: (signal: AbortSignal) => PromiseLike<ReadResult<T>>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  deadlineMs: number = Date.now() + LIVE_ACTIVITY_READ_BUDGET_MS,
): Promise<ReadResult<T>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) {
      console.warn("live_activity_trip_read_budget_exhausted", { attempt });
      return { data: null, error: { code: "", name: "TimeoutError", message: "read_budget_exhausted" }, status: 0 };
    }
    const timeoutMs = Math.min(ATTEMPT_TIMEOUT_MS, remaining);
    const signal = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)));
    const started = Date.now();
    let result: ReadResult<T>;
    try { result = await query(signal); }
    catch (error) { result = { data: null, error }; }
    if (!result.error) {
      if (attempt > 1) console.info("live_activity_trip_read_recovered", { attempts: attempt });
      return result;
    }
    const info = diagnostic(result.error, result.status);
    const delay = 500 * attempt;
    const retry = info.retryable && attempt < MAX_ATTEMPTS && deadlineMs - Date.now() > delay;
    console.warn("live_activity_trip_read_failed", { ...info, attempt, retry,
      reason: transportReason(result.error, signal.aborted), elapsedMs: Date.now() - started, timeoutMs });
    if (!retry) return result;
    await wait(delay);
  }
  throw new Error("unreachable_trip_read_state");
}

export function tripReadFailure(error: unknown, status?: number) {
  const { code, status: http, category } = diagnostic(error, status);
  return new Error(`trips_query_failed:${code}:http_${http}:${category}`);
}
