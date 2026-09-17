import { requestJson } from './api';
import { config } from './config';
import { coarseLocation, coordinates } from '../../../lib/travel-assistant/places';
import type { Coordinates, FxQuote, MapMode, PlacesResult } from '../../../lib/travel-assistant/types';

export function locateForTravel(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unavailable')); return; }
    navigator.geolocation.getCurrentPosition(p => {
      const c = coordinates({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      if (c) resolve(coarseLocation(c)); else reject(new Error('unavailable'));
    }, error => reject(new Error(error.code === 1 ? 'denied' : 'unavailable')),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  });
}
export function loadPlaces(center: Coordinates, mode: MapMode) {
  return requestJson<PlacesResult>(`${config.travelAssistantApiBaseUrl}/api/travel-assistant/places`, { method: 'POST', body: { ...coarseLocation(center), mode }, timeoutMs: 20000 });
}
const FX_KEY = 'l2t:assistant:fx:v1';
function readQuotes(): FxQuote[] {
  try {
    const data = JSON.parse(localStorage.getItem(FX_KEY) || '[]');
    return Array.isArray(data) ? data.filter(q => q && Number.isFinite(q.rate) && q.rate > 0 && typeof q.base === 'string' && typeof q.quote === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.date)).slice(0,32) : [];
  } catch { return []; }
}
export function storedQuote(base: string, quote: string) {
  return readQuotes().find(q => q.base === base && q.quote === quote) || null;
}
export async function loadQuote(base: string, quote: string) {
  const value = await requestJson<FxQuote>(`${config.travelAssistantApiBaseUrl}/api/travel-assistant/rates?${new URLSearchParams({base,quote})}`, { timeoutMs: 12000 });
  try { localStorage.setItem(FX_KEY, JSON.stringify([value, ...readQuotes().filter(q => q.base !== base || q.quote !== quote)].slice(0,32))); } catch { /* A full device must not hide an online quote. */ }
  return value;
}
export const directionsUrl = (destination: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
