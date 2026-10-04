import type { TransitJourney, TransitLeg, TransitResult, TransitStop } from "./transit";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const clean = (value: unknown, max = 300) => typeof value === "string" ? value.replace(/<[^>]*>|[\u0000-\u001f]/g, " ").trim().slice(0, max) : "";
export const validEnturStop = (value: unknown): value is string => typeof value === "string" && /^NSR:StopPlace:[1-9]\d{0,11}$/.test(value);

export function normalizeEnturStops(raw: unknown): TransitStop[] {
  const rows = record(raw).features;
  if (!Array.isArray(rows)) throw new Error("Invalid Entur stations");
  const seen = new Set<string>();
  return rows.slice(0, 100).flatMap(value => {
    const item = record(record(value).properties), names = record(item.names), address = record(item.address);
    if (item.layer !== "stopPlace" || !validEnturStop(item.id) || address.countryCode !== "no" || seen.has(item.id)) return [];
    const name = clean(names.display || names.default, 160);
    if (!name) return [];
    seen.add(item.id);
    return [{ id: item.id, name }];
  }).slice(0, 16);
}
const seconds = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 86400;
function osloTime(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid Entur timestamp");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function normalizeEnturTransit(raw: unknown, now = new Date()): TransitResult {
  const envelope = record(raw), rows = record(record(envelope.data).trip).tripPatterns;
  if (envelope.errors || !Array.isArray(rows)) throw new Error("Invalid Entur journeys");
  const journeys: TransitJourney[] = [];
  for (const value of rows.slice(0, 3)) {
    const item = record(value);
    if (!seconds(item.duration) || !Array.isArray(item.legs) || !item.legs.length || item.legs.length > 25) throw new Error("Incomplete Entur journey");
    const departure = osloTime(item.expectedStartTime), arrival = osloTime(item.expectedEndTime);
    if (Date.parse(String(item.expectedEndTime)) < Date.parse(String(item.expectedStartTime))) throw new Error("Invalid Entur chronology");
    const legs: TransitLeg[] = item.legs.map(value => {
      const leg = record(value), line = record(leg.line), mode = clean(leg.mode, 40);
      const from = clean(record(leg.fromPlace).name), to = clean(record(leg.toPlace).name);
      if (!seconds(leg.duration) || !mode || !from || !to || !Array.isArray(leg.situations)) throw new Error("Incomplete Entur leg");
      const departure = osloTime(leg.expectedStartTime), arrival = osloTime(leg.expectedEndTime);
      if (Date.parse(String(leg.expectedEndTime)) < Date.parse(String(leg.expectedStartTime))) throw new Error("Invalid Entur leg chronology");
      const disruptions = leg.situations.slice(0, 8).flatMap(value => {
        const summary = record(value).summary;
        if (!Array.isArray(summary)) return [];
        const items = summary.map(record);
        const selected = items.find(item => item.language === "en") || items[0];
        const text = clean(selected?.value, 700);
        return text ? [text] : [];
      });
      return { summary: [...new Set([clean(line.publicCode, 40), clean(line.name, 220)].filter(Boolean))].join(" · ") || mode,
        from, to, mode, minutes: Math.ceil(leg.duration / 60), departure, arrival, disruptions };
    });
    journeys.push({ minutes: Math.ceil(item.duration / 60), departure, arrival, legs });
  }
  return { journeys, fetchedAt: now.toISOString(), source: "Entur", timeZone: "Europe/Oslo" };
}
