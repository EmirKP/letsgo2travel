import zones from "./airport-time-zone-data.json";
import { validTimeZone } from "./zoned-time";

export function airportTimeZone(iata: string, explicit?: string | null): string {
  if (validTimeZone(explicit)) return explicit;
  const value = (zones as Record<string, string>)[String(iata || "").toUpperCase()];
  return validTimeZone(value) ? value : "";
}
