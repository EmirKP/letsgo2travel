import { requestJson } from './api';
import { config } from './config';
import { coarseLocation, coordinates } from '../../../lib/travel-assistant/places';
import type { Coordinates, FxQuote } from '../../../lib/travel-assistant/types';
import { createPlacesLoader, validateQuote } from '../../../lib/travel-assistant/responses';

let locationRequest: Promise<Coordinates> | null = null;
let lastLocation: { center: Coordinates; until: number } | null = null;
let deniedUntil = 0;
export function locateForTravel(): Promise<Coordinates> {
  if (lastLocation && lastLocation.until > Date.now()) return Promise.resolve(lastLocation.center);
  if (deniedUntil > Date.now()) return Promise.reject(new Error('denied'));
  if (locationRequest) return locationRequest;
  locationRequest = new Promise<Coordinates>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new Error('unavailable')); return; }
    let settled = false;
    const fail = (denied = false) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (denied) deniedUntil = Date.now()+60_000;
      reject(new Error(denied ? 'denied' : 'unavailable'));
    };
    const timer = setTimeout(() => fail(), 14000);
    try {
      navigator.geolocation.getCurrentPosition(p => {
        // WebViews can deliver a late success after timeout; never let that
        // abandoned request overwrite a newer result or populate the cache.
        if (settled) return;
        const c = coordinates({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        if (!c) { fail(); return; }
        settled = true; clearTimeout(timer);
        const center = coarseLocation(c); lastLocation = { center, until: Date.now()+60_000 }; resolve(center);
      }, error => fail(error.code === 1), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
    } catch { fail(); }
  }).finally(() => { locationRequest = null; });
  return locationRequest;
}
export const loadPlaces = createPlacesLoader((center, mode) =>
  requestJson<unknown>(`${config.travelAssistantApiBaseUrl}/api/travel-assistant/places`, { method: 'POST', body: { ...center, mode }, timeoutMs: 32000 }));
const FX_KEY = 'l2t:assistant:fx:v1';
function readQuotes(): FxQuote[] {
  try {
    const data = JSON.parse(localStorage.getItem(FX_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    return data.slice(0,32).flatMap(q => {
      const value = validateQuote(q, q?.base, q?.quote);
      return value ? [value] : [];
    });
  } catch { return []; }
}
export function storedQuote(base: string, quote: string) {
  return readQuotes().find(q => q.base === base && q.quote === quote) || null;
}
const quoteRequests = new Map<string, Promise<FxQuote>>();
export function loadQuote(base: string, quote: string): Promise<FxQuote> {
  const pair = `${base}:${quote}`;
  const running = quoteRequests.get(pair);
  if (running) return running;
  const operation = (async () => {
    const path = `/api/travel-assistant/rates?${new URLSearchParams({base,quote})}`;
    // Public FX also exists on the main API. An unavailable optional assistant
    // host must not break every budget calculation in the app.
    const hosts = config.travelAssistantApiBaseUrl && config.travelAssistantApiBaseUrl !== config.apiBaseUrl
      ? [config.travelAssistantApiBaseUrl, ''] : [''];
    let failure: unknown;
    for (const host of hosts) {
      try {
        const raw = await requestJson<unknown>(`${host}${path}`, { timeoutMs: 8000 });
        const value = validateQuote(raw, base, quote);
        if (!value || Date.now() - Date.parse(value.date) > 7 * 86400000) throw new Error('Invalid or stale exchange rate');
        try { localStorage.setItem(FX_KEY, JSON.stringify([value, ...readQuotes().filter(q => q.base !== base || q.quote !== quote)].slice(0,32))); } catch { /* A full device must not hide an online quote. */ }
        return value;
      } catch (error) { failure = error; }
    }
    throw failure;
  })();
  quoteRequests.set(pair, operation);
  void operation.finally(() => { if (quoteRequests.get(pair) === operation) quoteRequests.delete(pair); }).catch(() => {});
  return operation;
}
export const directionsUrl = (destination: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
