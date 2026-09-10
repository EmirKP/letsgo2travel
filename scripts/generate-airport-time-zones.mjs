// Usage: node scripts/generate-airport-time-zones.mjs /path/to/airports.json
// Source: https://github.com/mwgg/Airports (MIT; license stored next to output).
// A frozen source hash prevents unreviewed upstream changes in release builds.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const bytes = readFileSync(process.argv[2]);
if (createHash("sha256").update(bytes).digest("hex") !== "f369eaa1c2944280d9678a96d5b477cedea0417f3c12a333c39834bf1c035739") throw new Error("Review the source snapshot before updating its hash.");
const source = JSON.parse(bytes);
const airports = JSON.parse(readFileSync(new URL("../lib/airports-dataset.json", import.meta.url)));
const zones = new Map();
for (const airport of Object.values(source)) {
  if (!airport.iata || !airport.tz) continue;
  try { new Intl.DateTimeFormat("en", { timeZone: airport.tz }); } catch { continue; }
  const found = zones.get(airport.iata) || new Set();
  found.add(airport.tz); zones.set(airport.iata, found);
}
const output = Object.fromEntries(airports.flatMap(airport => {
  const matches = zones.get(airport.iata);
  return matches?.size === 1 ? [[airport.iata, [...matches][0]]] : [];
}));
writeFileSync(new URL("../lib/airport-time-zone-data.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
console.log(`${Object.keys(output).length}/${airports.length} airports have an unambiguous time zone.`);
