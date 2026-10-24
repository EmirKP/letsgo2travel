import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports, globals = {}) {
  const out = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URLSearchParams, AbortSignal, ...globals })(name => {
    if (name.endsWith('.css')) return {};
    if (name in imports) return imports[name];
    throw Error(`Missing import: ${name}`);
  }, out, out.exports);
  return out.exports;
}
const observation = () => ({ temperature_2m: 20, apparent_temperature: 19, precipitation: 0, weather_code: 0, time: '2026-10-11T12:00' });
function weatherApi(provider) {
  return load('app/api/travel-now/route.ts', { 'next/server': { NextResponse: Response } }, { fetch: provider });
}
const request = (locale = 'en') => new Request('https://example.test/api/travel-now', { method: 'POST', body: JSON.stringify({ latitude: 41.01234, longitude: 28.98765, budget: 'free', interest: 'food', locale }) });

test('Missing or nonnumeric observations return unavailable, never fabricated weather or recommendations', async () => {
  for (const field of ['temperature_2m', 'apparent_temperature', 'precipitation', 'weather_code']) {
    for (const value of [null, undefined, '', false, '0', [], {}, Infinity, NaN]) {
      const current = { ...observation(), [field]: value };
      const api = weatherApi(async () => ({ ok: true, json: async () => ({ timezone: 'Europe/Istanbul', current }) }));
      const response = await api.POST(request());
      assert.equal(response.status, 503, `${field}: ${JSON.stringify(value)}`);
      const body = await response.json();
      assert.equal(body.data, undefined);
      assert.equal(body.error, 'Live weather and suggestions are unavailable.');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
});

test('True numeric zero remains valid, coordinates stay coarse, and normal weather produces recommendations', async () => {
  let requested;
  const api = weatherApi(async (url, options) => {
    requested = { url: new URL(url), options };
    return Response.json({ timezone: 'Europe/Istanbul', current: { ...observation(), temperature_2m: 0, apparent_temperature: 0 } });
  });
  const response = await api.POST(request());
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.weather.temperature, 0);
  assert.equal(data.weather.apparentTemperature, 0);
  assert.equal(data.weather.precipitation, 0);
  assert.equal(data.weather.description, 'Clear');
  assert.equal(data.recommendations.length, 3);
  assert.equal(requested.url.searchParams.get('latitude'), '41.01');
  assert.equal(requested.url.searchParams.get('longitude'), '28.99');
  assert.equal(requested.options.cache, 'no-store');
});

test('Missing observation time and provider failures stay unavailable in every supported language', async () => {
  for (const time of [null, undefined, '', false, 'not-a-time']) {
    const api = weatherApi(async () => Response.json({ current: { ...observation(), time } }));
    assert.equal((await api.POST(request())).status, 503);
  }
  for (const [locale, message] of [['tr', 'Anlık hava ve öneriler alınamadı.'], ['en', 'Live weather and suggestions are unavailable.'], ['sq', 'Moti dhe sugjerimet nuk janë të disponueshme për momentin.']]) {
    const api = weatherApi(async () => { throw Error('offline'); });
    const response = await api.POST(request(locale));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: message });
  }
});

const jsx = (type, props, key) => ({ type, props, key });
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const tick = () => new Promise(setImmediate);
const result = title => ({ data: { weather: { temperature: 20, apparentTemperature: 19, precipitation: 0, description: 'Clear', localTime: '2026-10-11T12:00' }, recommendations: [{ id: title, title, reason: 'Current selection', duration: '1h', mapQuery: title, indoor: true }], privacy: 'Approximate location only.' } });
function harness() {
  const slots = [], geolocations = [], requests = [], contexts = [], openedEvents = [], notices = [];
  let cursor = 0, locale = 'en', dirty = false, effects = [], tree;
  const react = {
    useState(initial) { const at = cursor++; slots[at] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[at].value, next => { const value = typeof next === 'function' ? next(slots[at].value) : next; if (!Object.is(value, slots[at].value)) { slots[at].value = value; dirty = true; } }]; },
    useRef(initial) { const at = cursor++; return slots[at] ||= { current: initial }; },
    useMemo: fn => fn(),
    useEffect(fn, deps) { const at = cursor++, old = slots[at]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) { const next = { deps }; slots[at] = next; effects.push(() => { old?.cleanup?.(); next.cleanup = fn(); }); } },
    lazy: () => 'TravelAssistant', Suspense: 'Suspense',
  };
  const profile = { code: 'XK', phrases: [], etiquette: [] };
  const api = load('mobile/src/screens/TravelCompanionScreen.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '../components/Icon': { Icon: 'Icon' }, '../components/TravelToolArtwork': { TravelToolArtwork: 'TravelToolArtwork' },
    '../components/PageHero': { PageHero: 'PageHero' }, '../components/CountryPicker': { CountryPicker: 'CountryPicker' },
    '../data/countries': { COUNTRY_LIST: [] }, '../data/countryIso': { alpha2FromAlpha3: code => code, flagEmoji: () => '' },
    '../data/travelEssentials': { TRAVEL_ESSENTIALS: [], essentialProfile: () => profile, fallbackEssentialProfile: () => profile },
    '../lib/api': { getTravelNow: input => new Promise((resolve, reject) => requests.push({ input, resolve, reject })) },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (_, en) => en, countryName: (_, name) => name }) },
    '../lib/native': { openExternal: async () => true }, '../lib/travelSelection': { readTravelCountry: () => '', selectTravelCountry: () => {} },
    '../lib/eventSearchContext': { nearbyEventContext: center => new Promise((resolve,reject)=>contexts.push({center,resolve,reject})) },
    '../components/TravelSafety': { EvidenceLine: 'EvidenceLine' },
  }, { navigator: { geolocation: { getCurrentPosition: (success, error) => geolocations.push({ success, error }) } }, window: { requestAnimationFrame: () => {} } });
  const render = () => {
    for (let count = 0; count < 10; count++) {
      cursor = 0; dirty = false; effects = [];
      tree = api.TravelCompanionScreen({ initialTab: 'now', accessToken: '', onSignIn: () => {}, onNavigate: () => {}, onOpenEvents:context=>openedEvents.push(context), onNotice:message=>notices.push(message) });
      effects.forEach(fn => fn());
      if (!dirty) return tree;
    }
    throw Error('Unstable render');
  };
  const button = label => nodes(tree).find(n => n.type === 'button' && (text(n).trim() === label || text(n.props.children?.[1]?.props?.children?.[0]) === label));
  render();
  return {
    requests, geolocations, contexts, openedEvents, notices, render, get tree() { return tree; }, get text() { return text(tree); },
    start() { const button = nodes(tree).find(n => n.props?.className === 'now-locate-button'); button.props.onClick(); render(); },
    choose(label) { const control = button(label); assert.ok(control, `Button ${label}`); control.props.onClick(); return render(); },
    locate(at = geolocations.length - 1) { geolocations[at].success({ coords: { latitude: 41.01234, longitude: 28.98765 } }); return render(); },
    language(value) { locale = value; return render(); },
    async settle() { await tick(); return render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    get loading() { return nodes(tree).find(n => n.props?.className === 'now-locate-button')?.props.disabled; },
  };
}

test('Budget and mood changes abandon GPS callbacks and do not issue a request for old choices', async () => {
  const h = harness(); h.start(); h.choose('Free'); h.choose('Food'); h.locate(0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.loading, false);
  h.start(); h.locate(1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0].input)), { latitude: 41.01, longitude: 28.99, budget: 'free', interest: 'food', locale: 'en' });
  h.requests[0].resolve(result('New choice')); await h.settle(); assert.match(h.text, /New choice/);
});

test('Old success or failure cannot overwrite a new selection or release its loading state', async () => {
  for (const outcome of ['success', 'failure']) {
    const h = harness(); h.start(); h.locate();
    h.choose('Free'); h.choose('Food'); h.start(); h.locate();
    if (outcome === 'success') h.requests[0].resolve(result('STALE'));
    else h.requests[0].reject(Error('old offline request'));
    await h.settle(); assert.equal(h.loading, true); assert.doesNotMatch(h.text, /STALE|could not be prepared/);
    h.requests[1].resolve(result('Current request')); await h.settle(); assert.equal(h.loading, false); assert.match(h.text, /Current request/);
  }
});

test('Language changes fence GPS and API results, including a late error after the new result', async () => {
  const gps = harness(); gps.start(); gps.language('sq'); gps.locate(); assert.equal(gps.requests.length, 0);
  gps.start(); gps.locate(); assert.equal(gps.requests[0].input.locale, 'sq'); gps.unmount();
  for (const outcome of ['success', 'failure']) {
    const h = harness(); h.start(); h.locate(); h.language('sq'); h.start(); h.locate();
    assert.equal(h.requests[1].input.locale, 'sq');
    h.requests[1].resolve(result('Rezultati shqip')); await h.settle();
    if (outcome === 'success') h.requests[0].resolve(result('OLD ENGLISH'));
    else h.requests[0].reject(Error('old error'));
    await h.settle(); assert.match(h.text, /Rezultati shqip/); assert.doesNotMatch(h.text, /OLD ENGLISH|could not be prepared/);
  }
});

test('Changing a completed selection or starting another lookup removes the old weather and recommendations', async () => {
  const h = harness(); h.start(); h.locate(); h.requests[0].resolve(result('Previous result')); await h.settle();
  h.choose('Food'); assert.doesNotMatch(h.text, /Previous result|20°/);
  h.choose('Culture'); assert.doesNotMatch(h.text, /Previous result|20°/, 'Switching back must not revive a dismissed result');
  h.start(); h.locate(); h.requests[1].resolve(result('New result')); await h.settle();
  h.start(); assert.doesNotMatch(h.text, /New result|20°/);
});

test('Leaving the section and unmounting fence both GPS callbacks and weather replies', async () => {
  const h = harness(); h.start(); h.locate(); h.choose('Tools');
  h.requests[0].resolve(result('Abandoned')); await h.settle(); h.choose('Around me');
  assert.doesNotMatch(h.text, /Abandoned/);
  h.start(); h.choose('Tools'); h.locate(1); assert.equal(h.requests.length, 1);
  const gone = harness(); gone.start(); gone.unmount(); gone.locate(); assert.equal(gone.requests.length, 0);
  const response = harness(); response.start(); response.locate(); response.unmount(); response.requests[0].resolve(result('After unmount')); await tick();
  assert.doesNotMatch(text(response.render()), /After unmount/);
});

test('Repeated clicks share one location attempt and current failures allow a clean retry', async () => {
  const h = harness(); h.start(); h.start(); assert.equal(h.geolocations.length, 1);
  h.geolocations[0].error({ code: 1 }); h.render(); assert.equal(h.loading, false); assert.match(h.text, /permission was denied/);
  h.start(); assert.doesNotMatch(h.text, /permission was denied/); h.locate(); h.requests[0].reject(Error('offline')); await h.settle();
  assert.equal(h.loading, false); assert.match(h.text, /could not be prepared/);
  h.start(); h.locate(); h.requests[1].resolve(result('Recovered')); await h.settle(); assert.match(h.text, /Recovered/); assert.doesNotMatch(h.text, /could not be prepared/);
});

test('Nearby event handoff uses the completed coarse location and resolves once before navigation',async()=>{
  const h=harness();h.start();h.locate();h.requests[0].resolve(result('Current area'));await h.settle();
  h.choose('See nearby events too');
  assert.equal(h.contexts.length,1);assert.equal(h.openedEvents.length,0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.contexts[0].center)),{latitude:41.01,longitude:28.99});
  const context={countryCode:'TR',cityName:'İstanbul',startDate:'2026-10-20',endDate:'2026-10-27'};
  h.contexts[0].resolve(context);await h.settle();
  assert.deepEqual(h.openedEvents,[context]);assert.equal(h.geolocations.length,1,'The event shortcut does not request precise GPS again');
});

test('Leaving the current-area task fences pending nearby-event successes and failures',async()=>{
  for(const outcome of ['success','failure']){
    const h=harness();h.start();h.locate();h.requests[0].resolve(result('Current area'));await h.settle();
    h.choose('See nearby events too');h.choose('Tools');
    if(outcome==='success')h.contexts[0].resolve({countryCode:'IT',startDate:'2026-10-20',endDate:'2026-10-27'});
    else h.contexts[0].reject(Error('Abandoned country lookup'));
    await h.settle();
    assert.equal(h.openedEvents.length,0);assert.equal(h.notices.length,0);
  }
});
