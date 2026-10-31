import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Load the actual catalog, locale helpers and existing route builders. Images
// resolve to their source paths; no account/network/provider fixtures are used.
const cache = new Map();
function load(file) {
  const full = resolve(file);
  if (cache.has(full)) return cache.get(full);
  if (/\.(webp|png|jpe?g)$/.test(full)) {
    assert.ok(existsSync(full), `Missing destination image: ${relative('.', full)}`);
    return { default: relative('.', full).replaceAll('\\', '/') };
  }
  if (extname(full) === '.json') return { default: JSON.parse(readFileSync(full, 'utf8')) };
  const loaded = { exports: {} };
  cache.set(full, loaded.exports);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Intl, Date, URL })(id => {
    assert.ok(id.startsWith('.'), `Unexpected catalog dependency: ${id}`);
    const dependency = resolve(dirname(full), id);
    return load(extname(dependency) ? dependency : `${dependency}.ts`);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const catalog = load('mobile/src/data/cityDestinations.ts');
const routes = load('mobile/src/data/routes.ts');
const starters = load('mobile/src/data/homeDestinations.ts');
const budgetPhotos = load('mobile/src/data/budgetCityPhotos.ts').BUDGET_CITY_PHOTOS;
const benchmarks = load('lib/country-intelligence/city-benchmarks.ts').CITY_BENCHMARKS;
const plain = value => JSON.parse(JSON.stringify(value));

test('Four Home destinations keep canonical city, ISO identity and existing portrait photographs', () => {
  const cities = catalog.cityDestinations('en').slice(0, 4);
  assert.deepEqual(plain(cities.map(({ code, name, countryCode, alpha3 }) => [code, name, countryCode, alpha3])), [
    ['CDG', 'Paris', 'FR', 'FRA'], ['DPS', 'Bali', 'ID', 'IDN'],
    ['HND', 'Tokyo', 'JP', 'JPN'], ['FCO', 'Rome', 'IT', 'ITA'],
  ]);
  const photos = ['home-reference/paris-eiffel-v3.webp', 'home-reference/bali-beach-v5.webp',
    'home-reference/tokyo-temple-v5.webp', 'destination-artwork/rome.webp'];
  cities.forEach((city, index) => assert.ok(city.photo.endsWith(photos[index])));
  assert.equal(catalog.cityDestination('  fco ', 'en').code, 'FCO');
  assert.equal(catalog.cityDestination('unknown', 'en'), null);
  assert.equal(catalog.cityDestination('FR', 'en'), null, 'Country identity must not be mistaken for a city code');
});

test('Destination and landmark labels are available immediately in all four languages', () => {
  const expected = {
    tr: [['Paris', 'Fransa'], ['Bali', 'Endonezya'], ['Tokyo', 'Japonya'], ['Roma', 'İtalya']],
    en: [['Paris', 'France'], ['Bali', 'Indonesia'], ['Tokyo', 'Japan'], ['Rome', 'Italy']],
    sq: [['Parisi', 'Francë'], ['Bali', 'Indonezi'], ['Tokio', 'Japoni'], ['Romë', 'Itali']],
    ro: [['Paris', 'Franța'], ['Bali', 'Indonezia'], ['Tokyo', 'Japonia'], ['Roma', 'Italia']],
  };
  for (const [locale, labels] of Object.entries(expected)) {
    const cities = catalog.cityDestinations(locale).slice(0, 4);
    assert.deepEqual(plain(cities.map(city => [city.name, city.country])), labels);
    assert.deepEqual(plain(cities.map(city => city.highlights.length)), [2, 2, 2, 6]);
    assert.ok(cities.every(city => city.highlights.every(point => point.name.trim())));
  }
  assert.equal(catalog.cityDestination('CDG', 'ro').highlights[0].name, 'Turnul Eiffel');
  assert.equal(catalog.cityDestination('HND', 'sq').highlights[0].name, 'Tempulli Sensō-ji');
});

test('Available itineraries reuse exact existing routes and do not invent a Tokyo route', () => {
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    for (const city of catalog.cityDestinations(locale)) {
      const existing = routes.routeByDestinationCode(city.code, locale)
        || starters.homeSearchDestinations(locale).find(route => route.destinationCode === city.code) || null;
      assert.deepEqual(plain(city.route), plain(existing));
    }
  }
  assert.equal(catalog.cityDestination('CDG', 'en').route.dailyPlan.length, 3);
  assert.equal(catalog.cityDestination('DPS', 'en').route.dailyPlan.length, 5);
  assert.equal(catalog.cityDestination('FCO', 'en').route.dailyPlan.length, 4);
  assert.equal(catalog.cityDestination('HND', 'en').route, null);
});

test('Map handoffs retain the destination or selected landmark instead of airport coordinates', () => {
  const expectedCenters = { CDG: [48.8566, 2.3522], DPS: [-8.4095, 115.1889], HND: [35.6762, 139.6503], FCO: [41.9028, 12.4964] };
  const expectedPoints = {
    'eiffel-tower': [48.85837, 2.29448], louvre: [48.8606, 2.3376],
    'kelingking-beach': [-8.7506, 115.4739], 'uluwatu-temple': [-8.8291, 115.0849],
    'senso-ji': [35.714765, 139.796655], 'shibuya-crossing': [35.6595, 139.7005],
    colosseum: [41.89021, 12.49223], 'trevi-fountain': [41.90094, 12.48331],
    pantheon: [41.898996, 12.476993], 'vatican-museums': [41.9068876, 12.4538569],
    trastevere: [41.8893784, 12.4701817], 'villa-borghese': [41.91369219970958, 12.48712778418498],
  };
  for (const city of catalog.cityDestinations('en').slice(0, 4)) {
    assert.deepEqual(plain([city.center.latitude, city.center.longitude]), expectedCenters[city.code]);
    for (const point of city.highlights) {
      assert.deepEqual(plain([point.latitude, point.longitude]), expectedPoints[point.id]);
      assert.ok(existsSync(point.photo));
      assert.ok(Math.abs(point.latitude - city.center.latitude) < 0.5);
      assert.ok(Math.abs(point.longitude - city.center.longitude) < 0.5);
    }
    assert.notEqual(city.highlights[0].photo, city.highlights[1].photo, 'Different attractions must not reuse one unrelated photo');
  }
});

test('The discovery catalog contains exactly 50 unique real destinations with valid ISO identities and packaged photos', () => {
  const cities = catalog.cityDestinations('en');
  const iso = JSON.parse(readFileSync('mobile/src/data/iso3166.json', 'utf8'));
  assert.equal(cities.length, 50);
  assert.equal(new Set(cities.map(city => city.code)).size, 50);
  assert.equal(new Set(cities.map(city => `${city.countryCode}:${city.name}`)).size, 50);
  assert.equal(new Set(cities.map(city => city.photo)).size, 50, 'Each destination keeps its own city photograph');
  const centres = new Set();
  for (const city of cities) {
    assert.match(city.code, /^[A-Z]{3}$/);
    assert.equal(iso.find(row => row.alpha2 === city.countryCode)?.alpha3, city.alpha3);
    assert.ok(existsSync(city.photo), `${city.code} has a bundled city-specific photo`);
    assert.doesNotMatch(city.photo, /brand|logo|globe|country-guide/);
    assert.ok(Number.isFinite(city.center.latitude) && Math.abs(city.center.latitude) <= 90);
    assert.ok(Number.isFinite(city.center.longitude) && Math.abs(city.center.longitude) <= 180);
    assert.notEqual(city.center.latitude, 0);
    assert.notEqual(city.center.longitude, 0);
    centres.add(`${city.center.latitude}:${city.center.longitude}`);
    assert.equal(catalog.cityDestination(` ${city.code.toLowerCase()} `, 'en').name, city.name);
  }
  assert.equal(centres.size, 50, 'Different city actions must not silently share a country centre');
  for (const locale of ['tr', 'en', 'sq', 'ro']) {
    const localized = catalog.cityDestinations(locale);
    assert.equal(localized.length, 50);
    assert.deepEqual(plain(localized.map(city => city.code)), plain(cities.map(city => city.code)));
    assert.ok(localized.every(city => typeof city.name === 'string' && city.name.trim()
      && typeof city.country === 'string' && city.country.trim()));
    assert.ok(localized.slice(4).every(city => city.highlights.length === 0), 'New cities without verified landmark photographs do not invent highlights');
  }
  assert.equal(catalog.cityDestination('OTP', 'ro').name, 'București');
  assert.equal(catalog.cityDestination('VIE', 'sq').name, 'Vjenë');
  assert.equal(catalog.cityDestination('LIS', 'ro').name, 'Lisabona');
  assert.equal(catalog.cityDestination('WAW', 'tr').name, 'Varşova');
});

test('48 exact budget city identities reuse their genuine photo and attribution without applying prices to Bali or Tokyo', () => {
  const cities = catalog.cityDestinations('en');
  const covered = cities.filter(city => city.budgetBenchmarkId);
  assert.equal(covered.length, 48);
  assert.equal(new Set(covered.map(city => city.budgetBenchmarkId)).size, 48);
  assert.deepEqual(plain(cities.filter(city => !city.budgetBenchmarkId).map(city => city.code)), ['DPS', 'HND']);
  assert.deepEqual(plain(benchmarks.filter(row => !covered.some(city => city.budgetBenchmarkId === row.id)).map(row => row.id)), ['SK-trencin', 'FR-lille']);
  for (const city of covered) {
    const benchmark = benchmarks.find(row => row.id === city.budgetBenchmarkId);
    const photo = budgetPhotos[city.budgetBenchmarkId];
    assert.ok(benchmark && photo);
    assert.equal(city.countryCode, benchmark.code);
    assert.equal(city.name, benchmark.city.en);
    assert.equal(catalog.cityDestination(city.code, 'tr').name, benchmark.city.tr, 'Budget handoff preserves the exact Turkish benchmark label');
    assert.equal(city.photo, photo.src);
    assert.deepEqual(plain(city.photoCredit ?? null), plain(photo.credit ?? null));
  }
  const credited = catalog.cityDestination('VIE', 'en');
  assert.ok(credited.photoCredit.author && credited.photoCredit.licenseUrl && credited.photoCredit.source);
  credited.photoCredit.author = 'Private edit';
  assert.notEqual(catalog.cityDestination('VIE', 'en').photoCredit.author, 'Private edit');
});

test('Editing one destination or route cannot change later consumers or another locale', () => {
  const city = catalog.cityDestination('CDG', 'en');
  city.center.latitude = 0;
  city.highlights[0].name = 'Private note';
  city.route.dailyPlan[0] = 'Private draft';
  city.route.warnings.push('Private warning');
  const fresh = catalog.cityDestination('CDG', 'en');
  assert.equal(fresh.center.latitude, 48.8566);
  assert.equal(fresh.highlights[0].name, 'Eiffel Tower');
  assert.notEqual(fresh.route.dailyPlan[0], 'Private draft');
  assert.ok(!fresh.route.warnings.includes('Private warning'));
  assert.equal(catalog.cityDestination('CDG', 'ro').highlights[0].name, 'Turnul Eiffel');
});

test('New landmark photographs have primary author, exact subject and reusable license provenance', () => {
  const root = 'mobile/src/assets/city-destinations/';
  const credits = JSON.parse(readFileSync(`${root}photo-credits.json`, 'utf8'));
  for (const file of ['louvre.webp', 'uluwatu.webp', 'trevi.webp']) {
    const credit = credits[file];
    assert.match(credit.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(credit.photographer && credit.subject && credit.changes);
    assert.equal(credit.license, 'https://creativecommons.org/publicdomain/zero/1.0/');
    assert.ok(statSync(root + file).size < 150_000, 'Small landmark cards must not add giant source images');
  }
});

test('Rome adds four different real places with individual bundled photographs and visible-credit metadata', () => {
  const root = 'mobile/src/assets/city-destinations/';
  const credits = JSON.parse(readFileSync(`${root}rome-photo-credits.json`, 'utf8'));
  const city = catalog.cityDestination('FCO', 'en');
  assert.deepEqual(plain(city.highlights.map(point => point.id)), ['colosseum', 'trevi-fountain', 'pantheon', 'vatican-museums', 'trastevere', 'villa-borghese']);
  assert.equal(new Set(city.highlights.map(point => point.photo)).size, 6, 'Each place has its own photograph');
  for (const point of city.highlights.slice(2)) {
    const file = `rome-${point.id}.webp`, entry = credits[file];
    assert.ok(point.photo.endsWith(file));
    assert.deepEqual(plain(point.photoCredit), entry.credit, 'Exact source, author and license accompany the displayed photo');
    assert.match(entry.credit.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(entry.credit.licenseUrl, /^https:\/\/creativecommons\.org\//);
    assert.ok(entry.credit.title && entry.credit.author && entry.changes && entry.visualCheck);
    assert.ok(statSync(root + file).size < 150_000);
    point.photoCredit.author = 'Private note';
    assert.equal(catalog.cityDestination('FCO', 'en').highlights.find(item => item.id === point.id).photoCredit.author, entry.credit.author);
    assert.equal(catalog.cityDestination('FCO', 'ro').highlights.find(item => item.id === point.id).photoCredit.author, entry.credit.author);
  }
  assert.equal(credits['rome-villa-borghese.webp'].credit.license, 'CC BY-SA 4.0');
  assert.equal(credits['rome-villa-borghese.webp'].credit.author, 'ViviBzk');
});
