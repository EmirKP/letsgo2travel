// Reproduce only reviewed annotations from a pinned official snapshot.
// node --use-system-ca scripts/airport-lifecycle-generation.mjs --check
// --write updates lib/airport-lifecycle-data.json; no catalogue is rewritten.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const csv = require("csv-parser"); // Existing airports-json dependency; no new package.
const root = new URL("../", import.meta.url);
const normalize = value => String(value || "").trim().toUpperCase();
const tokens = row => String(row.keywords || "").split(",").map(normalize);
const closed = row => ["closed", "closed_airport"].includes(String(row.type || "").toLowerCase());
const readJson = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));

export function verifyAirportLifecycleSnapshot(bytes, source) {
  if (!/^[a-f0-9]{64}$/.test(source?.sha256 || "") || !Number.isSafeInteger(source?.bytes) || source.bytes < 1)
    throw Error("Invalid airport lifecycle source pin");
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== source.bytes || actual !== source.sha256)
    throw Error("Airport lifecycle source bytes/hash mismatch");
  return actual;
}

function httpsSource(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash; }
  catch { return false; }
}

/** Pure generation core, also used by isolated identity/conflict fixtures. */
export function generateAirportLifecycleData(rows, provenance, catalog) {
  if (provenance?.schemaVersion !== 1 || !Array.isArray(provenance.reviewedIdentities)) throw Error("Invalid lifecycle provenance");
  const data = {};
  for (const identity of provenance.reviewedIdentities) {
    const { iata, countryCode, ourAirportsId, historicalIcao, checkedAt, sourceUrl } = identity;
    const date = new Date(`${checkedAt}T00:00:00Z`);
    if (!/^[A-Z]{3}$/.test(iata || "") || !/^[A-Z]{2}$/.test(countryCode || "")
      || !/^\d+$/.test(ourAirportsId || "") || !/^[A-Z]{4}$/.test(historicalIcao || "")
      || !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt || "") || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== checkedAt
      || identity.identityReview?.reviewed !== true || !httpsSource(sourceUrl) || !httpsSource(identity.corroboratingSourceUrl))
      throw Error("Unreviewed or malformed airport lifecycle identity");
    if (Object.hasOwn(data, iata)) throw Error("Duplicate reviewed airport lifecycle code");
    const old = catalog.filter(row => row.iata === iata);
    if (old.length !== 1 || old[0].countryCode !== countryCode || old[0].name !== identity.catalogName)
      throw Error("Reviewed airport lifecycle catalogue identity changed");
    // Even an uncertain/non-closed current code owner forbids publishing the
    // old closure label: IATA reuse must be resolved, never silently hidden.
    if (rows.some(row => normalize(row.iata_code) === iata && !closed(row)))
      throw Error("Airport lifecycle current active or unknown IATA owner conflict");
    const matches = rows.filter(row => String(row.id) === ourAirportsId);
    if (matches.length !== 1) throw Error("Airport lifecycle persistent identity missing or ambiguous");
    const source = matches[0];
    const icaoMatches = [source.icao_code, source.gps_code, source.ident, ...tokens(source)].some(value => normalize(value) === historicalIcao);
    if (normalize(source.iso_country) !== countryCode || !icaoMatches
      || !(normalize(source.iata_code) === iata || tokens(source).includes(iata)))
      throw Error("Airport lifecycle country/ICAO/former-IATA identity mismatch");
    const conflictingIdentity = rows.some(row => String(row.id) !== ourAirportsId && normalize(row.iso_country) === countryCode
      && (normalize(row.iata_code) === iata || closed(row) && tokens(row).includes(iata)));
    if (conflictingIdentity) throw Error("Airport lifecycle former-code identity is ambiguous");
    if (!closed(source)) throw Error("Reviewed airport source is not explicitly closed");
    data[iata] = { countryCode, status: "closed", checkedAt, sourceUrl };
  }
  return data;
}

export async function parseAirportLifecycleCsv(bytes) {
  const rows = [];
  await new Promise((done, fail) => {
    Readable.from([bytes]).pipe(csv()).on("data", row => rows.push(row)).on("end", done).on("error", fail);
  });
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--check", "--write"].includes(args[0])) throw Error("Use --check or --write");
  const provenance = readJson(new URL("scripts/airport-lifecycle-provenance.json", root));
  const source = provenance.source;
  const expectedUrl = `https://raw.githubusercontent.com/davidmegginson/ourairports-data/${source.commit}/airports.csv`;
  if (!/^[a-f0-9]{40}$/.test(source.commit || "") || source.url !== expectedUrl) throw Error("Invalid immutable official airport source URL");
  const response = await fetch(source.url, { signal: AbortSignal.timeout(40000) });
  if (!response.ok) throw Error(`Official airport lifecycle source HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  verifyAirportLifecycleSnapshot(bytes, source);
  const rows = await parseAirportLifecycleCsv(bytes);
  const catalog = readJson(new URL("lib/airports-dataset.json", root));
  const data = generateAirportLifecycleData(rows, provenance, catalog);
  const output = new URL("lib/airport-lifecycle-data.json", root);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (args[0] === "--write") writeFileSync(output, serialized);
  else if (readFileSync(output, "utf8") !== serialized) throw Error("Generated airport lifecycle annotation differs from checked-in data");
  console.log(`${args[0] === "--write" ? "Generated" : "Verified"} ${Object.keys(data).length} reviewed airport annotation; ${catalog.length} catalogue rows unchanged.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
