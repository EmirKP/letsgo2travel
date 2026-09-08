import { useCallback, useEffect, useState } from "react";
import { requestJson } from "./api";
import type { Advisory } from "../../../lib/country-intelligence/types";
export type { Advisory, CountryBrief, CostData, InflationData, NewsItem, Rate } from "../../../lib/country-intelligence/types";

const cache = new Map<string, { value: unknown; until: number }>();
const pending = new Map<string, Promise<unknown>>();
export function loadCountryData<T>(path: string, refresh = false): Promise<T> {
  const saved = cache.get(path);
  if (!refresh && saved && saved.until > Date.now()) return Promise.resolve(saved.value as T);
  const running = pending.get(path);
  if (running) return running as Promise<T>;
  const promise = requestJson<T>(path, { timeoutMs: 25_000 }).then(value => {
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(path, { value, until: Date.now() + 120_000 });
    return value;
  }).finally(() => pending.delete(path));
  pending.set(path, promise);
  return promise;
}

export function useCountryData<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; loading: boolean; error: boolean }>({ path: null, data: null, loading: false, error: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    let current = true;
    setState({ path, data: null, loading: true, error: false });
    loadCountryData<T>(path, revision > 0).then(data => {
      if (current) setState({ path, data, loading: false, error: false });
    }).catch(() => {
      if (current) setState({ path, data: null, loading: false, error: true });
    });
    return () => { current = false; };
  }, [path, revision]);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  // Never show a previous country's advice during a fast picker change.
  return { data: path === state.path ? state.data : null, loading: !!path && (state.path !== path || state.loading), error: path === state.path && state.error, retry };
}

// Bound concurrency without truncating visible countries. Each batch stays
// within the API's eight-country limit; old picker results never leak through.
export function useAdvisories(codes: string[]) {
  const key = [...new Set(codes.filter(code => /^[A-Z]{2}$/.test(code)))].sort().join(",");
  const [state, setState] = useState<{ key: string; rows: Advisory[] }>({ key: "", rows: [] });
  useEffect(() => {
    let current = true;
    const values = key ? key.split(",") : [];
    const batches: string[][] = [];
    for (let i = 0; i < values.length; i += 8) batches.push(values.slice(i, i + 8));
    setState({ key, rows: [] });
    const run = async () => {
      while (current && batches.length) {
        const batch = batches.shift()!;
        try {
          const data = await loadCountryData<{ data: Advisory[] }>(`/api/country-advisories?countries=${batch.join(",")}`);
          if (current) setState(prev => ({ key, rows: [...prev.rows, ...data.data] }));
        } catch { /* Missing advice is labelled unverified by the badge. */ }
      }
    };
    void Promise.all([run(), run()]);
    return () => { current = false; };
  }, [key]);
  return state.key === key ? state.rows : [];
}
