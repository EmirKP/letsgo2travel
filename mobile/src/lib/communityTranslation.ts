import { ApiError, requestJson } from "./api";
import type { AppLocale } from "./locale";

type Input = { text: string; title?: string; accessToken: string; locale: AppLocale };
export type CommunityTranslationResult = { status: "ready"; text: string; title?: string } | { status: "failed"; retryAt?: number; retryOnReconnect?: boolean };
type Listener = (result: CommunityTranslationResult) => void;
type Job = { key: string; input: Input; listeners: Set<Listener>; state: "queued" | "running" | "complete"; result?: CommunityTranslationResult; expires: number };
type Batch = { jobs: Job[]; controller: AbortController; generation: number };
type RequestBatch = (items: Array<{ id: string; text: string; title?: string }>, locale: AppLocale, token: string, signal: AbortSignal) => Promise<unknown>;
const MAX_CHARS = 8_000;

/** Visible text only. Memory is session-scoped, bounded, short-lived and never persisted. */
export function createCommunityTranslationQueue(request: RequestBatch, now = Date.now) {
  const jobs = new Map<string, Job>();
  const active = new Set<Batch>();
  let token: string | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cooldownUntil = 0;

  function reset(nextToken: string) {
    generation++; token = nextToken;
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const batch of active) batch.controller.abort();
    active.clear(); jobs.clear(); cooldownUntil = 0;
  }
  function prune() {
    for (const [key, job] of jobs) if (!job.listeners.size && job.state === "complete" && job.expires <= now()) jobs.delete(key);
    let chars = [...jobs.values()].reduce((sum, job) => sum + job.input.text.length + (job.input.title?.length || 0) + (job.result?.status === "ready" ? job.result.text.length + (job.result.title?.length || 0) : 0), 0);
    for (const [key, job] of jobs) {
      if (jobs.size < 160 && chars < 300_000) break;
      if (job.listeners.size || job.state !== "complete") continue;
      jobs.delete(key); chars -= job.input.text.length + (job.input.title?.length || 0) + (job.result?.status === "ready" ? job.result.text.length + (job.result.title?.length || 0) : 0);
    }
  }
  function finish(job: Job, result: CommunityTranslationResult) {
    job.state = "complete"; job.result = result; job.expires = now() + (result.status === "ready" ? 600_000 : 60_000);
    for (const listener of job.listeners) listener(result);
    // Mounted rows keep their own result. They must not pin completed cache
    // entries forever as more pages are appended to the discussion.
    job.listeners.clear();
  }
  function schedule() {
    if (timer || active.size >= 2 || ![...jobs.values()].some(job => job.state === "queued" && job.listeners.size)) return;
    // A short coalescing window lets adjacent cards enter one request. Quota
    // cooldown is shared by the whole queue, not independently by every row.
    timer = setTimeout(() => { timer = undefined; drain(); }, Math.max(160, cooldownUntil - now()));
  }
  function drain() {
    if (cooldownUntil > now()) { schedule(); return; }
    while (active.size < 2) {
      const first = [...jobs.values()].find(job => job.state === "queued" && job.listeners.size);
      if (!first) return;
      const selected: Job[] = []; let chars = 0;
      for (const job of jobs.values()) {
        if (job.state !== "queued" || !job.listeners.size || job.input.locale !== first.input.locale) continue;
        const size = job.input.text.length + (job.input.title?.length || 0);
        if (selected.length >= 6 || chars + size > MAX_CHARS) continue;
        selected.push(job); chars += size; job.state = "running";
      }
      const batch = { jobs: selected, controller: new AbortController(), generation };
      active.add(batch);
      const items = selected.map((job, index) => ({ id: String(index), text: job.input.text, ...(job.input.title ? { title: job.input.title } : {}) }));
      void request(items, first.input.locale, first.input.accessToken, batch.controller.signal).then(value => {
        if (batch.generation !== generation || batch.controller.signal.aborted) return;
        const data = value as { targetLanguage?: unknown; translations?: Array<{ id?: unknown; translation?: unknown; title?: unknown }> } | null;
        if (!data || data.targetLanguage !== first.input.locale || !Array.isArray(data.translations) || data.translations.length !== selected.length) throw new Error("invalid-translation");
        const results = selected.map((job, index) => {
          const matches = data.translations!.filter(row => row && row.id === String(index));
          const row = matches[0];
          const valid = (text: unknown): text is string => typeof text === "string" && Boolean(text.trim()) && text.length <= 16_000
            && [...text].every(character => character.charCodeAt(0) >= 32 || [9, 10, 13].includes(character.charCodeAt(0)));
          if (matches.length !== 1 || !valid(row.translation) || job.input.title !== undefined && !valid(row.title)) throw new Error("invalid-translation");
          return { status: "ready" as const, text: row.translation.trim(), ...(job.input.title !== undefined ? { title: (row.title as string).trim() } : {}) };
        });
        selected.forEach((job, index) => finish(job, results[index]));
      }).catch(error => {
        if (batch.generation !== generation || batch.controller.signal.aborted) return;
        const status = error instanceof ApiError ? error.status : 0;
        const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
        const suppliedDelay = error instanceof ApiError && error.payload && typeof error.payload === "object"
          ? (error.payload as { retryAfterSeconds?: unknown }).retryAfterSeconds : undefined;
        const quotaDelay = typeof suppliedDelay === "number" && Number.isFinite(suppliedDelay) && suppliedDelay >= 1 && suppliedDelay <= 86_400
          ? Math.ceil(suppliedDelay) * 1_000 : 60_000;
        const delay = status === 429 ? quotaDelay : 5_000;
        if (status === 429) cooldownUntil = Math.max(cooldownUntil, now() + delay);
        selected.forEach(job => finish(job, { status: "failed", ...(retryable ? { retryAt: now() + delay, retryOnReconnect: status === 0 } : {}) }));
      }).finally(() => {
        active.delete(batch); prune(); schedule();
      });
    }
  }
  return {
    subscribe(input: Input, listener: Listener, retry = false) {
      if (token !== input.accessToken) reset(input.accessToken);
      const normalized = { ...input, text: input.text.trim(), ...(input.title === undefined ? {} : { title: input.title.trim() }) };
      if (!normalized.text || normalized.text.length + (normalized.title?.length || 0) > MAX_CHARS) { listener({ status: "failed" }); return () => {}; }
      prune();
      const key = JSON.stringify([input.locale, normalized.title || "", normalized.text]);
      let job = jobs.get(key);
      if (job?.state === "complete" && (job.expires <= now() || retry && job.result?.status === "failed" && job.result.retryAt !== undefined)) { jobs.delete(key); job = undefined; }
      if (!job) {
        if (jobs.size >= 200) { listener({ status: "failed", retryAt: now() + 60_000 }); return () => {}; }
        job = { key, input: normalized, listeners: new Set(), state: "queued", expires: 0 }; jobs.set(key, job);
      }
      const current = job;
      if (current.result) listener(current.result);
      else { current.listeners.add(listener); schedule(); }
      return () => {
        current.listeners.delete(listener);
        if (!current.listeners.size && current.state === "queued" && jobs.get(key) === current) jobs.delete(key);
        // Once a bounded request has started, finish it into the session cache.
        // Scrolling away used to abort it after quota was already spent, then
        // start it again on return. Account reset still aborts/fences all work.
        schedule();
      };
    },
    clear: () => reset(""),
  };
}

export const communityTranslationQueue = createCommunityTranslationQueue((items, locale, accessToken, signal) => requestJson("/api/country-community/translate", {
  method: "POST", headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  body: { items, targetLanguage: locale }, signal, timeoutMs: 32_000,
}));
