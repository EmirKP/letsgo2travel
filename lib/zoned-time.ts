// Convert a wall-clock time without ever consulting the device time zone.
// Reject DST gaps and overlaps: silently guessing either can shift a flight.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", { timeZone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, value);
  }
  return value;
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try { formatter(value); return true; } catch { return false; }
}

export function zonedParts(instant: Date | number, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === name)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

export type ZonedTimeResult = { ok: true; iso: string } | { ok: false; reason: "timezone" | "invalid" | "nonexistent" | "ambiguous"; candidates?: string[] };
export function wallTimeToUtc(date: string, time: string, timeZone: string): ZonedTimeResult {
  if (!validTimeZone(timeZone)) return { ok: false, reason: "timezone" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, reason: "invalid" };
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return { ok: false, reason: "invalid" };
  const offsets = new Set<number>();
  // Sample both sides of local transitions, including half-hour changes and
  // international-date-line offsets. Intl supplies the actual IANA rules.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const local = zonedParts(sample, timeZone);
    offsets.add(Date.parse(`${local.date}T${local.time}Z`) - sample);
  }
  const matches = [...offsets].map(offset => wall - offset).filter(candidate => {
    const local = zonedParts(candidate, timeZone);
    return local.date === date && local.time === `${time}:00`;
  });
  if (matches.length !== 1) return { ok: false, reason: matches.length ? "ambiguous" : "nonexistent", candidates: matches.sort((a, b) => a - b).map(value => new Date(value).toISOString()) };
  return { ok: true, iso: new Date(matches[0]).toISOString() };
}
