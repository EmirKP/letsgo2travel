import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : !value || typeof value !== 'object' ? [] : [value, ...nodes(value.props?.children)];
const text = value => Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const source = ts.transpileModule(readFileSync(new URL('../../mobile/src/components/TravelMapDownloads.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const summary = (id = 'a', name = 'Paris') => ({ version: 1, id, name, center: { latitude: 48.86, longitude: 2.35 }, radiusKm: 1, createdAt: '2026-10-27T08:00:00.000Z', bytes: 1250000, resourceCount: 12, tileCount: 8, bounds: { north: 49, south: 48, east: 3, west: 2 } });
function harness(options = {}) {
  const state = { packs: options.packs || [], legacy: options.legacy || [], listFails: options.listFails || false, deleteFails: false, requests: [], reads: [], deletes: [], opens: [], legacyOpens: [] };
  let slots = [], cursor = 0, effects = [], dirty = false, tree;
  let props = { center: { latitude: 48.86, longitude: 2.35 }, places: [{ id: 'node/1', name: 'Museum' }], name: 'Paris', onOpenPack: value => state.opens.push(value), onOpenLegacy: value => state.legacyOpens.push(value) };
  const react = {
    useState(initial) { const at = cursor++; slots[at] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[at].value, value => { const next = typeof value === 'function' ? value(slots[at].value) : value; if (slots[at].value !== next) { slots[at].value = next; dirty = true; } }]; },
    useRef(value) { const at = cursor++; slots[at] ??= { current: value }; return slots[at]; },
    useId() { const at = cursor++; slots[at] ??= { value: `id-${at}` }; return slots[at].value; },
    useEffect(effect, deps) { const at = cursor++, old = slots[at]; if (!old || deps.some((item, index) => item !== old.deps[index])) { slots[at] = { deps }; effects.push(() => { old?.cleanup?.(); slots[at].cleanup = effect(); }); } },
  };
  const listeners = new Set();
  const api = {
    listOpenMapPacks: async () => { if (state.listFails) throw Error('storage_unavailable'); return [...state.packs]; },
    subscribeOpenMapPacks: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    readOpenMapPack: async id => { state.reads.push(id); return state.packs.find(pack => pack.id === id) ? { ...state.packs.find(pack => pack.id === id), places: [], style: {}, resources: [] } : null; },
    deleteOpenMapPack: async id => { state.deletes.push(id); if (state.deleteFails) throw Error('storage_unavailable'); state.packs = state.packs.filter(pack => pack.id !== id); listeners.forEach(listener => listener()); },
    downloadOpenMapRegion: input => new Promise((resolve, reject) => {
      const request = { input, reject, resolve: pack => { state.packs = [pack, ...state.packs.filter(previous => previous.id !== pack.id)]; listeners.forEach(listener => listener()); resolve(pack); } };
      state.requests.push(request); input.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }),
  };
  const out = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Date, Error, AbortController })(name => {
    if (name.endsWith('.css')) return {};
    const imports = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../../../lib/maps/open-map-resources': { OPEN_MAP_MAX_BYTES: 50000000 }, '../lib/openMapOffline': api, '../lib/offlineMaps': { readOfflineMaps: () => state.legacy }, '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en, locale: 'en' }) }, '../lib/localeFormatting': { formatAppDate: () => '27 Oct' }, './Icon': { Icon: 'Icon' } };
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  }, out, out.exports);
  const app = {
    state,
    render(nextProps = {}) { props = { ...props, ...nextProps }; for (let count = 0; count < 8; count++) { cursor = 0; effects = []; dirty = false; tree = out.exports.TravelMapDownloads(props); effects.forEach(effect => effect()); if (!dirty) return tree; } throw Error('Unstable downloads UI'); },
    async flush() { for (let count = 0; count < 3; count++) { await new Promise(resolve => setImmediate(resolve)); app.render(); } return tree; },
    button(label) { const button = nodes(tree).find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label)); assert.ok(button, label); return button; },
    click(label) { const button = app.button(label); assert.ok(!button.props.disabled, `${label} is disabled`); button.props.onClick(); app.render(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
    get tree() { return tree; },
  };
  app.render(); return app;
}

test('Offline downloads explain their contents and limits without starting a download or requesting GPS', async () => {
  const app = harness(); await app.flush();
  assert.match(text(app.tree), /street map and place snapshots/); assert.match(text(app.tree), /GPS can show your location/);
  assert.match(text(app.tree), /Live opening hours and new directions need internet/); assert.match(text(app.tree), /50 MB per region/);
  assert.match(text(app.tree), /Up to 3 regions/); assert.equal(app.state.requests.length, 0);
  for (const label of ['1 km', '2 km', '3 km']) assert.ok(app.button(label));
  app.dispose();
});

test('A region download captures the selected area, displays actual bytes, and exposes the completed persisted map', async () => {
  const app = harness(); await app.flush(); app.click('2 km'); app.click('Download this region');
  assert.equal(app.state.requests.length, 1); const request = app.state.requests[0];
  assert.equal(request.input.radiusKm, 2); assert.equal(request.input.name, 'Paris'); assert.equal(request.input.center.latitude, 48.86);
  assert.equal(request.input.places[0].id, 'node/1');
  request.input.onProgress(2300000, 24); app.render({ name: 'Rome', center: { latitude: 41.9, longitude: 12.5 } });
  assert.match(text(app.tree), /2.3 MB · 24 files/); assert.match(text(app.tree), /Paris/);
  const bar = nodes(app.tree).find(node => node.type === 'progress'); assert.equal(bar.props.value, 2300000); assert.equal(bar.props.max, 50000000);
  request.resolve({ ...summary('paris', 'Paris'), radiusKm: 2, bytes: 2400000 }); await app.flush();
  assert.match(text(app.tree), /Paris downloaded · 2.4 MB/);
  const row = nodes(app.tree).find(node => node.type === 'button' && node.props.className === 'tmd-open-pack'); assert.ok(row); row.props.onClick(); await app.flush();
  assert.deepEqual(app.state.reads, ['paris']); assert.equal(app.state.opens[0].id, 'paris'); app.dispose();
});

test('Cancellation and failed retry preserve previous maps and never claim success', async () => {
  const app = harness({ packs: [summary()] }); await app.flush(); app.click('Download this region'); app.click('Cancel'); await app.flush();
  assert.match(text(app.tree), /Download cancelled/); assert.equal(app.state.packs.length, 1); assert.doesNotMatch(text(app.tree), /Paris downloaded/);
  app.click('Download this region'); app.state.requests[1].reject(Error('area_too_large')); await app.flush();
  assert.match(text(app.tree), /exceeds 50 MB/); assert.equal(app.state.packs[0].id, 'a'); assert.ok(app.button('Retry download'));
  app.click('Retry download'); app.state.requests[2].resolve(summary('b', 'New region')); await app.flush();
  assert.equal(app.state.packs.length, 2); assert.match(text(app.tree), /New region downloaded/); app.dispose();
});

test('Downloaded-map deletion requires explicit confirmation and a failed delete can be retried', async () => {
  const app = harness({ packs: [summary()] }); await app.flush(); app.click('Remove download Paris');
  assert.equal(app.state.deletes.length, 0); assert.ok(nodes(app.tree).find(node => node.props?.role === 'alertdialog'));
  app.click('Cancel'); assert.equal(app.state.deletes.length, 0);
  app.click('Remove download Paris'); app.state.deleteFails = true; app.click('Remove download'); await app.flush();
  assert.equal(app.state.packs.length, 1); assert.match(text(app.tree), /could not be removed/);
  app.state.deleteFails = false; app.click('Remove download'); await app.flush();
  assert.equal(app.state.packs.length, 0); assert.match(text(app.tree), /saved places and notes are preserved/); app.dispose();
});

test('Three-region limits and unreadable storage block new downloads without hiding previous legacy maps', async () => {
  const legacy = { id: 'old', center: { latitude: 41.01, longitude: 28.97 }, downloadedAt: '2025-01-01T00:00:00.000Z', places: [{ id: 'node/1' }], roads: [] };
  const app = harness({ packs: [summary('a'), summary('b'), summary('c')], legacy: [legacy] }); await app.flush();
  assert.equal(app.button('Download this region').props.disabled, true); assert.match(text(app.tree), /All 3 regions are used/);
  const old = nodes(app.tree).find(node => node.type === 'button' && text(node).startsWith('41.01, 28.97')); old.props.onClick();
  assert.equal(app.state.legacyOpens[0], legacy); assert.equal(app.state.requests.length, 0); app.dispose();
  const unreadable = harness({ listFails: true, legacy: [legacy] }); await unreadable.flush();
  assert.equal(unreadable.button('Download this region').props.disabled, true); assert.match(text(unreadable.tree), /Existing downloads were not deleted/);
  assert.match(text(unreadable.tree), /Your previous maps/); unreadable.state.listFails = false; unreadable.click('Retry'); await unreadable.flush();
  assert.equal(unreadable.button('Download this region').props.disabled, false); unreadable.dispose();
});

test('Unmounting cancels an in-flight download and late completion cannot open a map or update the old screen', async () => {
  const app = harness(); await app.flush(); app.click('Download this region'); const request = app.state.requests[0];
  app.dispose(); assert.equal(request.input.signal.aborted, true); await Promise.resolve(); await Promise.resolve();
  assert.equal(app.state.opens.length, 0); assert.equal(app.state.packs.length, 0);
});
