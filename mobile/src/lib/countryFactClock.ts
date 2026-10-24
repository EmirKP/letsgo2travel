export type CountryFactClockTime = { hour: number; minute: number };

/** Clockwise angles from twelve; hours include the minute's progress. */
export function countryFactClockHands(clock: CountryFactClockTime | undefined) {
  if (!clock || !Number.isInteger(clock.hour) || clock.hour < 0 || clock.hour > 23
    || !Number.isInteger(clock.minute) || clock.minute < 0 || clock.minute > 59) return null;
  return { hour: clock.hour % 12 * 30 + clock.minute / 2, minute: clock.minute * 6 };
}

/** Machine clock parts for a known zone; no fallback to the device or a country guess. */
export function countryFactClockTime(timeZone: string, now = Date.now()): CountryFactClockTime | null {
  if (!timeZone.trim() || !Number.isFinite(now)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn" }).formatToParts(new Date(now));
    const hour = Number(parts.find(part => part.type === "hour")?.value), minute = Number(parts.find(part => part.type === "minute")?.value);
    const clock = { hour, minute };
    return countryFactClockHands(clock) ? clock : null;
  } catch { return null; }
}
