import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const locales = ['tr', 'en', 'sq', 'ro'];
const plain = value => JSON.parse(JSON.stringify(value));

// Load the production catalog and its real route/locale dependencies. Only
// imported asset bytes are represented by paths; no catalog/content mocks.
const cache = new Map();
function load(filename) {
  const full = resolve(root, filename);
  if (cache.has(full)) return cache.get(full).exports;
  if (/\.(webp|png|jpe?g|svg)$/.test(full)) {
    assert.ok(existsSync(full), `Missing catalog asset: ${relative(root, full)}`);
    return { __esModule: true, default: relative(root, full).replaceAll('\\', '/') };
  }
  if (extname(full) === '.json') return JSON.parse(readFileSync(full, 'utf8'));
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const result = ts.transpileModule(readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  vm.runInNewContext(`(function(require,module,exports){${result.outputText}\n})`, {
    Intl, Date, URL,
    fetch() { throw Error('City editorial content must work without a network request'); },
  }, { filename: full })(id => {
    assert.ok(id.startsWith('.'), `Unexpected catalog dependency: ${id}`);
    const base = resolve(dirname(full), id);
    const dependency = [base, `${base}.ts`].find(existsSync);
    assert.ok(dependency, `Missing dependency: ${id}`);
    return load(dependency);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { cityDestinations, cityDestination } = load('mobile/src/data/cityDestinations.ts');
const { cityEssentials } = load('mobile/src/data/cityEssentials.ts');

// Independent reviewed publisher-to-city mapping. A valid HTTPS URL alone must
// not allow a marketplace, lookalike host or another city's tourism board.
const officialHosts = {
  CDG: ['parisjetaime.com'],
  DPS: ['www.indonesia.travel'],
  HND: ['www.gotokyo.org'],
  FCO: ['www.turismoroma.it'],
  SJJ: ['www.visitsarajevo.ba'],
  OTP: ['cic.cdep.ro', 'filarmonicaenescu.ro', 'muzeul-satului.ro'],
  TIA: ['akt.gov.al'],
  BEG: ['www.tob.rs'],
  RIX: ['www.liveriga.com'],
  VNO: ['www.govilnius.lt'],
  SXB: ['groups.visitstrasbourg.fr'],
  TGD: ['podgorica.travel'],
  TLL: ['www.visittallinn.ee', 'web.visittallinn.ee'],
  WAW: ['go2warsaw.pl'],
  KRK: ['www.poland.travel', 'wawel.krakow.pl'],
  BTS: ['www.visitbratislava.com'],
  GDN: ['visitgdansk.com'],
  LIS: ['www.visitlisboa.com'],
  BUD: ['www.budapestinfo.hu'],
  ZAG: ['www.infozagreb.hr', 'new.infozagreb.hr'],
  ATH: ['www.thisisathens.org', 'accessibleroutes.thisisathens.org'],
  OPO: ['www.visitportugal.com'],
  CWL: ['www.visitcardiff.com'],
  LYS: ['en.visiterlyon.com'],
  PRG: ['prague.eu'],
  BER: ['www.visitberlin.de'],
  BRU: ['www.visit.brussels'],
  SZG: ['www.salzburg.info'],
  LUX: ['www.luxembourg-city.com'],
  DBV: ['tzdubrovnik.hr'],
  ARN: ['www.visitstockholm.com', 'www.skansen.se'],
  LJU: ['www.visitljubljana.com'],
  NCE: ['www.explorenicecotedazur.com'],
  BFS: ['visitbelfast.com'],
  LHR: ['www.visitlondon.com'],
  HAM: ['www.hamburg-travel.com'],
  FLR: ['www.feelflorence.it'],
  VIE: ['www.wien.info'],
  OST: ['www.visitbruges.be'],
  HEL: ['www.myhelsinki.fi', 'oodihelsinki.fi'],
  MAD: ['www.esmadrid.com'],
  VCE: ['www.veneziaunica.it'],
  ORK: ['www.discoverireland.ie'],
  AMS: ['www.iamsterdam.com'],
  DUB: ['www.visitdublin.com'],
  BCN: ['bid.barcelonaturisme.com'],
  GVA: ['www.geneve.com'],
  EDI: ['www.visitscotland.com'],
  CPH: ['www.visitcopenhagen.com'],
  OSL: ['www.visitoslo.com'],
};
const expectedCodes = Object.keys(officialHosts).sort();
const categories = {
  tr: ['Tarihî yer', 'Müze', 'Park ve bahçe', 'Semt ve sokaklar', 'Meydan', 'Mimari', 'Dinî yapı', 'Pazar', 'Kültür', 'Su kıyısı', 'Simge yapı', 'Manzara noktası', 'Kıyı'],
  en: ['Historic site', 'Museum', 'Park and garden', 'Neighbourhood and streets', 'Square', 'Architecture', 'Religious site', 'Market', 'Culture', 'Waterfront', 'Landmark', 'Viewpoint', 'Coast'],
  sq: ['Vend historik', 'Muze', 'Park dhe kopsht', 'Lagje dhe rrugë', 'Shesh', 'Arkitekturë', 'Objekt fetar', 'Treg', 'Kulturë', 'Buzë ujit', 'Pikë referimi', 'Pikë panoramike', 'Bregdet'],
  ro: ['Loc istoric', 'Muzeu', 'Parc și grădină', 'Cartier și străzi', 'Piață', 'Arhitectură', 'Lăcaș de cult', 'Piață comercială', 'Cultură', 'Malul apei', 'Obiectiv emblematic', 'Punct panoramic', 'Coastă'],
};

// These place identities come from the linked official research, independently
// of implementation keys/order. In particular OST means Bruges in this catalog,
// not Ostend's airport area; OTP is Bucharest, not Otopeni.
const facts = {
  OTP: {
    country: 'RO', titles: ['Bükreş', 'Bucharest', 'Bukuresht', 'București'],
    summaryAnchors: ['Bükreş', 'Bucharest', 'Bukuresht', 'București'],
    places: [
      ['Palace of Parliament', 'cic.cdep.ro', '/en/vizitare'],
      ['Romanian Athenaeum', 'filarmonicaenescu.ro', '/ro/vizitarea-ateneului-roman'],
      ['Dimitrie Gusti National Village Museum', 'muzeul-satului.ro', '/en/contact/'],
    ],
  },
  SJJ: {
    country: 'BA', titles: ['Saraybosna', 'Sarajevo', 'Sarajevë', 'Sarajevo'],
    summaryAnchors: ['Saraybosna', 'Sarajevo', 'Sarajev', 'Sarajevo'],
    places: [
      ['Baščaršija', 'www.visitsarajevo.ba', '/bs/top-atrakcije/'],
      ['Sarajevo City Hall', 'www.visitsarajevo.ba', '/bs/top-atrakcije/'],
      ['Vrelo Bosne', 'www.visitsarajevo.ba', '/ilidza/'],
    ],
  },
  RIX: {
    country: 'LV', titles: ['Riga', 'Riga', 'Rigë', 'Riga'],
    summaryAnchors: ['Riga', 'Riga', 'Rig', 'Riga'],
    places: [
      ['House of the Blackheads', 'www.liveriga.com', '/en/visit/what-to-see/top-sights/house-of-the-blackheads'],
      ['St Peter’s Church', 'www.liveriga.com', '/en/1628-st-peter-s-church/'],
      ['Riga Central Market', 'www.liveriga.com', '/en/visit/what-to-do/what-to-see-in-riga-in-3-days'],
    ],
  },
  OST: {
    country: 'BE', titles: ['Brugge', 'Bruges', 'Bruges', 'Bruges'],
    summaryAnchors: ['Brugge', 'Bruges', 'Bruges', 'Bruges'],
    places: [
      ['Belfry of Bruges', 'www.visitbruges.be', '/en/things-to-do/culture-and-heritage/belfort-belfry'],
      ['Markt', 'www.visitbruges.be', '/en/things-to-do/culture-and-heritage/markt-market-square'],
      ['Minnewaterpark', 'www.visitbruges.be', '/en/things-to-do/culture-and-heritage/minnewaterpark-lake-love-park'],
    ],
  },
};

for (const locale of locales) {
  test(`${locale}: all 50 real city titles have distinct summaries and three named, sourced places`, () => {
    const cities = cityDestinations(locale);
    assert.equal(cities.length, 50);
    assert.deepEqual(plain(cities.map(city => city.code).sort()), expectedCodes);
    const summaries = new Set();
    for (const city of cities) {
      assert.equal(cityDestination(city.code, locale).name, city.name);
      assert.ok(city.name.trim() && city.country.trim(), `${city.code} has its localized city title`);
      const entry = cityEssentials(city.code, locale);
      assert.ok(entry, `${city.code} has editorial content`);
      assert.ok(typeof entry.summary === 'string' && entry.summary.trim().length >= 40);
      assert.doesNotMatch(entry.summary, /undefined|null|lorem ipsum|TODO/i);
      summaries.add(entry.summary);
      assert.equal(entry.places.length, 3, `${city.code} offers three actual places`);
      assert.equal(new Set(entry.places.map(place => place.id)).size, 3);
      assert.equal(new Set(entry.places.map(place => place.name.normalize('NFC').toLocaleLowerCase(locale))).size, 3);
      for (const place of entry.places) {
        assert.ok(place.id.trim() && place.name.trim() && place.source.title.trim());
        assert.ok(categories[locale].includes(place.category), `${city.code}/${place.id} category follows ${locale}`);
        const url = new URL(place.source.url);
        assert.equal(url.protocol, 'https:');
        assert.equal(url.username + url.password, '');
        assert.ok(officialHosts[city.code].includes(url.hostname), `${city.code}: unreviewed publisher ${url.hostname}`);
        assert.notEqual(url.pathname, '/', 'Link to the supporting page rather than a bare homepage');
      }
    }
    assert.equal(summaries.size, 50, 'Different cities must not share a generic/default city description');
  });
}

test('Changing locale preserves place identities/sources while replacing every summary and category', () => {
  for (const code of expectedCodes) {
    const entries = locales.map(locale => cityEssentials(code, locale));
    assert.equal(new Set(entries.map(entry => entry.summary)).size, 4, `${code} needs four actual summary translations`);
    const identity = entry => plain(entry.places.map(({ id, source }) => ({ id, source })));
    for (const entry of entries.slice(1)) assert.deepEqual(identity(entry), identity(entries[0]));
    for (let position = 0; position < 3; position++) {
      assert.equal(new Set(entries.map(entry => entry.places[position].category)).size, 4, `${code} category cannot retain the previous locale`);
    }
  }
});

test('Bucharest, Sarajevo, Riga and Bruges retain their independently reviewed city and landmark identities', () => {
  for (const [code, expected] of Object.entries(facts)) {
    for (const [index, locale] of locales.entries()) {
      const city = cityDestination(code, locale);
      assert.equal(city.name, expected.titles[index]);
      assert.equal(city.countryCode, expected.country);
      assert.ok(cityEssentials(code, locale).summary.includes(expected.summaryAnchors[index]), `${code}/${locale} summary belongs to the named city`);
    }
    const places = cityEssentials(code, 'en').places;
    assert.deepEqual(plain(places.map(place => place.name).sort()), expected.places.map(([name]) => name).sort());
    for (const [name, hostname, pathname] of expected.places) {
      const url = new URL(places.find(place => place.name === name).source.url);
      assert.equal(url.hostname, hostname);
      assert.equal(url.pathname, pathname);
    }
  }
});

test('Text-only editorial places do not inherit city photos, city centres or live travel claims', () => {
  const prohibitedClaims = /(?:[€£$₺]\s*\d|\d\s*(?:EUR|USD|GBP|TRY)\b|\b\d+(?:[.,]\d+)?\s*(?:km|kilometres?|kilometers?|minutes?|dakika)\b|\b(?:open now|currently open|sold out|available today|şu an açık|bugün açık|son bilet)\b)/iu;
  for (const code of expectedCodes) {
    for (const locale of locales) {
      const entry = cityEssentials(code, locale);
      assert.deepEqual(Object.keys(entry).sort(), ['places', 'summary']);
      assert.doesNotMatch(entry.summary, prohibitedClaims);
      for (const place of entry.places) {
        // No place-specific coordinates were verified for this text-only set.
        // Inherited centre/photo fields would silently fabricate a real pin/image.
        assert.deepEqual(Object.keys(place).sort(), ['category', 'id', 'name', 'source']);
        assert.deepEqual(Object.keys(place.source).sort(), ['title', 'url']);
        assert.doesNotMatch(place.name, prohibitedClaims);
      }
    }
  }
});

test('Unknown destinations and prototype keys never fall back to another city; invalid locales fail closed', () => {
  for (const code of ['ZZZ', 'FR', 'Bucharest', 'OTP,CDG', '', ' ', '__proto__', 'constructor', 'toString', 'valueOf', null, undefined, 0, {}, []]) {
    assert.equal(cityEssentials(code, 'en'), undefined, `Unsupported destination: ${String(code)}`);
  }
  for (const locale of ['de', 'EN', '', '__proto__', 'constructor', 'toString', null, undefined, {}, []]) {
    assert.equal(cityEssentials('OTP', locale), undefined, `Unsupported locale: ${String(locale)}`);
  }
  const hostile = { toString() { throw Error('Do not coerce untrusted inputs'); } };
  assert.equal(cityEssentials(hostile, 'en'), undefined);
  assert.equal(cityEssentials('OTP', hostile), undefined);
  assert.deepEqual(plain(cityEssentials('  otp  ', 'ro')), plain(cityEssentials('OTP', 'ro')));
});

test('Mutating a returned city, place, source or array never changes later readers or another locale', () => {
  const before = Object.fromEntries(expectedCodes.map(code => [code, locales.map(locale => plain(cityEssentials(code, locale)))]));
  for (const code of expectedCodes) {
    const value = cityEssentials(code, 'en');
    value.summary = 'Changed';
    value.places[0].name = 'Changed';
    value.places[0].source.title = 'Changed';
    value.places[0].source.url = 'https://example.invalid/';
    value.places[0].latitude = 0;
    value.places.splice(1, 2, { id: 'injected', name: 'Injected' });
    for (const [index, locale] of locales.entries()) {
      assert.deepEqual(plain(cityEssentials(code, locale)), before[code][index], `${code}/${locale} survives caller mutation`);
    }
  }
});

// Research output is intentionally ignored by Git, so release CI can run the
// same substantive fixtures above without requiring a workstation artifact.
const evidencePath = resolve(root, 'outputs/overnight-cities-20261031/content-facts.json');
test('When the local research record is present, all place sources and key city facts match it', {
  skip: !existsSync(evidencePath) && 'Local research artifact is not included in release checkouts',
}, () => {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  assert.deepEqual(evidence.cities.map(city => city.code).sort(), expectedCodes);
  assert.equal(evidence.counts.verifiedCoordinates, 0);
  for (const city of evidence.cities) {
    const actual = cityEssentials(city.code, 'en');
    assert.equal(actual.summary, city.editorialSummary);
    assert.equal(city.places.length, 3);
    for (const recorded of city.places) {
      const place = actual.places.find(candidate => candidate.id === recorded.id);
      assert.ok(place, `${city.code}/${recorded.id} remains present`);
      assert.equal(place.name, recorded.name);
      assert.deepEqual(plain(place.source), recorded.source);
    }
  }
  for (const [code, expected] of Object.entries(facts)) {
    assert.deepEqual(evidence.cities.find(city => city.code === code).places.map(place => place.name).sort(), expected.places.map(([name]) => name).sort());
  }
});
