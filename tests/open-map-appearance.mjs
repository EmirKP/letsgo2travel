import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = readFileSync(new URL('../mobile/src/lib/openMapAppearance.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, structuredClone });
const style = () => ({ version: 8, sources: { streets: { type: 'vector', tiles: ['fixture://tiles/{z}/{x}/{y}'] } }, layers: [
  { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
  { id: 'water', type: 'fill', source: 'streets', paint: { 'fill-color': '#bde' } },
  { id: 'building', type: 'fill', source: 'streets', paint: { 'fill-color': '#ddd' } },
  { id: 'road', type: 'line', source: 'streets', paint: { 'line-color': ['match', ['get', 'class'], 'primary', '#aaa', '#bbb'], 'line-width': 2 } },
  { id: 'names', type: 'symbol', source: 'streets', paint: {}, layout: { 'text-field': '{name}' } },
] });
const plain = value => JSON.parse(JSON.stringify(value));

test('Appearance is derived from the original provider style without mutating it', () => {
  const original = style(), before = JSON.stringify(original);
  const dark = exports.openMapAppearanceStyle(original, 'dark');
  assert.equal(dark.layers.find(layer => layer.id === 'water').paint['fill-color'], '#193e55');
  assert.equal(JSON.stringify(original), before);
  const light = exports.openMapAppearanceStyle(original, 'light');
  assert.deepEqual(plain(light.layers.find(layer => layer.id === 'road').paint['line-color']), original.layers.find(layer => layer.id === 'road').paint['line-color']);
});

test('Dark and light updates keep the map, sources, route layer and camera, and restore inherited paint properties', () => {
  const original = style(), route = { id: 'user-route', type: 'line', source: 'user-route', paint: { 'line-color': '#0868f8' } };
  const rendered = structuredClone(original);rendered.layers.push(route);const sources = rendered.sources, camera = { longitude: 2.35, latitude: 48.86, zoom: 16 }, changes = [];
  const map = { getStyle: () => structuredClone(rendered), setPaintProperty(id, property, value) {
    changes.push([id, property]);const layer = rendered.layers.find(item => item.id === id);layer.paint ||= {};
    if (value === undefined) delete layer.paint[property]; else layer.paint[property] = value;
  } };
  exports.applyOpenMapAppearance(map, original, 'dark');
  assert.equal(rendered.layers.find(layer => layer.id === 'names').paint['text-color'], '#d0dfed');
  const count = changes.length;exports.applyOpenMapAppearance(map, original, 'dark');assert.equal(changes.length, count, 'Applying the current colours is idempotent');
  exports.applyOpenMapAppearance(map, original, 'light');
  assert.equal(rendered.sources, sources);assert.equal(rendered.layers.at(-1), route);
  assert.deepEqual(camera, { longitude: 2.35, latitude: 48.86, zoom: 16 });
  assert.ok(!changes.some(([id]) => id === 'user-route'));
  assert.equal(rendered.layers.find(layer => layer.id === 'names').paint['text-color'], undefined);
  assert.deepEqual(rendered.layers.find(layer => layer.id === 'road').paint['line-color'], original.layers.find(layer => layer.id === 'road').paint['line-color']);
});

test('The actual canvas updates theme paint separately from map construction and handles a theme change before load', () => {
  const canvas = readFileSync(new URL('../mobile/src/components/UnifiedMapCanvas.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('UnifiedMapCanvas.tsx', canvas, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const effects = [];
  function visit(node) { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node);ts.forEachChild(node, visit); }
  visit(ast);
  const creation = effects.find(node => node.arguments[0].getText(ast).includes('new Map('));
  assert.ok(creation);assert.doesNotMatch(creation.arguments[1].getText(ast), /theme/);
  assert.match(creation.arguments[0].getText(ast), /openMapAppearanceStyle\(style,getThemeSnapshot\(\)\.resolved\)/);
  const appearance = effects.find(node => node.arguments[0].getText(ast).includes('applyOpenMapAppearance('));
  assert.match(appearance.arguments[1].getText(ast), /theme\.resolved/);assert.match(appearance.arguments[1].getText(ast), /ready/);
  const calls = [], context = { map: { current: { isStyleLoaded: () => true } }, originalStyle: { current: style() }, ready: 0, theme: { resolved: 'dark' }, applyOpenMapAppearance: (...args) => calls.push(args) };
  const effect = vm.runInNewContext(ts.transpileModule(`const effect=${appearance.arguments[0].getText(ast)};effect;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  effect();assert.equal(calls.length, 0);context.ready = 1;effect();assert.equal(calls.length, 1);assert.equal(calls[0][2], 'dark');
});
