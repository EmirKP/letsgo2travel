import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Error, Date, Intl, URL, URLSearchParams, Response, Request, AbortSignal, AbortController, setTimeout, clearTimeout, Buffer, ...globals })(name => {
    if (name in imports) return imports[name]; throw Error(`Missing import ${name}`);
  }, output, output.exports);
  return output.exports;
}
const clone = value => JSON.parse(JSON.stringify(value));
const places = load('lib/travel-assistant/places.ts');
const contract = load('lib/travel-assistant/journey-photo-contract.ts', { './places': places });
const place = (id = 'apple/basilica', extra = {}) => ({ id, name: 'Basilica Cistern', latitude: 41.0084, longitude: 28.9779, sourceUrl: `https://maps.apple.com/place?place-id=${id.slice(6)}`, ...extra });
const photo = { imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cistern.jpg/640px-Cistern.jpg', imageSourceUrl: 'https://commons.wikimedia.org/wiki/File:Cistern.jpg', imageAttribution: 'Actual photographer', imageLicenseLabel: 'CC BY-SA 4.0', imageLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
const page = (extra = {}) => ({ ns: 0, title: 'Basilica Cistern', pageimage: 'Cistern.jpg', coordinates: [{ lat: 41.0084, lon: 28.9779, primary: '', globe: 'earth' }], ...extra });
const response = (pages = [page()], extra = {}) => ({ query: { pages, ...extra } });
function server(fetch = async () => Response.json(response()), metadata = async () => new Map([['Cistern.jpg', photo]]), globals = {}) {
  return load('lib/travel-assistant/journey-venue-photos.ts', { './places': places, './journey-photo-contract': contract, './journey-photos': { loadJourneyPhotoFiles: metadata }, './journey-routing': { providerJson: async r => { if (!r.ok) throw Error('provider'); return r.json(); } } }, { fetch, ...globals });
}
function client(requestJson) {
  return load('mobile/src/lib/journeyPhotoClient.ts', { './api': { requestJson }, '../../../lib/travel-assistant/places': places, '../../../lib/travel-assistant/journey-photo-contract': contract });
}

test('Venue photos require an exact named article or explicit redirect and a nearby primary Earth coordinate', () => {
  const model = server();
  assert.equal(model.matchWikipediaVenuePhotos(response(), [place()]).size, 1);
  assert.equal(model.matchWikipediaVenuePhotos(response([page()], { redirects: [{ from: 'Yerebatan Sarnıcı', to: 'Basilica Cistern' }] }), [place(undefined, { name: 'Yerebatan Sarnıcı' })]).size, 1);
  for (const bad of [page({ title: 'Another nearby place' }), page({ coordinates: [{ lat: 40, lon: 28.9779, primary: '', globe: 'earth' }] }), page({ coordinates: [{ lat: 41.0084, lon: 28.9779, globe: 'earth' }] }), page({ coordinates: [{ lat: 41.0084, lon: 28.9779, primary: '', globe: 'moon' }] }), page({ pageprops: { disambiguation: '' } }), page({ pageimage: 'Logo.svg' }), page({ missing: true })]) {
    assert.equal(model.matchWikipediaVenuePhotos(response([bad]), [place()]).size, 0);
  }
  assert.equal(model.matchWikipediaVenuePhotos(response([page(), page()]), [place()]).size, 0);
  assert.equal(model.matchWikipediaVenuePhotos(response([page()], { redirects: [{ from: 'Room', to: 'Basilica Cistern', tofragment: 'Another_site' }] }), [place(undefined, { name: 'Room' })]).size, 0);
});

test('Current Commons standardized 960px thumbnail tier remains bounded and does not accept arbitrary sizes', () => {
  const actual = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/MevlanaMuseum.jpg/960px-MevlanaMuseum.jpg';
  assert.equal(places.safeJourneyPhotoUrl(actual), actual);
  assert.equal(places.safeJourneyPhotoUrl(actual.replace('960px', '999px')), null);
  assert.equal(places.safeJourneyPhotoUrl(actual.replace('960px', '1280px')), null);
});

test('Photo requests reject malformed places, query separators, duplicate identities and oversized batches', () => {
  assert.equal(contract.parseJourneyPhotoRequest({ places: [place()], locale: 'tr' }).places.length, 1);
  for (const input of [{ places: [place(), place()], locale: 'tr' }, { places: [place(undefined, { name: 'A|B' })], locale: 'tr' }, { places: [place(undefined, { latitude: '41' })], locale: 'tr' }, { places: [place(undefined, { sourceUrl: 'https://evil.example/' })], locale: 'tr' }, { places: [place()], locale: 'xx' }, { places: Array.from({ length: 9 }, (_, i) => place(`apple/${i}`)), locale: 'tr' }]) assert.equal(contract.parseJourneyPhotoRequest(input), null);
});

test('Concurrent identical venue requests share bounded provider work and reuse attributed photo metadata', async () => {
  let calls = 0, release; const pending = new Promise(resolve => { release = resolve; });
  const model = server(async url => { calls++; assert.equal(new URL(url).hostname, 'en.wikipedia.org'); assert.equal(new URL(url).searchParams.get('titles'), 'Basilica Cistern'); await pending; return Response.json(response()); });
  const input = { places: [place()], locale: 'en' };
  const a = model.loadVenuePhotos(input), b = model.loadVenuePhotos(input); assert.equal(calls, 1);
  release(); const results = await Promise.all([a, b]);
  assert.equal(results[0].photos[0].imageAttribution, photo.imageAttribution); assert.deepEqual(clone(results[0]), clone(results[1]));
  await model.loadVenuePhotos(input); assert.equal(calls, 1);
  assert.equal((await model.loadVenuePhotos({ places: [place(undefined, { latitude: 40 })], locale: 'en' })).photos.length, 0);
  assert.equal(calls, 2, 'A reused provider id at another location cannot reuse a previous image');
});

test('Provider denial honors cooldown, unlicensed files remain absent and hung transports cannot grow without bound', async () => {
  let calls = 0;
  const denied = server(async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '120' } }); });
  assert.equal((await denied.loadVenuePhotos({ places: [place()], locale: 'tr' })).photos.length, 0);
  await denied.loadVenuePhotos({ places: [place('apple/other')], locale: 'en' }); assert.equal(calls, 1);
  const noLicense = server(undefined, async () => new Map());
  assert.equal((await noLicense.loadVenuePhotos({ places: [place()], locale: 'en' })).photos.length, 0);
  const timers = []; let hangingCalls = 0;
  const hanging = server(() => { hangingCalls++; return new Promise(() => {}); }, undefined, { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} });
  for (let i = 0; i < 4; i++) {
    const work = hanging.loadVenuePhotos({ places: [place(`apple/hang${i}`)], locale: 'en' });
    timers.at(-1)?.(); await work;
  }
  assert.equal(hangingCalls, 2, 'Ignored abort signals retain both occupied provider slots');
});

test('Client accepts only exact requested venue and complete licensed metadata, deduplicates and sends no private fields', async () => {
  const calls = [];
  const model = client(async (path, options) => { calls.push({ path, options }); return { photos: [{ ...place(), ...photo }], complete: true }; });
  const withPrivate = { ...place(), note: 'Private trip note', userId: 'private-owner' };
  const results = await Promise.all([model.loadJourneyPhotos([withPrivate], 'en'), model.loadJourneyPhotos([withPrivate], 'en')]);
  assert.equal(calls.length, 1); assert.equal(results[0].size, 1); assert.equal(results[1].size, 1);
  assert.deepEqual(clone(calls[0].options.body.places), [place()]);
  for (const bad of [{ ...place(), ...photo, latitude: 40 }, { ...place(), ...photo, name: 'Another place' }, { ...place(), ...photo, imageAttribution: '<script>' }, { ...place(), imageUrl: photo.imageUrl }, { ...place(), ...photo, imageUrl: 'https://evil.example/photo.jpg' }]) {
    assert.throws(() => model.validateJourneyPhotoResult({ photos: [bad], complete: true }, [place()]));
  }
  const failed = client(async () => { throw Error('offline'); });
  assert.equal((await failed.loadJourneyPhotos([place()], 'tr')).size, 0);
});

test('Leaving a day cancels queued photo batches; a missing endpoint never prevents retry after its short cache expires', async () => {
  let release, calls = 0;
  const deferred = new Promise(resolve => { release = resolve; });
  const model = client(async () => { calls++; await deferred; return { photos: [], complete: true }; });
  const controller = new AbortController();
  const work = model.loadJourneyPhotos(Array.from({length:9},(_,i)=>place(`apple/${i}`)), 'en', controller.signal);
  assert.equal(calls,1);controller.abort();release();assert.equal((await work).size,0);assert.equal(calls,1);
  let now=Date.now(),attempts=0;
  class Clock extends Date { static now(){return now;} }
  const retryable = load('mobile/src/lib/journeyPhotoClient.ts', { './api': { requestJson:async()=>{attempts++;if(attempts===1)throw Object.assign(Error('Not found'),{status:404});return {photos:[{...place(),...photo}],complete:true};} }, '../../../lib/travel-assistant/places': places, '../../../lib/travel-assistant/journey-photo-contract': contract }, {Date:Clock});
  assert.equal((await retryable.loadJourneyPhotos([place()],'en')).size,0);
  assert.equal((await retryable.loadJourneyPhotos([place()],'en')).size,0);assert.equal(attempts,1);
  now+=61_000;assert.equal((await retryable.loadJourneyPhotos([place()],'en')).size,1);assert.equal(attempts,2);
});

test('Photo endpoint validates bounded actual request bytes before provider calls and degrades safely on outages', async () => {
  const calls = [];
  const api = load('app/api/travel-assistant/journey-photos/route.ts', {
    '@/lib/travel-assistant/http': load('lib/travel-assistant/http.ts'), '@/lib/travel-assistant/journey-photo-contract': contract,
    '@/lib/travel-assistant/journey-venue-photos': { loadVenuePhotos: async input => { calls.push(input); throw Error('provider detail'); } },
  });
  const req = body => new Request('https://example.test/api/travel-assistant/journey-photos', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await api.POST(req({ places: [], locale: 'en' }))).status, 400);
  assert.equal((await api.POST(req({ excess: 'x'.repeat(8100) }))).status, 413); assert.equal(calls.length, 0);
  const result = await api.POST(req({ places: [place()], locale: 'en' })); assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { photos: [], complete: false }); assert.equal(calls.length, 1);
});

test('Place photo renders lazy attributed imagery and switches failed images to an explicit category fallback', () => {
  let failed = '';
  const jsx = (type, props) => ({ type, props });
  const model = load('mobile/src/components/JourneyPlacePhoto.tsx', {
    react: { useState: () => [failed, value => { failed = value; }] }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en, locale: 'en' }) }, '../lib/native': { openExternal() {} },
    '../../../lib/travel-assistant/places': places, './Icon': { Icon: 'Icon' },
  });
  const nodes = node => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
  const data = { ...place(), ...photo, category: 'museum' };
  let tree = model.JourneyPlacePhoto({ place: data });
  const img = nodes(tree).find(node => node.type === 'img'); assert.equal(img.props.loading, 'lazy'); assert.equal(img.props.alt, data.name); assert.equal(img.props.referrerPolicy, 'no-referrer');
  assert.ok(JSON.stringify(tree).includes('Actual photographer')); assert.ok(JSON.stringify(tree).includes('CC BY-SA 4.0'));
  img.props.onError(); tree = model.JourneyPlacePhoto({ place: data });
  assert.equal(nodes(tree).some(node => node.type === 'img'), false); assert.ok(JSON.stringify(tree).includes('No verified photo'));
});
