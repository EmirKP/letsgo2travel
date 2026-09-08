import { useCallback, useEffect, useState } from "react";
import { requestJson } from "./api";
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
