// A small worker-local fallback supplements Next's shared data cache. These are
// public, coarse-area snapshots, never exact device locations. Their original
// source timestamps survive every hit and failed refresh.
export function createMapResultCache<T>(timestamp: (value: T) => string, clock = Date.now) {
  const entries = new Map<string, T>();
  const freshFor = 60 * 60 * 1000;
  const expiresAfter = 6 * freshFor;
  const age = (value: T) => clock() - Date.parse(timestamp(value));
  function usable(value: T, maxAge: number) {
    const elapsed = age(value);
    return Number.isFinite(elapsed) && elapsed >= -60_000 && elapsed <= maxAge;
  }
  return {
    read(key: string, freshOnly = false): T | null {
      const value = entries.get(key);
      if (!value) return null;
      if (!usable(value, expiresAfter)) { entries.delete(key); return null; }
      if (freshOnly && !usable(value, freshFor)) return null;
      return value;
    },
    remember(key: string, value: T): T {
      if (!usable(value, expiresAfter)) throw new Error('Expired map response');
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > 16) entries.delete(entries.keys().next().value!);
      return value;
    },
  };
}
