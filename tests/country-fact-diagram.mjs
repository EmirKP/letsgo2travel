import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props, key });
let nextId = 0;
const clockModule = { exports: {} };
const clockSource = ts.transpileModule(readFileSync('mobile/src/lib/countryFactClock.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(`(function(module,exports){${clockSource}\n})`, { Intl, Date, Number })(clockModule, clockModule.exports);
const { countryFactClockHands, countryFactClockTime } = clockModule.exports;
const imports = { react: { useId: () => `diagram-${++nextId}` }, 'react/jsx-runtime': { jsx, jsxs: jsx }, '../lib/countryFactClock': clockModule.exports, './country-fact-diagram.css': {} };
const fixtureModule = { exports: {} };
const source = ts.transpileModule(readFileSync('mobile/src/components/CountryFactDiagram.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Intl, Date, Number, String, Set })(name => {
  assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name];
}, fixtureModule, fixtureModule.exports);
const { CountryFactDiagram } = fixtureModule.exports;
function render(node) {
  if (Array.isArray(node)) return node.map(render);
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return render(node.type(node.props));
  return { ...node, props: { ...node.props, children: render(node.props?.children) } };
}
const diagram = props => render(CountryFactDiagram(props));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const find = (node, predicate) => nodes(node).find(predicate);
const contact = (node, name) => find(node, node => node.props?.['data-contact'] === name);
const clone = value => JSON.parse(JSON.stringify(value));
const text = node => Array.isArray(node) ? node.map(text).join('') : typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props ? text(node.props.children) : '';
const socketFor = type => find(diagram({ kind: 'plugs', plugTypes: [type] }), node => node.props?.['data-socket-type'] === type);
const center = node => ({ x: Number(node.props.cx), y: Number(node.props.cy) });
const nearlyEqual = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .001, message);
function rectAxis(node) {
  const x = Number(node.props.x) + Number(node.props.width) / 2;
  const top = Number(node.props.y), bottom = top + Number(node.props.height);
  const rotation = node.props.transform?.match(/^rotate\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)$/);
  assert.ok(!node.props.transform || rotation, 'A slot uses a supported rotation so its actual orientation can be checked');
  const [angle, pivotX, pivotY] = rotation ? rotation.slice(1).map(Number) : [0, x, (top + bottom) / 2];
  const radians = angle * Math.PI / 180;
  const rotate = y => ({ x: pivotX + (x - pivotX) * Math.cos(radians) - (y - pivotY) * Math.sin(radians), y: pivotY + (x - pivotX) * Math.sin(radians) + (y - pivotY) * Math.cos(radians) });
  return { top: rotate(top), bottom: rotate(bottom), angle };
}

// Topology follows Electrical Safety First's country guides; the illustration
// distinguishes a socket's projecting E earth pin from F perimeter contacts.
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/france/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/thailand/
test('Socket diagrams preserve real contact topology for every supported type instead of sharing a generic plug icon', () => {
  const allTypes = Array.from({ length: 15 }, (_, index) => String.fromCharCode(65 + index));
  const tree = diagram({ kind: 'plugs', plugTypes: allTypes });
  const sockets = nodes(tree).filter(node => node.props?.['data-socket-type']);
  assert.deepEqual(sockets.map(node => node.props['data-socket-type']), allTypes);
  const socket = type => sockets.find(node => node.props['data-socket-type'] === type);
  for (const type of ['A', 'B']) {
    const slots = nodes(contact(socket(type), 'power-slots')).filter(node => node.type === 'rect');
    assert.equal(slots.length, 2);assert.ok(slots.every(node => Number(node.props.height) > Number(node.props.width)));
  }
  assert.ok(contact(socket('B'), 'earth-hole'));assert.equal(contact(socket('A'), 'earth-hole'), undefined);
  for (const type of ['C', 'E', 'F', 'O']) assert.equal(nodes(contact(socket(type), 'power-holes')).filter(node => node.type === 'circle').length, 2);
  assert.ok(contact(socket('E'), 'earth-pin'));assert.equal(contact(socket('E'), 'earth-hole'), undefined);
  assert.equal(nodes(contact(socket('F'), 'earth-clips')).filter(node => node.type === 'path').length, 2);assert.equal(contact(socket('F'), 'earth-hole'), undefined);
  const g = nodes(contact(socket('G'), 'rectangular-earth-and-power')).filter(node => node.type === 'rect');
  assert.equal(g.length, 3);const earth = g.find(node => node.props['data-contact-role'] === 'earth'), power = g.filter(node => node.props['data-contact-role'] === 'power');
  assert.ok(Number(earth.props.height) > Number(earth.props.width));assert.ok(power.every(node => Number(node.props.width) > Number(node.props.height)));
  assert.ok(power.every(node => Number(node.props.y) > Number(earth.props.y)));
  const l = nodes(contact(socket('L'), 'inline-round-holes')).filter(node => node.type === 'circle');
  assert.equal(l.length, 3);assert.equal(new Set(l.map(node => node.props.cy)).size, 1);
  assert.equal(l[1].props['data-contact-role'], 'earth');
  const oPower = nodes(contact(socket('O'), 'power-holes')).filter(node => node.type === 'circle'), oEarth = contact(socket('O'), 'earth-hole');
  assert.ok(oPower.every(node => Number(oEarth.props.cy) > Number(node.props.cy)), 'O is a triangle, not an inline L socket');
});

// New faces are schematic socket recognition aids, not dimensional drawings or
// proof of adaptor compatibility. Contact topology was reviewed against ESF's
// country guides and their linked socket artwork (checked 2026-10-21):
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/india/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/australia/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/israel/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/switzerland/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/brazil/
// https://www.electricalsafetyfirst.org.uk/safety-advice/travel-advice/denmark/
test('D and M show three round triangular contacts with a larger earth above the power pair, and M is larger than D', () => {
  const contacts = {};
  for (const type of ['D', 'M']) {
    const holes = nodes(contact(socketFor(type), 'round-earth-above-power')).filter(node => node.type === 'circle');
    assert.equal(holes.length, 3);
    const earth = holes.find(node => node.props['data-contact-role'] === 'earth');
    assert.ok(earth);
    const powers = holes.filter(node => node !== earth).sort((a, b) => Number(a.props.cx) - Number(b.props.cx));
    assert.equal(powers.length, 2);
    assert.equal(Number(powers[0].props.cy), Number(powers[1].props.cy));
    nearlyEqual(Number(earth.props.cx), (Number(powers[0].props.cx) + Number(powers[1].props.cx)) / 2, `${type} earth is centered over the two power contacts`);
    assert.ok(powers.every(node => Number(earth.props.cy) < Number(node.props.cy) && Number(earth.props.r) > Number(node.props.r)));
    contacts[type] = { earth, powers };
  }
  assert.ok(Number(contacts.M.earth.props.r) > Number(contacts.D.earth.props.r));
  assert.ok(contacts.M.powers.every((node, index) => Number(node.props.r) > Number(contacts.D.powers[index].props.r)));
});

test('H shows a modern three-round-contact Y arrangement with the centered earth below the power pair', () => {
  const group = contact(socketFor('H'), 'round-y-holes');
  const holes = nodes(group).filter(node => node.type === 'circle');
  assert.equal(holes.length, 3);
  const earth = holes.find(node => node.props['data-contact-role'] === 'earth');
  assert.ok(earth);
  const powers = holes.filter(node => node !== earth).map(center).sort((a, b) => a.x - b.x);
  assert.equal(powers[0].y, powers[1].y);
  assert.ok(powers[0].x < Number(earth.props.cx) && powers[1].x > Number(earth.props.cx));
  nearlyEqual(Number(earth.props.cx), (powers[0].x + powers[1].x) / 2, 'H earth forms the stem of the Y');
  assert.ok(Number(earth.props.cy) > powers[0].y);
  assert.equal(new Set(holes.map(node => Number(node.props.r))).size, 1);
  assert.equal(nodes(group).filter(node => node.type === 'rect').length, 0, 'This depicts the modern round-hole variant, not old flat-pin acceptance');
});

test('I uses two opposed flat slots with their upper ends toward the center and a separate vertical earth below', () => {
  const slots = nodes(contact(socketFor('I'), 'angled-power-slots')).filter(node => node.type === 'rect');
  assert.equal(slots.length, 3);
  const earth = slots.find(node => node.props['data-contact-role'] === 'earth');
  assert.ok(earth);
  const powers = slots.filter(node => node !== earth).sort((a, b) => Number(a.props.x) - Number(b.props.x));
  assert.equal(powers.length, 2);
  assert.ok(slots.every(node => Number(node.props.height) > Number(node.props.width)), 'I contacts are flat vertical/angled slots, not round holes');
  const left = rectAxis(powers[0]), right = rectAxis(powers[1]), ground = rectAxis(earth);
  assert.ok(left.top.x > left.bottom.x && right.top.x < right.bottom.x, 'With earth down, the upper ends converge; flipping both rotations draws the wrong socket');
  assert.ok(Math.abs(left.angle) > 0 && Math.abs(left.angle) < 90);
  nearlyEqual(left.angle, -right.angle, 'I power slots are oppositely angled');
  nearlyEqual(ground.top.x, ground.bottom.x, 'I earth is vertical');
  assert.ok(ground.top.y > Math.max(left.bottom.y, right.bottom.y));
  assert.ok(ground.top.x > left.top.x && ground.top.x < right.top.x);
});

test('J and N have round power pairs and centered off-line earth contacts at distinct depths', () => {
  const offsets = {};
  for (const type of ['J', 'N']) {
    const holes = nodes(contact(socketFor(type), 'offset-round-earth')).filter(node => node.type === 'circle');
    assert.equal(holes.length, 3);
    const earth = holes.find(node => node.props['data-contact-role'] === 'earth');
    assert.ok(earth);
    const powers = holes.filter(node => node !== earth).map(center).sort((a, b) => a.x - b.x);
    assert.equal(powers[0].y, powers[1].y);
    assert.ok(powers[1].x > powers[0].x);
    nearlyEqual(Number(earth.props.cx), (powers[0].x + powers[1].x) / 2, `${type} ground is centered between the power pair`);
    assert.ok(Number(earth.props.cy) > powers[0].y, `${type} is not an inline L socket`);
    offsets[type] = (Number(earth.props.cy) - powers[0].y) / (powers[1].x - powers[0].x);
    assert.equal(new Set(holes.map(node => Number(node.props.r))).size, 1);
  }
  assert.ok(offsets.J > offsets.N, 'J and N must not be represented by interchangeable identical faces: J has the greater earth offset');
});

test('K retains two round power contacts and a distinct flat-topped half-round earth aperture underneath', () => {
  const group = contact(socketFor('K'), 'danish-earth');
  const powers = nodes(group).filter(node => node.type === 'circle').map(center).sort((a, b) => a.x - b.x);
  assert.equal(powers.length, 2);
  assert.equal(powers[0].y, powers[1].y);
  const earth = find(group, node => node.props?.['data-contact-role'] === 'earth');
  assert.equal(earth?.type, 'path', 'A third round hole loses the Danish earth contact shape');
  const segments = earth.props.d.match(/[a-z][^a-z]*/gi).map(segment => ({ command: segment[0], args: (segment.slice(1).match(/[-+]?(?:\d*\.\d+|\d+)/g) || []).map(Number) }));
  assert.deepEqual(segments.map(segment => segment.command), ['M', 'h', 'v', 'a', 'z']);
  const [start, flat, side, arc] = segments.map(segment => segment.args);
  assert.ok(start[1] > powers[0].y && flat[0] > 0 && side[0] >= 0);
  nearlyEqual(start[0] + flat[0] / 2, (powers[0].x + powers[1].x) / 2, 'K earth is centered below the round pair');
  nearlyEqual(arc[0] * 2, flat[0], 'Earth curve spans the flat top width');
  nearlyEqual(arc[0], arc[1], 'Earth uses a semicircular lower edge');
  assert.deepEqual(arc.slice(2, 5), [0, 0, 1]);
  nearlyEqual(arc[5], -flat[0], 'Earth curve returns to the left edge');
  assert.equal(arc[6], 0);
});

test('Unsupported, missing and duplicate plug inputs cannot manufacture an illustrated country fact', () => {
  assert.equal(diagram({ kind: 'plugs' }), null);assert.equal(diagram({ kind: 'plugs', plugTypes: ['?', 'XX'] }), null);
  const tree = diagram({ kind: 'plugs', plugTypes: [' f ', 'F', 'C', 'unknown'] });
  assert.deepEqual(nodes(tree).filter(node => node.props?.['data-socket-type']).map(node => node.props['data-socket-type']), ['F', 'C']);
});

test('Left and right driving illustrations place the forward car and arrow on the matching road side', () => {
  for (const side of ['left', 'right']) {
    const tree = diagram({ kind: 'driving', drivingSide: side });
    const forward = find(tree, node => node.props?.['data-forward-lane'] === side), opposing = find(tree, node => node.props?.['data-opposing-lane']);
    assert.ok(forward);assert.ok(opposing);
    const car = find(forward, node => node.props?.['data-car-direction'] === 'up');
    const x = Number(car.props.transform.match(/translate\((\d+)/)[1]);
    assert.equal(x > 84, side === 'right');
    assert.ok(find(forward, node => node.props?.['data-arrow-direction'] === 'up'));
    assert.ok(find(opposing, node => node.props?.['data-car-direction'] === 'down'));
    assert.ok(find(opposing, node => node.props?.['data-arrow-direction'] === 'down'));
    assert.equal(opposing.props['data-opposing-lane'], side === 'left' ? 'right' : 'left');
  }
  assert.equal(diagram({ kind: 'driving' }), null);
});

test('Clock faces show provided device and destination times, including minute progress, and never invent a missing time', () => {
  assert.deepEqual(clone(countryFactClockHands({ hour: 13, minute: 30 })), { hour: 45, minute: 180 });
  assert.deepEqual(clone(countryFactClockHands({ hour: 0, minute: 0 })), { hour: 0, minute: 0 });
  for (const clock of [undefined, { hour: 24, minute: 0 }, { hour: -1, minute: 0 }, { hour: 12, minute: 60 }, { hour: 12.5, minute: 10 }]) assert.equal(countryFactClockHands(clock), null);
  assert.equal(diagram({ kind: 'time', deviceClock: { hour: 10, minute: 15 } }), null);
  const tree = diagram({ kind: 'time', deviceClock: { hour: 10, minute: 15 }, targetClock: { hour: 13, minute: 45 }, deviceLabel: 'Device', targetLabel: 'Tokyo' });
  assert.match(text(tree), /Device10:15Tokyo13:45/);
  const clocks = nodes(tree).filter(node => node.type === 'svg');assert.equal(clocks.length, 2);
  assert.equal(find(clocks[0], node => node.props?.['data-clock-hand'] === 'hour').props.transform, 'rotate(307.5)');
  assert.equal(find(clocks[1], node => node.props?.['data-clock-hand'] === 'minute').props.transform, 'rotate(270)');
});

test('Machine clock parts use the requested zone and daylight saving rules without guessing an invalid zone', () => {
  assert.deepEqual(clone(countryFactClockTime('Europe/London', Date.parse('2026-07-01T12:15:00Z'))), { hour: 13, minute: 15 });
  assert.deepEqual(clone(countryFactClockTime('Europe/London', Date.parse('2026-12-01T12:15:00Z'))), { hour: 12, minute: 15 });
  assert.deepEqual(clone(countryFactClockTime('Asia/Kathmandu', Date.parse('2026-07-01T00:00:00Z'))), { hour: 5, minute: 45 });
  assert.deepEqual(clone(countryFactClockTime('UTC', Date.parse('2026-07-01T00:00:00Z'))), { hour: 0, minute: 0 });
  assert.equal(countryFactClockTime(''), null);assert.equal(countryFactClockTime('Mars/Unknown'), null);assert.equal(countryFactClockTime('UTC', NaN), null);
});

test('Multiple diagram instances keep their paint IDs independent and require no external image, navigation or network resource', () => {
  const trees = [diagram({ kind: 'plugs', plugTypes: ['C', 'F'] }), diagram({ kind: 'plugs', plugTypes: ['C', 'F'] })];
  const ids = trees.map(tree => nodes(tree).map(node => node.props?.id).filter(Boolean));
  assert.equal(new Set(ids.flat()).size, ids.flat().length);
  for (const tree of trees) assert.equal(nodes(tree).some(node => ['image', 'a', 'iframe'].includes(node.type)), false);
});
