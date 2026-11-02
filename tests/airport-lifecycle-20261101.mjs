import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { generateAirportLifecycleData, parseAirportLifecycleCsv, verifyAirportLifecycleSnapshot } from '../scripts/airport-lifecycle-generation.mjs';

const json = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const provenance = json('scripts/airport-lifecycle-provenance.json');
const officialFixture = json('tests/fixtures/airport-lifecycle-source-20261101.json');
const officialRows = officialFixture.rows;
const dataset = json('lib/airports-dataset.json');
const generated = json('lib/airport-lifecycle-data.json');

// Real route/helper/search code, with Web Request/Response and a NextResponse
// transport adapter only. No network, provider, DB or user record is involved.
const cache = new Map();
function load(file) {
  const full = resolve(file);
  if (cache.has(full)) return cache.get(full);
  if (full.endsWith('.json')) { const value = json(full); cache.set(full, value); return value; }
  const loadedModule = { exports: {} };
  cache.set(full, loadedModule.exports);
  const source = ts.transpileModule(readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Intl, URL })(id => {
    if (id === 'next/server') return { NextResponse: { json: (value, init) => new Response(JSON.stringify(value), init) } };
    const path = id.startsWith('@/') ? resolve(id.slice(2)) : id.startsWith('.') ? resolve(dirname(full), id) : null;
    assert.ok(path, `Unexpected runtime dependency ${id}`);
    return load(/\.(?:ts|json)$/.test(path) ? path : `${path}.ts`);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const helper = load('lib/airport-lifecycle.ts');
const search = load('lib/airport-search.ts');
const zones = load('lib/airport-time-zones.ts');
const httpCache = load('lib/http-cache.ts');
const route = load('app/api/airports/route.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('Reviewed lifecycle runtime annotates only country-bound TXL and returns independent safe values', () => {
  const expected = { status: 'closed', checkedAt: '2026-11-01', sourceUrl: provenance.reviewedIdentities[0].sourceUrl };
  assert.deepEqual(plain(helper.airportLifecycle('TXL', 'DE')), expected);
  assert.deepEqual(plain(helper.airportLifecycle(' txl ', ' de ')), expected);
  assert.deepEqual(plain(helper.airportLifecycle('TXL')), expected);
  assert.deepEqual(plain(helper.airportLifecycle('TXL', '')), expected);
  assert.deepEqual(plain(helper.airportLifecycle('TXL', '  ')), expected);
  for (const [iata, country] of [['TXL', 'US'], ['TXL', 'FR'], ['TXL', 'D'], ['TXL', {}], ['TXL', 0], ['BER', 'DE'], ['BER', ''], ['KIV', 'MD'], ['RMO', 'MD'], ['ISL', 'TR'], ['__proto__', 'DE'], [null, 'DE'], ['TXL', null], [{ toString() { throw Error('Do not coerce input'); } }, 'DE']])
    assert.equal(helper.airportLifecycle(iata, country), null);
  const savedOrigin = { iata: 'TXL', countryCode: '' };
  assert.deepEqual(plain(helper.airportLifecycle(savedOrigin.iata, savedOrigin.countryCode)), expected);
  assert.equal(savedOrigin.countryCode, '', 'Exact reviewed lookup never fills or mutates a saved country field');
  const first = helper.airportLifecycle('TXL', 'DE'); first.status = 'unknown'; first.sourceUrl = 'https://untrusted.invalid';
  assert.deepEqual(plain(helper.airportLifecycle('TXL', 'DE')), expected);
});

test('Client-safe runtime imports only compact reviewed JSON, excluding source scripts, full catalog and QA outputs', () => {
  const source = readFileSync('lib/airport-lifecycle.ts', 'utf8');
  const imported = ts.preProcessFile(source).importedFiles.map(item => item.fileName);
  assert.deepEqual(imported, ['./airport-lifecycle-data.json']);
  assert.ok(statSync('lib/airport-lifecycle-data.json').size < 1024);
  assert.deepEqual(Object.keys(generated), ['TXL']);
  assert.doesNotMatch(source, /\bfetch\s*\(|node:|server-only|process\.env|outputs\//);
});

test('Pinned official source plus reviewed identity reproduces exactly one annotation without data overrides', () => {
  const before = JSON.stringify(dataset), sourceBefore = JSON.stringify(officialRows);
  assert.equal(officialFixture.sourceSha256, provenance.source.sha256);
  assert.deepEqual(generateAirportLifecycleData(officialRows, provenance, dataset), generated);
  assert.equal(provenance.reviewedIdentities.length, 1);
  assert.equal(provenance.reviewedIdentities[0].ourAirportsId, '2223');
  assert.equal(JSON.stringify(dataset), before); assert.equal(JSON.stringify(officialRows), sourceBefore);
  const otherClosed = { id: '9999999', ident: 'ZZ-0001', type: 'closed', iso_country: 'DE', iata_code: 'ZZZ', keywords: '' };
  assert.deepEqual(generateAirportLifecycleData([...officialRows, otherClosed], provenance, dataset), generated, 'Unreviewed world candidates never enter metadata');
});

test('Regeneration rejects active or unknown reused IATA ownership, regardless of country or scheduled service', () => {
  for (const type of ['small_airport', 'large_airport', 'unknown']) for (const iso_country of ['DE', 'US']) {
    const reassigned = { id: 'fictional-reused-owner', iata_code: 'TXL', iso_country, type, scheduled_service: 'no', keywords: '' };
    assert.throws(() => generateAirportLifecycleData([...officialRows, reassigned], provenance, dataset), /active or unknown IATA owner conflict/);
  }
});

test('Regeneration rejects stale/ambiguous identity, country, old code and catalog mismatch instead of guessing', () => {
  const target = officialRows.find(row => row.id === '2223');
  const changed = replacement => officialRows.map(row => row.id === '2223' ? { ...row, ...replacement } : row);
  for (const replacement of [{ iso_country: 'US' }, { keywords: 'TXL' }, { keywords: 'EDDT' }, { type: 'medium_airport' }, { type: 'unknown' }])
    assert.throws(() => generateAirportLifecycleData(changed(replacement), provenance, dataset), /identity mismatch|not explicitly closed/);
  assert.throws(() => generateAirportLifecycleData(officialRows.filter(row => row.id !== '2223'), provenance, dataset), /identity missing/);
  assert.throws(() => generateAirportLifecycleData([...officialRows, { ...target }], provenance, dataset), /identity missing or ambiguous/);
  assert.throws(() => generateAirportLifecycleData([...officialRows, { ...target, id: '999999' }], provenance, dataset), /former-code identity is ambiguous/);
  assert.throws(() => generateAirportLifecycleData(officialRows, provenance, dataset.map(row => row.iata === 'TXL' ? { ...row, name: 'Fictional new TXL airport' } : row)), /catalogue identity changed/);
});

test('Regeneration requires reviewed valid provenance and never treats no scheduled service as closure', () => {
  const change = patch => ({ ...provenance, reviewedIdentities: [{ ...provenance.reviewedIdentities[0], ...patch }] });
  for (const patch of [{ identityReview: { reviewed: false } }, { checkedAt: '2026-02-30' }, { sourceUrl: 'http://untrusted.invalid' }, { corroboratingSourceUrl: '' }])
    assert.throws(() => generateAirportLifecycleData(officialRows, change(patch), dataset), /Unreviewed or malformed/);
  const noSchedule = officialRows.map(row => row.id === '2223' ? { ...row, type: 'small_airport', scheduled_service: 'no' } : row);
  assert.throws(() => generateAirportLifecycleData(noSchedule, provenance, dataset), /not explicitly closed/);
  assert.throws(() => generateAirportLifecycleData(officialRows, { ...provenance, reviewedIdentities: [...provenance.reviewedIdentities, provenance.reviewedIdentities[0]] }, dataset), /Duplicate reviewed/);
});

test('Snapshot hash/length guard rejects changed bytes; quoted official CSV parsing preserves former-code identity', async () => {
  const bytes = Buffer.from('id,ident,type,iso_country,iata_code,keywords\n2223,DE-0876,closed,DE,,"TXL, EDDT, Otto Lilienthal"\n');
  const pin = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal(verifyAirportLifecycleSnapshot(bytes, pin), pin.sha256);
  assert.throws(() => verifyAirportLifecycleSnapshot(Buffer.from('wrong'), pin), /bytes\/hash mismatch/);
  assert.throws(() => verifyAirportLifecycleSnapshot(bytes, { ...pin, sha256: 'not-a-pin' }), /Invalid.*source pin/);
  const parsed = await parseAirportLifecycleCsv(bytes);
  assert.equal(parsed[0].keywords, 'TXL, EDDT, Otto Lilienthal');
  assert.deepEqual(generateAirportLifecycleData(parsed, provenance, dataset), generated);
});

test('Every7073 original catalog row and exact historical/provider identity stays byte-for-byte unchanged', () => {
  assert.equal(createHash('sha256').update(readFileSync('lib/airports-dataset.json')).digest('hex'), 'b37b817c03ebf2f13ce484a2ebcc64e9a6bb8be82aa0a640006dd64c0a971e50');
  assert.equal(search.airportCount(), 7073);
  assert.deepEqual(plain(search.searchAirports('Berlin')).map(row => row.iata), ['BER', 'TXL']);
  for (const code of ['TXL', 'KIV', 'RMO']) assert.deepEqual(plain(search.findAirportByIata(code)), dataset.find(row => row.iata === code));
  assert.equal(zones.airportTimeZone('KIV'), 'Europe/Chisinau'); assert.equal(zones.airportTimeZone('RMO'), 'Europe/Chisinau');
});

test('Actual airport GET only adds reviewed lifecycle, preserving array/order/legacy fields/cache semantics', async () => {
  for (const query of ['Berlin', 'TXL', 'KIV', 'RMO', 'ISL']) {
    const response = await route.GET(new Request(`https://fixture.invalid/api/airports?q=${encodeURIComponent(query)}`));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), httpCache.CACHE_TIMES.STATIC_REFERENCE);
    const rows = await response.json(), expected = plain(search.searchAirports(query, 12));
    assert.deepEqual(rows.map(row => row.iata), expected.map(row => row.iata));
    for (let i = 0; i < rows.length; i++) {
      const { lifecycle, ...legacy } = rows[i], airport = expected[i];
      assert.deepEqual(legacy, { iata: airport.iata, name: airport.name, city: airport.city, country: airport.country, countryCode: airport.countryCode,
        timeZone: zones.airportTimeZone(airport.iata) || null, id: airport.iata, code: airport.iata, type: 'city', countryName: airport.country });
      if (airport.iata === 'TXL') assert.deepEqual(lifecycle, plain(helper.airportLifecycle('TXL', 'DE')));
      else assert.equal(Object.hasOwn(rows[i], 'lifecycle'), false, 'No unknown/unscheduled/legacy code gains false closure metadata');
    }
  }
  const short = await route.GET(new Request('https://fixture.invalid/api/airports?q=B'));
  assert.deepEqual(await short.json(), []);
  assert.equal(short.headers.get('cache-control'), httpCache.CACHE_TIMES.STATIC_REFERENCE);
});
