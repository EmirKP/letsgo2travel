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
export async function loadQuote(base: string, quote: string) {
  const raw = await requestJson<unknown>(`${config.travelAssistantApiBaseUrl}/api/travel-assistant/rates?${new URLSearchParams({base,quote})}`, { timeoutMs: 12000 });
  const value = validateQuote(raw, base, quote);
  if (!value) throw new Error('Invalid exchange rate');
  try { localStorage.setItem(FX_KEY, JSON.stringify([value, ...readQuotes().filter(q => q.base !== base || q.quote !== quote)].slice(0,32))); } catch { /* A full device must not hide an online quote. */ }
  return value;
}
export const directionsUrl = (destination: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
