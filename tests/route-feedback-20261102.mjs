import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, imports = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { Intl })(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name.endsWith('.css')) return {};
    if (name === 'react/jsx-runtime') return require(name);
    throw Error(`Unexpected fixture import ${name}`);
  }, fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const { routeAllowanceLabel } = load('mobile/src/lib/routeAllowance.ts');

for (const [locale, expected] of Object.entries({
  tr: ['Bugün 1 rota hakkın var', 'Bugün 3 rota hakkın var', 'Ayrıntılar'],
  en: ['1 route available today', '3 routes available today', 'Details'],
  sq: ['Sot ke 1 itinerar të mbetur', 'Sot ke 3 itinerare të mbetura', 'Hollësi'],
  ro: ['Azi ai 1 traseu disponibil', 'Azi ai 3 trasee disponibile', 'Detalii'],
})) test(`Routine allowance is a closed native disclosure with real counts and keyboard summary (${locale})`, () => {
  const { RouteAllowance } = load('mobile/src/components/RouteAllowance.tsx', {
    '../lib/i18n': { useI18n: () => ({ locale, copy: (tr, en, sq) => locale === 'tr' ? tr : locale === 'sq' ? sq : en }) },
    './Icon': { Icon: () => React.createElement('svg', { 'aria-hidden': true }) },
  });
  for (const [index, remaining] of [1, 3].entries()) {
    const summary = routeAllowanceLabel(remaining, locale);
    assert.equal(summary, expected[index]);
    const html = renderToStaticMarkup(React.createElement(RouteAllowance, { summary },
      React.createElement('p', null, 'Optional reset and cost explanation'),
      React.createElement('button', { type: 'button' }, 'Refresh fixture')));
    assert.match(html, /<details><summary>/);
    assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/);
    assert.match(html, new RegExp(expected[2]));
    assert.match(html, /<summary>[\s\S]*<strong>/);
    assert.match(html, /<button type="button">Refresh fixture<\/button>/, 'Refresh remains available inside the details');
    assert.ok(html.indexOf('</summary>') < html.indexOf('Optional reset and cost explanation'));
  }
});

test('Sign-in, quota failure, pending and recovery details stay directly visible instead of hiding required actions', () => {
  const { RouteAllowance } = load('mobile/src/components/RouteAllowance.tsx', {
    '../lib/i18n': { useI18n: () => ({ locale: 'en', copy: (_tr, en) => en }) },
    './Icon': { Icon: () => React.createElement('svg', { 'aria-hidden': true }) },
  });
  for (const summary of ['Sign in to continue', 'Could not check your allowance', 'Your previous request is pending', '0 routes remaining']) {
    const html = renderToStaticMarkup(React.createElement(RouteAllowance, { summary, attention: true },
      React.createElement('button', { type: 'button' }, 'Recover or retry fixture')));
    assert.doesNotMatch(html, /<details|<summary/);
    assert.match(html, /needs-attention/);
    assert.match(html, /Recover or retry fixture/);
  }
});

function plannerFixture() {
  const filename = 'tests/planning-ux.mjs';
  let source = readFileSync(filename, 'utf8');
  const globals = { Date, Intl, URL, URLSearchParams, console, process, setTimeout, clearTimeout, Event, EventTarget,
    AbortController, requestAnimationFrame: fn => fn() };
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of [...ast.statements].reverse()) if (ts.isImportDeclaration(statement)) {
    const imported = statement.moduleSpecifier.text === 'node:test' ? { default: () => {} } : require(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (clause?.name) globals[clause.name.text] = imported.default ?? imported;
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const member of clause.namedBindings.elements) globals[member.name.text] = imported[member.propertyName?.text || member.name.text];
    source = source.slice(0, statement.getFullStart()) + source.slice(statement.end);
  }
  source += '\nexports.fixture = plannerHarness; exports.findNode = find;';
  const fixtureModule = { exports: {} };
  vm.runInNewContext(`(function(module,exports){${source}\n})`, globals)(fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
}

const { fixture, findNode } = plannerFixture();
for (const strict of [false, true]) for (const closePath of ['Sheet', 'LazyOverlay', 'LazyComponent']) {
  test(`Route planning ${closePath} close goes directly to Plans without generating or saving (StrictMode=${strict})`, () => {
    const app = fixture({ seeded: false, keepMapOpen: true, strict });
    try {
      const target = findNode(app.host.render(), closePath);
      assert.ok(target, `Expected ${closePath} close boundary`);
      assert.equal(typeof target.props.onClose, 'function');
      target.props.onClose();
      assert.deepEqual(Array.from(app.navigations), ['trips']);
      assert.equal(findNode(app.host.render(), 'Sheet'), undefined, 'Closing does not leave the planner overlay mounted');
      assert.equal(app.generated.length, 0);
      assert.equal(app.saves.length, 0);
    } finally { app.host.dispose(); }
  });
}
