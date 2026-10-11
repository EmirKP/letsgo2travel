import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const button = tree => nodes(tree).find(node => node.type === 'button');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file, imports, globals) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, globals)(name => {
    if (!(name in imports)) throw Error(`Unexpected import ${name}`);
    return imports[name];
  }, output, output.exports);
  return output.exports;
}
function harness() {
  let now = Date.parse('2026-10-11T12:00:00Z'), locale = 'en', slots = [], cursor = 0, dirty = false, effects = [], tree, props = { place: 'Rome' };
  const intervals = new Set(), resumes = new Set(), requests = [];
  class Clock extends Date { static now() { return now; } }
  const globals = { Date: Clock, Intl, navigator: { onLine: true }, document: { visibilityState: 'visible' }, window: { setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) } };
  const react = {
    useRef(value) { const at = cursor++; return slots[at] ||= { current: value }; },
    useState(initial) { const at = cursor++; slots[at] ||= { value: typeof initial === 'function' ? initial() : initial }; return [slots[at].value, next => { const value = typeof next === 'function' ? next(slots[at].value) : next; if (!Object.is(value, slots[at].value)) { slots[at].value = value; dirty = true; } }]; },
    useEffect(effect, deps) { const at = cursor++, old = slots[at]; if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) { slots[at] = { deps }; effects.push(() => { old?.cleanup?.(); slots[at].cleanup = effect(); }); } },
  };
  const helpers = load('mobile/src/lib/routeWeather.ts', {}, globals);
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, './Icon': { Icon: 'Icon' },
    '../lib/routeWeather': helpers,
    '../lib/localeFormatting': load('mobile/src/lib/localeFormatting.ts', { './locales/sq-regions': load('mobile/src/lib/locales/sq-regions.ts', {}, globals) }, globals),
    '../lib/api': { getWeather: (place, language) => new Promise((resolve, reject) => requests.push({ place, locale: language, resolve, reject })) },
    '../lib/accountResume': { onAccountResume: fn => { resumes.add(fn); return () => resumes.delete(fn); } },
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
  };
  let Component = load('mobile/src/components/RouteWeather.tsx', imports, globals).RouteWeather;
  const render = next => { if (next) props = next; for (let tries = 0; tries < 15; tries++) { cursor = 0; dirty = false; effects = []; tree = Component(props); effects.forEach(fn => fn()); if (!dirty) return tree; } throw Error('Unstable render'); };
  const dispose = () => slots.forEach(slot => slot?.cleanup?.());
  render();
  return { requests, helpers, globals, get tree() { return tree; }, render, dispose,
    async settle() { await tick(); return render(); },
    advance(ms) { now += ms; intervals.forEach(fn => fn()); return render(); },
    resume() { resumes.forEach(fn => fn()); return render(); },
    language(value) { locale = value; return render(); },
    reopen({ reload = false } = {}) { dispose(); slots = []; if (reload) Component = load('mobile/src/components/RouteWeather.tsx', imports, globals).RouteWeather; return render(); },
  };
}
const weather = (temperature = 20, place = 'Rome') => ({ place, temperature, windSpeed: 7, weatherCode: 1, description: 'Clear', min: 12, max: 22 });

test('Weather is dated, has manual refresh, expires after 30 minutes, and recovers on reconnect without hiding failure', async () => {
  const h = harness();
  try {
    assert.equal(h.requests.length, 0); button(h.tree).props.onClick(); await h.settle();
    assert.equal(button(h.tree).props.disabled, true); assert.equal(h.requests.length, 1);
    h.requests[0].resolve(weather()); await h.settle();
    assert.match(text(h.tree), /20°/); assert.doesNotMatch(text(h.tree), /Today/);
    assert.equal(nodes(h.tree).find(node => node.type === 'time').props.dateTime, '2026-10-11T12:00:00.000Z');
    assert.equal(text(button(h.tree)), ' Refresh weather');
    h.advance(h.helpers.ROUTE_WEATHER_TTL); await h.settle(); assert.equal(h.requests.length, 2);
    h.requests[1].reject(Error('offline')); await h.settle();
    assert.match(text(h.tree), /20°/); assert.match(text(h.tree), /may be out of date/); assert.match(text(h.tree), /could not be updated/);
    h.resume(); await h.settle(); h.requests[2].resolve(weather(25)); await h.settle();
    assert.match(text(h.tree), /25°/); assert.doesNotMatch(text(h.tree), /may be out of date|could not be updated/);
    button(h.tree).props.onClick(); await h.settle(); assert.equal(h.requests.length, 4, 'Manual refresh is available even inside the TTL');
    h.requests[3].resolve(weather(26)); await h.settle(); assert.match(text(h.tree), /26°/);
  } finally { h.dispose(); }
});

test('Reopening a stale weather card refreshes cached data; a full app reload never labels the old reading as current', async () => {
  const h = harness();
  try {
    button(h.tree).props.onClick(); await h.settle(); h.requests[0].resolve(weather()); await h.settle();
    h.globals.document.visibilityState = 'hidden'; h.advance(24 * 60 * 60_000);
    h.reopen(); await h.settle(); assert.equal(h.requests.length, 2); assert.match(text(h.tree), /out of date/);
    h.requests[1].resolve(weather(7)); await h.settle(); assert.match(text(h.tree), /7°/);
    h.reopen({ reload: true }); await h.settle(); assert.doesNotMatch(text(h.tree), /7°|20°/); assert.match(text(h.tree), /Show current weather/);
    button(h.tree).props.onClick(); await h.settle(); assert.equal(h.requests.length, 3);
    h.requests[2].resolve(weather(8)); await h.settle(); assert.match(text(h.tree), /8°/);
  } finally { h.dispose(); }
});

test('Weather locale/place changes reject late UI responses and failed initial fetch retries on resume', async () => {
  const h = harness();
  try {
    button(h.tree).props.onClick(); await h.settle(); h.language('sq');
    h.requests[0].resolve(weather(99, 'Previous language')); await h.settle(); assert.doesNotMatch(text(h.tree), /99°|Previous language/);
    button(h.tree).props.onClick(); await h.settle(); assert.equal(h.requests[1].locale, 'sq');
    h.requests[1].reject(Error('offline')); await h.settle(); assert.match(text(h.tree), /nuk u përditësua/);
    h.resume(); await h.settle(); h.requests[2].resolve(weather(10)); await h.settle(); assert.match(text(h.tree), /10°/);
    h.render({ place: 'Paris' }); assert.doesNotMatch(text(h.tree), /10°/);
    button(h.tree).props.onClick(); await h.settle(); assert.equal(h.requests[3].place, 'Paris');
    h.requests[3].resolve(weather(13, 'Paris')); await h.settle(); assert.match(text(h.tree), /Paris/);
  } finally { h.dispose(); }
});

test('Weather cache deduplicates requests and expires on date change even within its normal TTL', async () => {
  const h = harness();
  try {
    let calls = 0; const store = h.helpers.createRouteWeatherStore(async () => { calls++; return weather(); });
    const first = store.load('Rome', 'en'); assert.equal(first, store.load('Rome', 'en'));
    await first; assert.equal(calls, 1); assert.equal(store.peek('Rome', 'tr'), undefined);
    const beforeMidnight = { value: weather(), fetchedAt: new Date(2026, 9, 11, 23, 55).getTime() };
    assert.equal(h.helpers.staleRouteWeather(beforeMidnight, new Date(2026, 9, 12, 0, 5).getTime()), true);
    assert.equal(h.helpers.staleRouteWeather(beforeMidnight, beforeMidnight.fetchedAt + 5 * 60_000 - 1), false);
  } finally { h.dispose(); }
});
