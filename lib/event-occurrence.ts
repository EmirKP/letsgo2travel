type EventOccurrence = {
  id?: unknown;
  provider?: unknown;
  title?: unknown;
  countryCode?: unknown;
  city?: unknown;
  venue?: unknown;
  startsAt?: unknown;
  timePrecision?: unknown;
};

const knownProviders = new Set(["curated", "ticketmaster", "predicthq"]);
const normalized = (value: unknown) => typeof value === "string" ? value
  .toLocaleLowerCase("en").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim() : "";

function exactInstant(event: EventOccurrence): number | null {
  if (event.timePrecision !== "exact" || typeof event.startsAt !== "string") return null;
  const parts = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(event.startsAt);
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59
    || parts[8] !== undefined && (Number(parts[8]) > 23 || Number(parts[9]) > 59)) return null;
  const day = Date.parse(`${parts[1]}T00:00:00Z`);
  const instant = Date.parse(event.startsAt);
  // Date.parse alone normalizes invalid dates such as February30. Ambiguous or
  // incomplete source clocks must never erase another known occurrence.
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== parts[1] || !Number.isFinite(instant)) return null;
  return instant;
}

function canonicalId(event: EventOccurrence) {
  return typeof event.id === "string" && event.id.trim() ? event.id : null;
}

function occurrenceKey(event: EventOccurrence) {
  if (!canonicalId(event) || typeof event.provider !== "string" || !knownProviders.has(event.provider)) return null;
  const start = exactInstant(event);
  const place = (["title", "countryCode", "city", "venue"] as const).map(field => normalized(event[field]));
  return start === null || place.some(value => !value) ? null : JSON.stringify([start, ...place]);
}

/** Conservative reference comparison only; never changes IDs or event data. */
export function sameEventOccurrence(left: EventOccurrence | null | undefined, right: EventOccurrence | null | undefined): boolean {
  if (!left || !right) return false;
  const leftId = canonicalId(left), rightId = canonicalId(right);
  if (leftId && leftId === rightId) return true;
  if (left.provider === right.provider) return false;
  const key = occurrenceKey(left);
  return key !== null && key === occurrenceKey(right);
}

/** Already returned page identities remain distinct; no cross-page aliases. */
export function uniqueCanonicalEventIds<T extends EventOccurrence>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  return events.filter(event => {
    const id = canonicalId(event);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
}

/** Finite co-fetched sources only. Conflicting source IDs make a key ambiguous. */
export function uniqueServiceEventOccurrences<T extends EventOccurrence>(events: readonly T[]): T[] {
  const prepared = uniqueCanonicalEventIds(events).map(event => ({ event, key: occurrenceKey(event) }));
  const providers = new Map<string, Set<unknown>>(), ambiguous = new Set<string>();
  for (const { event, key } of prepared) {
    if (key === null) continue;
    const sources = providers.get(key) || new Set<unknown>();
    if (sources.has(event.provider)) ambiguous.add(key);
    sources.add(event.provider); providers.set(key, sources);
  }
  const seen = new Set<string>();
  return prepared.filter(({ key }) => {
    if (key === null || ambiguous.has(key)) return true;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(({ event }) => event);
}
