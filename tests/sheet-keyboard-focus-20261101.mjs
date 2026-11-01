import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const lineage = element => {
  const result = [];
  for (let current = element; current; current = current.parentElement) result.push(current);
  return result;
};

// Layout is deliberately nonzero even below a closed details element, matching
// the browser-reproduced case. Native sequential focus and programmatic focus
// are separate: a hidden details descendant cannot actually accept focus.
class Element extends EventTarget {
  constructor(tag, attributes = {}, children = []) {
    super(); this.tagName = tag.toUpperCase(); this.attributes = new Map(Object.entries(attributes));
    this.children = []; this.parentElement = null; this.isConnected = true;
    this.rects = 1; this.visibility = 'visible'; children.forEach(child => this.append(child));
  }
  append(child) { child.parentElement = this; child.document = this.document; this.children.push(child); return child; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  get inert() { return this.hasAttribute('inert'); }
  set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  get tabIndex() {
    if (this.hasAttribute('tabindex')) return Number(this.getAttribute('tabindex'));
    return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(this.tagName)
      || this.tagName === 'A' && this.hasAttribute('href') ? 0 : -1;
  }
  contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
  getClientRects() { return Array.from({ length: this.rects }, () => ({})); }
  matches(selector) {
    return selector.split(',').some(part => {
      const value = part.trim();
      if (value === ':disabled') {
        if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName)) return false;
        if (this.hasAttribute('disabled')) return true;
        for (let node = this.parentElement; node; node = node.parentElement) if (node.tagName === 'FIELDSET' && node.hasAttribute('disabled')) {
          const legend = node.children.find(child => child.tagName === 'LEGEND');
          if (!legend?.contains(this)) return true;
        }
        return false;
      }
      if (value.startsWith('.sheet-header ')) return this.matches(value.slice(14)) && Boolean(this.closest('.sheet-header'));
      if (value.startsWith('.')) return (this.getAttribute('class') || '').split(' ').includes(value.slice(1));
      const tag = value.match(/^[a-z]+/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const notDisabled = value.includes(':not([disabled])');
      if (notDisabled && this.hasAttribute('disabled')) return false;
      const attrs = value.replace(':not([disabled])', '').matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g);
      for (const [, name, expected] of attrs) if (!this.hasAttribute(name) || expected !== undefined && this.getAttribute(name) !== expected) return false;
      return Boolean(tag || value.startsWith('['));
    });
  }
  closest(selector) { return lineage(this).find(node => node.matches(selector)) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {
    for (const node of lineage(this)) {
      if (node.hasAttribute('hidden') || node.inert || !node.rects || ['hidden', 'collapse'].includes(node.visibility)) return;
      if (node.tagName === 'DETAILS' && !node.hasAttribute('open')) {
        const summary = node.children.find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(this)) return;
      }
    }
    if (!this.matches(':disabled')) this.document.activeElement = this;
  }
}
const node = (tag, attributes = {}, children = []) => new Element(tag, attributes, children);
function load(file, imports, globals) {
  const output = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, globals)((name) => { assert.ok(Object.hasOwn(imports, name), `Unmocked import ${name}`); return imports[name]; }, output, output.exports);
  return output.exports;
}
function harness() {
  const listeners = new Set(), frames = new Map(); let frame = 0, rendering, nextTitle = 0;
  const body = node('body'), root = body.append(node('div', { id: 'root' }));
  const classes = new Set(); body.classList = { add: value => classes.add(value), remove: value => classes.delete(value) };
  const document = { body, activeElement: null, getElementById: id => [body, ...body.querySelectorAll('[id]')].find(item => item.getAttribute('id') === id) || null };
  const assign = element => { element.document = document; element.children.forEach(assign); }; assign(body);
  const globals = { document, HTMLElement: Element, Event, window: {
    addEventListener: (_name, handler) => listeners.add(handler), removeEventListener: (_name, handler) => listeners.delete(handler),
    requestAnimationFrame: callback => { frames.set(++frame, callback); return frame; }, cancelAnimationFrame: id => frames.delete(id),
    getComputedStyle: element => ({ visibility: element.visibility }),
  } };
  const stack = load('mobile/src/lib/sheetStack.ts', {}, globals);
  const jsx = (type, props) => ({ type, props });
  const { Sheet } = load('mobile/src/components/Sheet.tsx', {
    react: { useCallback: callback => callback, useEffect: callback => rendering.effects.push(callback),
      useRef: value => { const ref = { current: value }; rendering.refs.push(ref); return ref; },
      useState: value => [value, () => {}], useId: () => `test-sheet-${++nextTitle}` },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-dom': { createPortal: value => value },
    '../lib/sheetStack': stack, './Icon': { Icon: 'Icon' }, '../lib/i18n': { useI18n: () => ({ copy: (_tr, en) => en }) },
  }, globals);
  function mount(contents = [], { dismissible = true } = {}) {
    rendering = { effects: [], refs: [] }; let closed = 0;
    const tree = Sheet({ open: true, title: 'Place details', children: null, dismissible, onClose: () => closed++ });
    const section = tree.props.children;
    const close = node('button', dismissible ? {} : { disabled: '' });
    const title = node('h2', { id: section.props['aria-labelledby'] });
    const sheet = body.append(node('section', { class: 'sheet' }, [node('header', { class: 'sheet-header' }, [title, close]), ...contents])); assign(sheet);
    rendering.refs[0].current = sheet; const cleanup = rendering.effects.map(effect => effect());
    return { tree, sheet, close, get closed() { return closed; }, dispose() { cleanup.forEach(callback => callback?.()); sheet.parentElement.children = sheet.parentElement.children.filter(item => item !== sheet); sheet.isConnected = false; } };
  }
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  return { document, root, body, classes, mount, flush,
    key(key = 'Tab', shiftKey = false) { let prevented = false; const event = { key, shiftKey, preventDefault() { prevented = true; } }; [...listeners].forEach(handler => handler(event)); return prevented; },
    focus(element) { element.focus(); assert.equal(document.activeElement, element); } };
}
function credits(open = false) {
  const summary = node('summary'), source = node('button'), license = node('button');
  return { summary, source, license, details: node('details', open ? { open: '' } : {}, [summary, node('div', {}, [source, license])]) };
}

for (const open of [false, true]) test(`${open ? 'Open' : 'Closed'} photo credits wrap both directions using actual Sheet key handlers`, () => {
  const h = harness(), c = credits(open), official = node('button'), map = node('button');
  const sheet = h.mount([map, official, c.details]);
  try {
    const last = open ? c.license : c.summary;
    assert.equal(c.license.getClientRects().length, 1, 'Closed descendants deliberately retain rectangles, as in the observed browser');
    h.focus(last); assert.equal(h.key(), true); assert.equal(h.document.activeElement, sheet.close);
    h.focus(sheet.close); assert.equal(h.key('Tab', true), true); assert.equal(h.document.activeElement, last);
    h.focus(official); assert.equal(h.key(), false, 'Natural Tab still reaches the intervening summary');
  } finally { sheet.dispose(); }
});

test('Opening and collapsing credits recalculates the native Tab boundary without remounting the sheet', () => {
  const h = harness(), c = credits(), sheet = h.mount([c.details]);
  try {
    h.focus(c.summary); h.key(); assert.equal(h.document.activeElement, sheet.close);
    c.details.setAttribute('open', ''); h.focus(sheet.close); h.key('Tab', true);
    assert.equal(h.document.activeElement, c.license);
    c.details.removeAttribute('open'); h.focus(c.summary); h.key();
    assert.equal(h.document.activeElement, sheet.close);
  } finally { sheet.dispose(); }
});

const exclusions = {
  'negative tabindex': () => node('button', { tabindex: '-1' }),
  'disabled button': () => node('button', { disabled: '', tabindex: '0' }),
  'disabled fieldset': () => node('fieldset', { disabled: '' }, [node('button')]),
  'hidden control': () => node('button', { hidden: '' }),
  'hidden ancestor': () => node('div', { hidden: '' }, [node('button')]),
  'inert control': () => node('button', { inert: '' }),
  'inert ancestor': () => node('div', { inert: '' }, [node('button')]),
  'hidden input': () => node('input', { type: 'hidden', tabindex: '0' }),
  'CSS visibility hidden': () => Object.assign(node('button'), { visibility: 'hidden' }),
  'CSS visibility collapse': () => Object.assign(node('button'), { visibility: 'collapse' }),
  'no client rects': () => Object.assign(node('button'), { rects: 0 }),
  'non-first native summary': () => node('details', { open: '' }, [node('summary', { tabindex: '-1' }), node('summary')]),
};
for (const [name, create] of Object.entries(exclusions)) test(`Tab boundaries exclude ${name}`, () => {
  const h = harness(), last = node('button'), sheet = h.mount([last, create()]);
  try {
    h.focus(last); assert.equal(h.key(), true); assert.equal(h.document.activeElement, sheet.close);
    h.focus(sheet.close); assert.equal(h.key('Tab', true), true); assert.equal(h.document.activeElement, last);
  } finally { sheet.dispose(); }
});

test('An inner open disclosure cannot expose controls inside a closed outer details ancestor', () => {
  const h = harness(), outerSummary = node('summary'), inner = credits(true);
  const sheet = h.mount([node('details', {}, [outerSummary, inner.details])]);
  try { h.focus(outerSummary); assert.equal(h.key(), true); assert.equal(h.document.activeElement, sheet.close);
    h.focus(sheet.close); h.key('Tab', true); assert.equal(h.document.activeElement, outerSummary); }
  finally { sheet.dispose(); }
});

test('An open outer disclosure retains the first summary of its closed inner disclosure', () => {
  const h = harness(), inner = credits(false), sheet = h.mount([node('details', { open: '' }, [node('summary'), inner.details])]);
  try { h.focus(inner.summary); assert.equal(h.key(), true); assert.equal(h.document.activeElement, sheet.close);
    h.focus(sheet.close); h.key('Tab', true); assert.equal(h.document.activeElement, inner.summary); }
  finally { sheet.dispose(); }
});

test('Positive tabindex candidates follow native sequential priority before normal DOM-order controls', () => {
  const h = harness(), first = node('button', { tabindex: '1' }), second = node('button', { tabindex: '2' }), last = node('button');
  const sheet = h.mount([second, first, last]);
  try { h.focus(last); h.key(); assert.equal(h.document.activeElement, first);
    h.focus(first); h.key('Tab', true); assert.equal(h.document.activeElement, last); }
  finally { sheet.dispose(); }
});

test('A disabled fieldset still permits its first legend control and custom explicit tab stops', () => {
  const h = harness(), legendButton = node('button'), custom = node('div', { tabindex: '0' });
  const sheet = h.mount([node('fieldset', { disabled: '' }, [node('legend', {}, [legendButton]), node('button')]), custom]);
  try { h.focus(custom); h.key(); assert.equal(h.document.activeElement, sheet.close);
    h.focus(sheet.close); h.key('Tab', true); assert.equal(h.document.activeElement, custom);
    h.focus(legendButton); assert.equal(h.key(), false); }
  finally { sheet.dispose(); }
});

test('Only the top nested sheet wraps focus and handles Escape; closing restores opener and root lock', () => {
  const h = harness(), opener = h.root.append(node('button')); opener.document = h.document; h.focus(opener);
  const lowerLast = node('button'), lower = h.mount([lowerLast]); h.flush(); assert.equal(h.document.activeElement, lower.close);
  h.focus(lowerLast); const c = credits(), upper = h.mount([c.details]); h.flush();
  assert.equal(h.root.inert, true); assert.equal(h.classes.has('sheet-open'), true);
  h.focus(c.summary); assert.equal(h.key(), true); assert.equal(h.document.activeElement, upper.close);
  assert.equal(h.key('Escape'), true); assert.equal(upper.closed, 1); assert.equal(lower.closed, 0);
  upper.dispose(); h.flush(); assert.equal(h.document.activeElement, lowerLast); assert.equal(h.root.inert, true);
  h.focus(lowerLast); h.key(); assert.equal(h.document.activeElement, lower.close);
  lower.dispose(); h.flush(); assert.equal(h.document.activeElement, opener); assert.equal(h.root.inert, false); assert.equal(h.classes.has('sheet-open'), false);
});
