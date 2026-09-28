import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const moduleUrl = new URL('../mobile/src/data/communityDiscovery.ts', import.meta.url);
const iso = JSON.parse(readFileSync(new URL('../mobile/src/data/iso3166.json', import.meta.url), 'utf8'));
const source = ts.transpileModule(readFileSync(moduleUrl, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const loadedAssets = [];
const output = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {})(name => {
  if (name === './countries') return { ISO_3166: iso };
  if (/\.(webp|jpg)$/.test(name)) {
    const url = new URL(name, moduleUrl);
    assert.ok(existsSync(url), `Artwork must be present in the repository: ${name}`);
    loadedAssets.push(url.href);
    return url.href;
  }
  throw new Error(`Unexpected dependency: ${name}`);
}, output, output.exports);
const { communityRegions, communityRegionForCountry, matchesCommunityRegion } = output.exports;
const regionIds = ['all', 'turkey', 'europe', 'asia', 'americas', 'middle-east', 'africa', 'oceania'];
const plain = value => JSON.parse(JSON.stringify(value));

test('Eight region chips keep stable order and independent Turkish/English labels', () => {
  const tr = communityRegions();
  const en = communityRegions('en');
  assert.deepEqual(plain(tr.map(item => item.id)), regionIds);
  assert.deepEqual(plain(en.map(item => item.id)), regionIds);
  assert.deepEqual(plain(tr.map(item => item.label)), ['Tümü', 'Türkiye', 'Avrupa', 'Asya', 'Amerika', 'Orta Doğu', 'Afrika', 'Okyanusya']);
  assert.deepEqual(plain(en.map(item => item.label)), ['All', 'Turkey', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa', 'Oceania']);
  tr[1].label = 'Mutated screen state';
  assert.equal(communityRegions()[1].label, 'Türkiye');
});

test('Turkey and Middle East override broad Asia without duplicate matches', () => {
  assert.equal(communityRegionForCountry(' tr '), 'turkey');
  assert.equal(matchesCommunityRegion('TR', 'asia'), false);
  assert.equal(matchesCommunityRegion('TR', 'europe'), false);
  assert.equal(matchesCommunityRegion('TR', 'middle-east'), false);
  for (const code of ['AE', 'BH', 'IL', 'IQ', 'IR', 'JO', 'KW', 'LB', 'OM', 'PS', 'QA', 'SA', 'SY', 'YE']) {
    assert.equal(matchesCommunityRegion(code, 'middle-east'), true, code);
    assert.equal(matchesCommunityRegion(code, 'asia'), false, code);
  }
});

test('Geographic boundaries and overseas territories do not follow political parent shortcuts', () => {
  for (const [code, region] of Object.entries({
    FR: 'europe', RU: 'europe', XK: 'europe', GB: 'europe',
    JP: 'asia', TW: 'asia', HK: 'asia', CY: 'asia', AM: 'asia', AZ: 'asia', GE: 'asia', KZ: 'asia',
    US: 'americas', CA: 'americas', MX: 'americas', BR: 'americas', AR: 'americas',
    GL: 'americas', GF: 'americas', PR: 'americas', CW: 'americas',
    EG: 'africa', ZA: 'africa', MA: 'africa', RE: 'africa', YT: 'africa',
    AU: 'oceania', NZ: 'oceania', FJ: 'oceania', PF: 'oceania', GU: 'oceania', NC: 'oceania',
  })) assert.equal(communityRegionForCountry(code.toLowerCase()), region, code);
  assert.equal(matchesCommunityRegion('EG', 'middle-east'), false);
});

test('Every existing ISO country/territory has exactly one geographic chip except Antarctica', () => {
  for (const { alpha2 } of iso) {
    const matches = regionIds.slice(1).filter(region => matchesCommunityRegion(alpha2, region));
    assert.equal(matches.length, alpha2 === 'AQ' ? 0 : 1, `${alpha2}: ${matches.join(', ')}`);
    assert.equal(matchesCommunityRegion(alpha2, 'all'), true);
  }
});

test('Unknown, malformed and absent codes are visible only in All', () => {
  for (const code of ['', 'ZZ', 'UK', 'USA', 'TUR', 'Türkiye', '__proto__', null, undefined, 42, {}]) {
    assert.equal(communityRegionForCountry(code), null);
    assert.equal(matchesCommunityRegion(code, 'all'), true);
    assert.ok(regionIds.slice(1).every(region => !matchesCommunityRegion(code, region)), String(code));
  }
  assert.equal(matchesCommunityRegion('FR', 'invalid-region'), false);
});

test('Region artwork is bundled with labels identifying its represented destination', () => {
  const chips = communityRegions('en');
  for (const chip of chips.filter(item => item.image)) assert.ok(loadedAssets.includes(chip.image));
  assert.match(chips.find(item => item.id === 'turkey').imageLocation, /Cappadocia/);
  assert.match(chips.find(item => item.id === 'europe').imageLocation, /Paris/);
  assert.match(chips.find(item => item.id === 'asia').imageLocation, /Tokyo/);
  assert.match(chips.find(item => item.id === 'middle-east').imageLocation, /Dubai/);
  for (const [id, location] of [['americas', 'Statue of Liberty, New York'], ['africa', 'Avenue of the Baobabs, Madagascar'], ['oceania', 'Sydney Opera House, Australia']]) {
    const chip = chips.find(item => item.id === id);
    assert.ok(loadedAssets.includes(chip.image));
    assert.ok(chip.image.endsWith(`/region-${id}.webp`));
    assert.equal(chip.imageLocation, location);
  }
});
