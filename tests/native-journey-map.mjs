import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadCategory(path, imports = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL })(name => imports[name], output, output.exports);
  return output.exports;
}
const categories = loadCategory('mobile/src/components/journeyMapCategory.ts', { '../../../lib/travel-assistant/places': loadCategory('lib/travel-assistant/places.ts') });

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const clone = value => JSON.parse(JSON.stringify(value));
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children ?? '');
const labels = { map: 'Journey map', zoomIn: 'Zoom in', zoomOut: 'Zoom out', tilesUnavailable: 'Map unavailable. Use the list below.', retryTiles: 'Retry map', stop: (order, day, name) => `Day ${day}, stop ${order}: ${name}`, place: name => `Discover ${name}`, cluster: count => `Show ${count} places` };
const stops = [{ id: 'node/1', name: 'Museum', latitude: 41.9, longitude: 12.5, day: 1, order: 1 }, { id: 'node/2', name: 'Park', latitude: 41.91, longitude: 12.51, day: 2, order: 1 }];

function fixture(options = {}) {
  let currentFiber, theme = 'light', nextId = 0, nextFrame = 0, nextTimer = 0, nativeState = null, highestGeneration = -1;
  const deadlines = new Map(), retired = new Set();
  const calls = [], subscriptions = [], observers = [], mutations = [], frames = new Map(), themeListeners = new Set();
  const instances = [];
  const events = () => ({ listeners: new Map(), addEventListener(name, fn) { const items = this.listeners.get(name) ?? new Set(); items.add(fn); this.listeners.set(name, items); }, removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }, emit(name) { for (const fn of this.listeners.get(name) ?? []) fn(); } });
  const rect = (x, y, width, height) => ({ left: x, top: y, right: x + width, bottom: y + height, width, height });
  const element = box => ({ box, getBoundingClientRect() { return this.box; } });
  const panel = element(rect(0, 450, 400, 350));
  const topbar = element(rect(12, 12, 376, 44)), days = element(rect(12, 66, 376, 44)), search = element(rect(100, 130, 200, 44));
  const exit = element(rect(12, 12, 44, 44)), title = element(rect(62, 12, 180, 44)), save = element(rect(300, 12, 88, 44));
  let confirmation = null;
  const guide = {...element(rect(28,150,332,265)),closest:()=>null,style:{display:'block',visibility:'visible'}};
  let guideVisible = false;
  const sheet = {querySelectorAll: selector => selector === ':scope > .app-guide-card' && guideVisible ? [guide] : []};
  const workspace = { querySelector: selector => selector === '.mj-close-confirm' ? confirmation : selector === '.mj-panel' ? panel : null,
    querySelectorAll: selector => selector.includes('.mj-topbar > *') ? [exit, title, save, days, search] : [topbar, days, search] };
  const canvas = { ...element(rect(0, 0, 400, 800)), closest: selector => selector === '.sheet[role="dialog"]' ? sheet : workspace };
  const document = { ...events(), visibilityState: 'visible', documentElement: { clientWidth: 400 } };
  const window = { ...events(), innerWidth: 400, visualViewport: { ...events(), offsetLeft: 0, offsetTop: 0, width: 400 }, getComputedStyle: element => ({ borderTopLeftRadius: '20px',...element.style }),
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn) { const id = ++nextTimer; deadlines.set(id, fn); return id; }, clearTimeout(id) { deadlines.delete(id); } };
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => !Object.is(value, a[i]));
  const react = {
    useRef(value) { const i = currentFiber.cursor++; if (!currentFiber.slots[i]) currentFiber.slots[i] = { current: value }; return currentFiber.slots[i]; },
    useState(initial) { const fiber = currentFiber, i = fiber.cursor++; if (!fiber.slots[i]) fiber.slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [fiber.slots[i].value, next => { const value = typeof next === 'function' ? next(fiber.slots[i].value) : next; if (!Object.is(value, fiber.slots[i].value)) { fiber.slots[i].value = value; fiber.dirty = true; } }]; },
    useEffect(fn, dependencies) { const fiber = currentFiber, i = fiber.cursor++, old = fiber.slots[i]; if (!old || changed(old.dependencies, dependencies)) { fiber.slots[i] = { ...old, dependencies }; fiber.effects.push(() => { old?.cleanup?.(); fiber.slots[i].cleanup = fn(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const bridge = {
    async show(payload) { calls.push({ method: 'show', payload: clone(payload) }); if (options.show) await options.show(payload); if (retired.has(payload.sessionId) || payload.generation < highestGeneration) throw Error('Map session ended'); highestGeneration = payload.generation; nativeState = clone(payload); return { applied: true }; },
    async update(payload) { calls.push({ method: 'update', payload: clone(payload) }); if (options.update) await options.update(payload); assert.equal(nativeState?.sessionId, payload.sessionId, 'Update must belong to the actual native session'); nativeState = clone(payload); return { applied: true }; },
    async hide(payload) { calls.push({ method: 'hide', payload: clone(payload) }); if (options.hide) await options.hide(payload); retired.add(payload.sessionId); if (nativeState?.sessionId === payload.sessionId && nativeState.ownerId === payload.ownerId) nativeState = null; return { applied: true }; },
  };
  const fixtureModule = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/components/NativeJourneyMap.tsx', 'utf8'), { fileName: 'NativeJourneyMap.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { window, document,
    ResizeObserver: class { constructor(callback) { this.callback = callback; this.elements = new Set(); observers.push(this); } observe(value) { this.elements.add(value); } unobserve(value) { this.elements.delete(value); } disconnect() { this.disconnected = true; this.elements.clear(); } },
    MutationObserver: class { constructor(callback) {this.callback=callback;mutations.push(this);} observe(target,options){this.target=target;this.options=options;} disconnect(){this.disconnected=true;} },
  })(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === '../lib/capacitor') return {
      isIOSNative: () => true, plugin: () => options.missing ? undefined : bridge,
      async addPluginListener(plugin, event, callback) { const listener = { plugin, event, callback, removed: false, async remove() { this.removed = true; } }; subscriptions.push(listener); if (options.listener) await options.listener(plugin, event); return listener; },
    };
    if (name === '../lib/id') return { createId: () => `session-${++nextId}` };
    if (name === './journeyMapCategory') return categories;
    if (name === '../lib/i18n') return { useI18n: () => ({ copy: (_tr, en) => en }) };
    if (name === '../lib/theme') return { getThemeSnapshot: () => ({ resolved: theme }), subscribeTheme: fn => { themeListeners.add(fn); return () => themeListeners.delete(fn); } };
    if (name.endsWith('.css')) return {};
    throw Error(`Unknown fixture import: ${name}`);
  }, fixtureModule, fixtureModule.exports);
  const h = {
    calls, subscriptions, observers, mutations, document, window, canvas, panel, search, topbar, days, guide, sheet,
    showGuide(value=true) {guideVisible=value;mutations.forEach(observer=>{if(!observer.disconnected)observer.callback();});},
    confirm() { confirmation = element(rect(0, 0, 400, 800)); },
    get state() { return nativeState; },
    mount(extra = {}) {
      const fiber = { slots: [], cursor: 0, effects: [], dirty: false, mounted: true, props: { center: { latitude: 41.9, longitude: 12.5 }, stops, labels, contentInsets: { top: 120, left: 0, right: 0, bottom: 350 }, onSelectPlace() {}, ...extra }, tree: null,
        render(next = {}) { if (!this.mounted) return; this.props = { ...this.props, ...next }; for (let i = 0; i < 10; i++) { currentFiber = fiber; this.cursor = 0; this.effects = []; this.dirty = false; this.tree = fixtureModule.exports.NativeJourneyMap(this.props); for (const node of nodes(this.tree)) if (node.props.ref) node.props.ref.current = canvas; this.effects.forEach(fn => fn()); if (!this.dirty) return; } throw Error('Unbounded render'); },
        unmount() { this.mounted = false; this.slots.forEach(slot => slot.cleanup?.()); },
      };
      instances.push(fiber); fiber.render(); return fiber;
    },
    async flush() { for (let i = 0; i < 6; i++) { await tick(); for (const app of instances) if (app.mounted && app.dirty) app.render(); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); } },
    emit(event, value, includeRemoved = false) { for (const listener of subscriptions) if (listener.event === event && (includeRemoved || !listener.removed)) listener.callback(value); },
    theme(value) { theme = value; themeListeners.forEach(fn => fn()); },
    expireCalls() { const callbacks = [...deadlines.values()]; deadlines.clear(); callbacks.forEach(fn => fn()); },
  };
  return h;
}

test('Native frame stops above the mobile panel, leaves HTML holes and sends actual path geometry unchanged', async () => {
  const h = fixture(), routes = [{ id: 'real', day: 1, coordinates: [[41.9, 12.5], [41.9005, 12.504], [41.91, 12.51]] }];
  h.mount({ routes }); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'show').length, 1);
  assert.equal(h.state.frame.height, 450); assert.equal(h.state.contentInsets.bottom, 84);
  assert.equal(h.state.occlusions.length, 5); assert.equal(h.state.showSearchArea, false);
  assert.ok(!h.state.occlusions.some(hole => hole.width === 376 && hole.y === 12), 'Transparent header gaps must remain native map, not pale WebView rectangles');
  assert.deepEqual(h.state.routes, routes); assert.equal(h.state.stops[0].label, 'Day 1, stop 1: Museum');
  assert.equal(h.state.labels.cluster, 'Show {count} places');
  assert.ok(h.observers[0].elements.has(h.panel));
  h.panel.box.top = 280; h.observers[0].callback(); await h.flush();
  assert.equal(h.state.frame.height, 280); assert.equal(h.calls.at(-1).method, 'update');
});

test('Native payload carries canonical category symbols and accessible labels while retaining real stop order and source fields', async () => {
  const h = fixture();
  const discoveredPlaces = ['museum', 'restaurant', 'cafe', 'atm', 'bank', 'transit'].map((category, i) => ({ id: `category-${i}`, category, name: `Real ${category}`, latitude: 41.9, longitude: 12.5 }));
  const app = h.mount({ stops: [{ ...stops[0], category: 'museum', order: 4 }], discoveredPlaces }); await h.flush();
  assert.equal(new Set(h.state.discoveredPlaces.map(point => point.categorySymbol)).size, 6);
  assert.equal(h.state.discoveredPlaces[5].categorySymbol, 'tram.fill');
  assert.equal(h.state.discoveredPlaces[5].categoryLabel, 'Metro and public transport');
  assert.match(h.state.discoveredPlaces[5].label, /Real transit · Metro and public transport/);
  assert.equal(h.state.stops[0].order, 4); assert.match(h.state.stops[0].label, /Day 1, stop 4: Museum · Museum/);
  app.unmount(); await h.flush();
});

test('Narrow desktop panel becomes a tap-through hole and viewport offsets use one CSS coordinate space', async () => {
  const h = fixture(); h.canvas.box.width = 1000; h.canvas.box.right = 1000;
  h.window.visualViewport.width = 1000; h.window.visualViewport.offsetTop = 20;
  h.panel.box = { left: 700, top: 150, width: 280, height: 600, right: 980, bottom: 750 };
  h.mount({ contentInsets: { top: 100, left: 0, right: 300, bottom: 0 } }); await h.flush();
  assert.equal(h.state.frame.height, 800); assert.equal(h.state.frame.y, -20);
  assert.equal(h.state.occlusions.length, 6); assert.equal(h.state.occlusions[5].y, 130);
  assert.equal(h.state.contentInsets.right, 300);
});

test('Native bridge preserves per-leg walking paths beyond fourteen routes and does not truncate detailed geometry', async () => {
  const h = fixture();
  const routes = Array.from({ length: 119 }, (_, index) => ({ id: `leg-${index}`, day: index % 14 + 1, coordinates: [[41.9, 12.5], [41.901, 12.501]] }));
  routes.push({ id: 'detailed', day: 14, coordinates: Array.from({ length: 20_000 }, (_, index) => [41.9 + index / 1_000_000, 12.5 + index / 1_000_000]) });
  const app = h.mount({ routes }); await h.flush();
  assert.equal(h.state.routes.length, 120);
  assert.equal(h.state.routes.at(-1).coordinates.length, 20_000);
  assert.deepEqual(h.state.routes.at(-1).coordinates.at(-1), routes.at(-1).coordinates.at(-1));
  app.unmount(); await h.flush();
});

test('A delayed previous show is hidden before the successor shows; stale events and cleanup cannot touch its account', async () => {
  const pending = deferred(); let count = 0;
  const h = fixture({ show: () => ++count === 1 ? pending.promise : undefined });
  const selected = [];
  const first = h.mount({ ownerId: 'first', onSelectPlace: point => selected.push(point.id) }); await h.flush();
  const firstSession = h.calls[0].payload.sessionId;
  first.unmount(); const second = h.mount({ ownerId: 'second', onSelectPlace: point => selected.push(`second:${point.id}`) }); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'show').length, 1);
  h.emit('placeSelected', { sessionId: firstSession, id: 'node/1', kind: 'stop' }, true); assert.deepEqual(selected, []);
  pending.resolve(); await h.flush();
  assert.equal(h.state.ownerId, 'user:second'); assert.notEqual(h.state.sessionId, firstSession);
  const lastShow = h.calls.findLastIndex(call => call.method === 'show');
  assert.ok(h.calls.slice(1, lastShow).some(call => call.method === 'hide' && call.payload.sessionId === firstSession));
  h.emit('placeSelected', { sessionId: h.state.sessionId, id: 'node/1', kind: 'stop' }); assert.deepEqual(selected, ['second:node/1']);
  h.emit('placeSelected', { sessionId: h.state.sessionId, id: 'forged', kind: 'stop' }); assert.equal(selected.length, 1);
  second.unmount(); await h.flush(); assert.equal(h.state, null);
  assert.ok(h.subscriptions.every(listener => listener.removed));
});

test('In-flight updates coalesce to the latest props and theme without duplicate remounts', async () => {
  const pending = deferred(); let count = 0;
  const h = fixture({ update: () => ++count === 1 ? pending.promise : undefined });
  const app = h.mount(); await h.flush();
  app.render({ activeDay: 1 }); await h.flush();
  app.render({ activeDay: 2 }); app.render({ activeDay: null, selectedPlaceId: 'node/2' }); h.theme('dark'); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'update').length, 1);
  pending.resolve(); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'update').length, 2);
  assert.equal(h.state.activeDay, null); assert.equal(h.state.selectedPlaceId, 'node/2'); assert.equal(h.state.theme, 'dark');
  assert.equal(h.calls.filter(call => call.method === 'show').length, 1);
});

test('Native failure removes the overlay, shows a localized retry and retries using a fresh session', async () => {
  const h = fixture(), app = h.mount(); await h.flush(); const failed = h.state.sessionId;
  h.emit('mapError', { sessionId: failed, code: 'map_loading_failed' }); await h.flush();
  assert.equal(h.state, null); assert.ok(text(app.tree).includes(labels.tilesUnavailable));
  nodes(app.tree).find(node => node.type === 'button').props.onClick(); await h.flush();
  assert.ok(h.state); assert.notEqual(h.state.sessionId, failed);
  h.emit('mapError', { sessionId: failed, code: 'map_loading_failed' }, true); await h.flush(); assert.ok(h.state);
  const missing = fixture({ missing: true }); const absent = missing.mount(); await missing.flush();
  assert.equal(missing.calls.length, 0); assert.ok(text(absent.tree).includes(labels.tilesUnavailable));
});

test('Hidden app retires its map and returns with a fresh session; late listener registrations are cleaned up', async () => {
  const h = fixture(), app = h.mount(); await h.flush(); const original = h.state.sessionId;
  h.document.visibilityState = 'hidden'; h.document.emit('visibilitychange'); await h.flush(); assert.equal(h.state, null);
  h.document.visibilityState = 'visible'; h.document.emit('visibilitychange'); await h.flush(); assert.notEqual(h.state.sessionId, original);
  app.unmount(); await h.flush(); assert.equal(h.state, null);
  const pending = deferred(), late = fixture({ listener: () => pending.promise }), editor = late.mount(); editor.unmount();
  pending.resolve(); await late.flush(); assert.ok(late.subscriptions.every(listener => listener.removed));
  assert.equal(late.calls.filter(call => call.method === 'show').length, 0);
});

test('Viewport callbacks reject malformed coordinates and selections honor the current day', async () => {
  const seen = [], selected = [], h = fixture();
  const app = h.mount({ activeDay: 1, onViewportChange: value => seen.push(value), onSelectPlace: point => selected.push(point.id) }); await h.flush();
  const sessionId = h.state.sessionId;
  h.emit('viewportChanged', { sessionId, center: { latitude: '41', longitude: 12 }, bounds: { north: 42, south: 40, east: 13, west: 11 }, zoom: 14 });
  assert.equal(seen.length, 0);
  h.emit('viewportChanged', { sessionId, center: { latitude: 41, longitude: 12 }, bounds: { north: 42, south: 40, east: 13, west: 11 }, zoom: 14 });
  assert.equal(seen.length, 1);
  h.emit('placeSelected', { sessionId, id: 'node/2', kind: 'stop' }); assert.equal(selected.length, 0);
  app.render({ activeDay: 2 }); await h.flush(); h.emit('placeSelected', { sessionId, id: 'node/2', kind: 'stop' }); assert.deepEqual(selected, ['node/2']);
});

test('A hung bridge call times out without blocking later editors and a late old show cannot replace them', async () => {
  const pending = deferred(); let count = 0;
  const h = fixture({ show: () => ++count === 1 ? pending.promise : undefined });
  const first = h.mount({ ownerId: 'first' }); await h.flush();
  const oldGeneration = h.calls[0].payload.generation;
  h.expireCalls(); await h.flush(); assert.ok(text(first.tree).includes(labels.tilesUnavailable));
  first.unmount(); h.mount({ ownerId: 'second' }); await h.flush();
  assert.equal(h.state.ownerId, 'user:second'); assert.ok(h.state.generation > oldGeneration);
  const current = h.state.sessionId;
  pending.resolve(); await h.flush(); assert.equal(h.state.sessionId, current);
});

test('All 750 unique places from three route discovery areas reach the native renderer, including photo metadata', async () => {
  const discoveredPlaces = Array.from({ length: 750 }, (_, index) => ({ id: `node/${index + 100}`, name: `Place ${index}`, latitude: 41.9 + index / 100000, longitude: 12.5,
    ...(index === 749 ? { imageUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Place.jpg/320px-Place.jpg' } : {}) }));
  const h = fixture(); h.mount({ discoveredPlaces }); await h.flush();
  assert.equal(h.state.discoveredPlaces.length, 750);
  assert.equal(h.state.discoveredPlaces[749].imageUrl, discoveredPlaces[749].imageUrl);
  assert.equal(h.state.discoveredPlaces[749].label, 'Discover Place 749');
});

test('Unsaved-change confirmation masks the entire native surface so the dialog remains visible and tappable',async()=>{
  const h=fixture(),app=h.mount();await h.flush();
  h.confirm();app.render();await h.flush();
  assert.equal(h.state.occlusions.length,1);
  assert.equal(h.state.occlusions[0].width,400);assert.equal(h.state.occlusions[0].height,800);
  app.unmount();await h.flush();
});

test('A visible guide card in this sheet remains above native MapKit and follows independent move, resize and removal',async()=>{
  const h=fixture(),app=h.mount();await h.flush();
  const ordinary=clone(h.state.occlusions);
  assert.equal(h.mutations[0].target,h.sheet,'Observe the editor sheet, never the entire document');
  assert.equal(h.mutations[0].options.subtree,true);
  h.showGuide();await h.flush();
  assert.equal(h.state.occlusions.length,ordinary.length+1);
  assert.deepEqual(h.state.occlusions[0],{x:28,y:150,width:332,height:265,radius:20});
  assert.ok(h.observers[0].elements.has(h.guide));
  h.guide.box.top=180;h.guide.box.bottom=445;h.mutations[0].callback();await h.flush();
  assert.equal(h.state.occlusions[0].y,180,'An absolutely-positioned lesson moves without resizing its parent');
  h.guide.box.height=210;h.observers[0].callback();await h.flush();assert.equal(h.state.occlusions[0].height,210);
  h.guide.style.visibility='hidden';h.mutations[0].callback();await h.flush();assert.deepEqual(h.state.occlusions,ordinary);
  h.guide.style.visibility='visible';h.showGuide(false);await h.flush();
  assert.deepEqual(h.state.occlusions,ordinary);assert.ok(!h.observers[0].elements.has(h.guide));
  app.unmount();await h.flush();assert.ok(h.mutations.every(observer=>observer.disconnected));
});
