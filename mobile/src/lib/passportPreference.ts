import { PASSPORTS, passportStatus, passportEntry } from "../../../lib/country-intelligence/passports";
import type { VisaStatus } from "../types";
import { translateCopy, type AppLocale } from './locale';

const COUNTRY_KEY = "l2t:passport-country";
const TYPE_KEY = "l2t:passport-type";
const PREFERENCE_KEY = "l2t:passport-preference.v1";
export const PASSPORT_CHANGE = "l2t:passport-change";
export const PASSPORT_TYPES = ["ordinary", "special", "service", "diplomatic"] as const;
export type PassportPreference = { country: string; type: string };
export function hasPassportPreference(value: PassportPreference) {
  return Object.hasOwn(PASSPORTS, value.country) && (PASSPORT_TYPES as readonly string[]).includes(value.type);
}
export function readPassportPreference() {
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    const value = raw === null
      ? { country: window.localStorage.getItem(COUNTRY_KEY), type: window.localStorage.getItem(TYPE_KEY) }
      : JSON.parse(raw);
    if (value && typeof value.country === 'string' && typeof value.type === 'string' && hasPassportPreference(value)) return { country: value.country, type: value.type };
  } catch { /* Missing or unreadable choices never imply a passport. */ }
  return { country: "", type: "" };
}
export function savePassportPreference(country: string, type: string) {
  if (!hasPassportPreference({ country, type }) && (country !== '' || type !== '')) return false;
  // One atomic write prevents a failed second write pairing a new country with an old type.
  try { window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ country, type })); }
  catch { return false; }
  window.dispatchEvent(new CustomEvent(PASSPORT_CHANGE));
  return true;
}
const LABELS: Record<VisaStatus, [string, string]> = {
  free: ["Vizesiz", "Visa-free"], id_card: ["Kimlikle", "ID card"], required: ["Vize gerekli", "Visa required"],
  evisa: ["e-Vize", "e-Visa"], on_arrival: ["Kapıda vize", "Visa on arrival"], unknown: ["Bilinmiyor", "Unknown"],
};
export function preferredEntry(preference: { country: string; type: string }, destination: string, locale: AppLocale, travelDate?: string) {
  const status = passportStatus(preference.country, preference.type, destination, travelDate);
  const entry = passportEntry(preference.country, preference.type, destination, travelDate);
  const upcoming = entry.upcoming ? translateCopy(locale, ' · 1 Kasım 2026’dan itibaren vize gerekli', ' · Visa required from 1 November 2026', ' · Vizë nga 1 nëntori 2026') : '';
  return { status, label: translateCopy(locale, ...LABELS[status]) + upcoming, visaFree: status === "free" || status === "id_card" };
}
