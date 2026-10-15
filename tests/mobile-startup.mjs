import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('mobile/src/components/AnimatedSplash.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function fixture({ reducedMotion = false } = {}) {
  let now = 0, nextId = 0, cursor = 0, finishCount = 0, effect;
  const state = [], timers = new Map(), frames = new Map();
  const window = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = value; }];
    },
    useEffect(fn) { effect = fn; },
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { window })(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '../lib/i18n') return { useI18n: () => ({ copy: (_tr, en) => en }) };
    if (name.endsWith('.webp')) return { default: name };
    throw Error(`Unexpected startup dependency: ${name}`);
  }, module, module.exports);
  const onFinish = () => { finishCount++; };
  const render = () => { cursor = 0; return module.exports.AnimatedSplash({ onFinish }); };
  render(); let cleanup = effect();
  return {
    render,
    finishCount: () => finishCount,
    pending: () => timers.size + frames.size,
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = target;
    },
    strictReplay() { cleanup(); cleanup = effect(); },
    dispose() { cleanup(); },
  };
}
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)] : [];

test('Native splash reveals the committed app after its first paint and a short fade', () => {
  const app = fixture();
  app.paint(); app.advance(16);
  assert.equal(app.finishCount(), 0);
  app.paint();
  assert.match(app.render().props.className, /leaving/);
  app.advance(179); assert.equal(app.finishCount(), 0);
  app.advance(1); assert.equal(app.finishCount(), 1);
  app.dispose(); assert.equal(app.pending(), 0);
});

test('Suspended paint callbacks cannot hold the splash for a four-second video', () => {
  const app = fixture();
  app.advance(780);
  assert.equal(app.finishCount(), 1);
  app.paint(); app.paint(); app.advance(5_000);
  assert.equal(app.finishCount(), 1, 'The readiness and fallback paths share one exit');
  app.dispose(); assert.equal(app.pending(), 0);
});

test('Reduced motion uses the static mark and exits without a timed animation', () => {
  const app = fixture({ reducedMotion: true });
  const image = nodes(app.render()).find(node => node.type === 'img');
  assert.match(image.props.src, /splash-mark\.webp/);
  app.advance(0); assert.equal(app.finishCount(), 1);
  app.dispose(); assert.equal(app.pending(), 0);
});

test('The launch artwork stays branded without downloading or decoding video', () => {
  const app = fixture();
  const tree = app.render();
  assert.equal(nodes(tree).filter(node => node.type === 'video').length, 0);
  assert.match(nodes(tree).find(node => node.type === 'img').props.src, /launch-travel-poster\.webp/);
  assert.equal(tree.props.role, 'status');
  assert.equal(tree.props['aria-label'], 'LetsGo2Travel is opening');
  app.dispose();
});

test('Unmount cancels both pending paint and completion callbacks', () => {
  for (const beginExit of [false, true]) {
    const app = fixture();
    if (beginExit) { app.paint(); app.paint(); }
    app.dispose(); app.advance(5_000); app.paint();
    assert.equal(app.finishCount(), 0); assert.equal(app.pending(), 0);
  }
});

test('StrictMode effect cleanup/replay still completes exactly once', () => {
  const app = fixture();
  app.strictReplay(); app.paint(); app.paint(); app.advance(780);
  assert.equal(app.finishCount(), 1);
  app.dispose(); assert.equal(app.pending(), 0);
});
