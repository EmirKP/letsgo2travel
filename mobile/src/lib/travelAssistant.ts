import { requestJson } from './api';
import { config } from './config';
import { coarseLocation, coordinates } from '../../../lib/travel-assistant/places';
import type { Coordinates, FxQuote } from '../../../lib/travel-assistant/types';
import { createPlacesLoader, validateQuote } from '../../../lib/travel-assistant/responses';

export function locateForTravel(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unavailable')); return; }
    const timer = setTimeout(() => reject(new Error('unavailable')), 14000);
    navigator.geolocation.getCurrentPosition(p => {
      clearTimeout(timer);
      const c = coordinates({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      if (c) resolve(coarseLocation(c)); else reject(new Error('unavailable'));
    }, error => { clearTimeout(timer); reject(new Error(error.code === 1 ? 'denied' : 'unavailable')); },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  });
}
export const loadPlaces = createPlacesLoader((center, mode) =>
  requestJson<unknown>(`${config.travelAssistantApiBaseUrl}/api/travel-assistant/places`, { method: 'POST', body: { ...center, mode }, timeoutMs: 20000 }));
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
