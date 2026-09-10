import { useSyncExternalStore } from "react";
import { PASSPORT_CHANGE, readPassportPreference, savePassportPreference } from "../lib/passportPreference";
function subscribe(listener: () => void) {
  window.addEventListener(PASSPORT_CHANGE, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(PASSPORT_CHANGE, listener); window.removeEventListener("storage", listener); };
}
function snapshot() { const value = readPassportPreference(); return `${value.country}:${value.type}`; }
export function usePassportPreference() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "TR:ordinary");
  const [country, type] = value.split(":");
  return { country, type, setPreference: savePassportPreference };
}
