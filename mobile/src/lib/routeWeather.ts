import type { WeatherSummary } from '../types';
export const ROUTE_WEATHER_TTL = 30 * 60_000;
export type RouteWeatherReading = { value: WeatherSummary; fetchedAt: number };
export function staleRouteWeather(reading: RouteWeatherReading | undefined, now = Date.now()) {
  return !reading || now < reading.fetchedAt || now - reading.fetchedAt >= ROUTE_WEATHER_TTL
    || new Date(now).toDateString() !== new Date(reading.fetchedAt).toDateString();
}
/** Cache only this app session, keyed by place and language. Reopening never hides an expired reading. */
export function createRouteWeatherStore(fetchWeather: (place: string, locale: 'tr' | 'en' | 'sq') => Promise<WeatherSummary>) {
  const cache = new Map<string, RouteWeatherReading>();
  const pending = new Map<string, Promise<RouteWeatherReading>>();
  const key = (place: string, locale: string) => JSON.stringify([place, locale]);
  return {
    peek: (place: string, locale: string) => cache.get(key(place, locale)),
    load(place: string, locale: 'tr' | 'en' | 'sq') {
      const id = key(place, locale);
      const running = pending.get(id);
      if (running) return running;
      const operation = Promise.resolve().then(() => fetchWeather(place, locale)).then(value => {
        const reading = { value, fetchedAt: Date.now() };
        cache.delete(id); cache.set(id, reading);
        if (cache.size > 20) cache.delete(cache.keys().next().value!);
        return reading;
      }).finally(() => pending.delete(id));
      pending.set(id, operation);
      return operation;
    },
  };
}
