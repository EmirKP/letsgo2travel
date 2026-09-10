import { PASSPORTS, passportStatus } from "../../../lib/country-intelligence/passports";
import type { VisaStatus } from "../types";

const COUNTRY_KEY = "l2t:passport-country";
const TYPE_KEY = "l2t:passport-type";
export const PASSPORT_CHANGE = "l2t:passport-change";
export const PASSPORT_TYPES = ["ordinary", "special", "service", "diplomatic"] as const;
export function readPassportPreference() {
  try {
    const country = window.localStorage.getItem(COUNTRY_KEY) || "TR";
    const type = window.localStorage.getItem(TYPE_KEY) || "ordinary";
    return { country: Object.hasOwn(PASSPORTS, country) ? country : "TR", type: (PASSPORT_TYPES as readonly string[]).includes(type) ? type : "ordinary" };
  } catch { return { country: "TR", type: "ordinary" }; }
}
export function savePassportPreference(country: string, type: string) {
  if (!Object.hasOwn(PASSPORTS, country) || !(PASSPORT_TYPES as readonly string[]).includes(type)) return;
  window.localStorage.setItem(COUNTRY_KEY, country);
  window.localStorage.setItem(TYPE_KEY, type);
  window.dispatchEvent(new CustomEvent(PASSPORT_CHANGE));
}
const LABELS: Record<VisaStatus, [string, string]> = {
  free: ["Vizesiz", "Visa-free"], id_card: ["Kimlikle", "ID card"], required: ["Vize gerekli", "Visa required"],
  evisa: ["e-Vize", "e-Visa"], on_arrival: ["Kapıda vize", "Visa on arrival"], unknown: ["Bilinmiyor", "Unknown"],
};
export function preferredEntry(preference: { country: string; type: string }, destination: string, locale: "tr" | "en") {
  const status = passportStatus(preference.country, preference.type, destination);
  return { status, label: LABELS[status][locale === "en" ? 1 : 0], visaFree: status === "free" || status === "id_card" };
}
