import { requestJson } from "./api";
import type { AppLocale } from "./locale";

type Input = { text: string; title?: string; accessToken: string; locale: AppLocale };
export type CommunityTranslationResult = { status: "ready"; text: string; title?: string } | { status: "failed" };
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

  function reset(nextToken: string) {
    generation++; token = nextToken;
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const batch of active) batch.controller.abort();
    active.clear(); jobs.clear();
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
  }
  function schedule() {
    if (timer || active.size >= 2) return;
    timer = setTimeout(() => { timer = undefined; drain(); }, 40);
  }
  function drain() {
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
      }).catch(() => {
        if (batch.generation !== generation || batch.controller.signal.aborted) return;
        selected.forEach(job => finish(job, { status: "failed" }));
      }).finally(() => {
        active.delete(batch); prune(); schedule();
      });
    }
  }
  return {
    subscribe(input: Input, listener: Listener) {
      if (token !== input.accessToken) reset(input.accessToken);
      const normalized = { ...input, text: input.text.trim(), ...(input.title === undefined ? {} : { title: input.title.trim() }) };
      if (!normalized.text || normalized.text.length + (normalized.title?.length || 0) > MAX_CHARS) { listener({ status: "failed" }); return () => {}; }
      prune();
      const key = JSON.stringify([input.locale, normalized.title || "", normalized.text]);
      let job = jobs.get(key);
      if (job?.state === "complete" && job.expires <= now()) { jobs.delete(key); job = undefined; }
      if (!job) {
        if (jobs.size >= 200) { listener({ status: "failed" }); return () => {}; }
        job = { key, input: normalized, listeners: new Set(), state: "queued", expires: 0 }; jobs.set(key, job);
      }
      const current = job;
      current.listeners.add(listener);
      if (current.result) listener(current.result); else schedule();
      return () => {
        current.listeners.delete(listener);
        if (!current.listeners.size && current.state === "queued" && jobs.get(key) === current) jobs.delete(key);
        for (const batch of active) if (batch.jobs.every(item => !item.listeners.size)) {
          batch.controller.abort(); active.delete(batch);
          batch.jobs.forEach(item => { if (jobs.get(item.key) === item) jobs.delete(item.key); });
        }
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
