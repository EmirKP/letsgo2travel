export type TransitStop = { id: string; name: string };
export type TransitLeg = {
  summary: string;
  from: string;
  to: string;
  mode: string;
  minutes: number;
  departure: string;
  arrival: string;
  disruptions: string[];
};
export type TransitJourney = {
  minutes: number;
  departure: string;
  arrival: string;
  legs: TransitLeg[];
};
export type TransitResult = {
  fetchedAt: string;
  journeys: TransitJourney[];
  source: "TfL";
  timeZone: "Europe/London";
};
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const clean = (v: unknown, max = 300) =>
  typeof v === "string"
    ? v
        .replace(/<[^>]*>|[\u0000-\u001f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
export const validStopId = (v: unknown): v is string =>
  typeof v === "string" && /^(?:940[A-Z0-9]{5,16}|HUB[A-Z0-9]{2,12})$/.test(v);
const localTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v) &&
  Number.isFinite(Date.parse(`${v}Z`));
const minutes = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1440;
export function tubeStopsInHub(raw: unknown): TransitStop[] {
  const children = record(raw).children;
  if (!Array.isArray(children)) throw new Error("Invalid interchange");
  return normalizeStops({
    matches: children
      .filter((v) => {
        const s = record(v);
        return (
          typeof s.id === "string" &&
          s.id.startsWith("940G") &&
          Array.isArray(s.modes) &&
          s.modes.includes("tube")
        );
      })
      .map((v) => {
        const s = record(v);
        return { id: s.id, name: s.commonName };
      }),
  });
}
export function normalizeStops(raw: unknown): TransitStop[] {
  const matches = record(raw).matches;
  if (!Array.isArray(matches)) throw new Error("Invalid stops");
  const seen = new Set<string>();
  return matches
    .slice(0, 100)
    .flatMap((v) => {
      const s = record(v);
      if (!validStopId(s.id) || !clean(s.name) || seen.has(s.id)) return [];
      seen.add(s.id);
      return [{ id: s.id, name: clean(s.name, 160) }];
    })
    .slice(0, 16);
}
export function normalizeTransit(
  raw: unknown,
  now = new Date(),
): TransitResult {
  const items = record(raw).journeys;
  if (!Array.isArray(items)) throw new Error("Invalid journey");
  const journeys = items.slice(0, 3).flatMap((v) => {
    const j = record(v);
    if (
      !minutes(j.duration) ||
      !localTime(j.startDateTime) ||
      !localTime(j.arrivalDateTime) ||
      !Array.isArray(j.legs) ||
      j.legs.length === 0 ||
      j.legs.length > 25
    )
      return [];
    const legs: TransitLeg[] = [];
    for (const item of j.legs) {
      const l = record(item);
      const summary = clean(record(l.instruction).summary);
      const from = clean(record(l.departurePoint).commonName);
      const to = clean(record(l.arrivalPoint).commonName);
      if (
        !summary ||
        !from ||
        !to ||
        !minutes(l.duration) ||
        !localTime(l.departureTime) ||
        !localTime(l.arrivalTime)
      )
        return [];
      legs.push({
        summary,
        from,
        to,
        mode: clean(record(l.mode).id, 40),
        minutes: l.duration,
        departure: l.departureTime,
        arrival: l.arrivalTime,
        disruptions: Array.isArray(l.disruptions)
          ? l.disruptions
              .slice(0, 8)
              .map((d) => clean(record(d).description, 700))
              .filter(Boolean)
          : [],
      });
    }
    return [
      {
        minutes: j.duration,
        departure: j.startDateTime,
        arrival: j.arrivalDateTime,
        legs,
      },
    ];
  });
  if (items.length && !journeys.length) throw new Error("Incomplete journeys");
  return {
    journeys,
    fetchedAt: now.toISOString(),
    source: "TfL",
    timeZone: "Europe/London",
  };
}
export function validateTransit(raw: unknown): TransitResult | null {
  const r = record(raw);
  if (
    r.source !== "TfL" ||
    r.timeZone !== "Europe/London" ||
    typeof r.fetchedAt !== "string" ||
    !Number.isFinite(Date.parse(r.fetchedAt)) ||
    !Array.isArray(r.journeys) ||
    r.journeys.length > 3
  )
    return null;
  if (
    Date.now() - Date.parse(r.fetchedAt) > 300000 ||
    Date.parse(r.fetchedAt) > Date.now() + 60000
  )
    return null;
  for (const j of r.journeys) {
    const v = record(j);
    if (
      !minutes(v.minutes) ||
      !localTime(v.departure) ||
      !localTime(v.arrival) ||
      !Array.isArray(v.legs) ||
      !v.legs.length ||
      v.legs.length > 25
    )
      return null;
    for (const l of v.legs) {
      const x = record(l);
      if (
        !minutes(x.minutes) ||
        !localTime(x.departure) ||
        !localTime(x.arrival) ||
        ["summary", "from", "to", "mode"].some(
          (k) => typeof x[k] !== "string" || (x[k] as string).length > 300,
        ) ||
        !Array.isArray(x.disruptions) ||
        x.disruptions.length > 8 ||
        x.disruptions.some((d) => typeof d !== "string" || d.length > 700)
      )
        return null;
    }
  }
  return r as unknown as TransitResult;
}
