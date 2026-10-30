import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}) {
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {})(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Missing bundled image fixture ${name}`);
  }, result, result.exports);
  return result.exports;
}

const imageModule = load('mobile/src/lib/bundledImageSource.ts');
function bundledModule(file, mode) {
  const imports = Object.fromEntries(ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles.map(({ fileName }) => {
    if (fileName === '../lib/bundledImageSource') return [fileName, imageModule];
    if (fileName.endsWith('.json')) return [fileName, { default: JSON.parse(readFileSync(resolve(dirname(file), fileName), 'utf8')) }];
    assert.match(fileName, /\.(?:webp|jpe?g|png)$/);
    const src = `${mode === 'next' ? '/_next/static/media' : '/vite/assets'}/${basename(fileName)}`;
    return [fileName, { default: mode === 'next' ? Object.freeze({ src, width: 960, height: 640, blurDataURL: 'data:image/webp,blur' }) : src }];
  }));
  return load(file, imports);
}

test('Bundled photos preserve Vite URLs and Next static image src without mutating asset metadata', () => {
  const { bundledImageSource } = imageModule;
  for (const url of ['/src/assets/photo.webp?size=640#preview', '/_next/static/media/photo.a1b2.webp', 'data:image/svg+xml,neutral']) {
    assert.equal(bundledImageSource(url), url);
    const asset = Object.freeze({ src: url, width: 640, height: 400, blurDataURL: 'unchanged' });
    assert.equal(bundledImageSource(asset), url);
    assert.deepEqual(asset, { src: url, width: 640, height: 400, blurDataURL: 'unchanged' });
  }
});

test('Every budget city photo remains a distinct URL and retains the same credit under both bundlers', () => {
  const vite = bundledModule('mobile/src/data/budgetCityPhotos.ts', 'vite').BUDGET_CITY_PHOTOS;
  const next = bundledModule('mobile/src/data/budgetCityPhotos.ts', 'next').BUDGET_CITY_PHOTOS;
  assert.equal(Object.keys(vite).length, 50);
  assert.deepEqual(Object.keys(next), Object.keys(vite));
  for (const id of Object.keys(vite)) {
    assert.equal(typeof vite[id].src, 'string'); assert.equal(typeof next[id].src, 'string');
    assert.ok(vite[id].src.startsWith('/vite/assets/'));
    assert.ok(next[id].src.startsWith('/_next/static/media/'));
    assert.equal(basename(vite[id].src), basename(next[id].src), id);
    assert.deepEqual(next[id].credit, vite[id].credit, 'URL normalization preserves attribution metadata');
  }
  assert.equal(new Set(Object.values(next).map(photo => photo.src)).size, 50);
});

test('Destination artwork retains aliases and the neutral unknown-place fallback under both bundlers', () => {
  for (const mode of ['vite', 'next']) {
    const { destinationArtwork } = bundledModule('mobile/src/data/artwork.ts', mode);
    const paris = destinationArtwork('PAR'), rome = destinationArtwork('fco');
    assert.equal(typeof paris, 'string'); assert.equal(typeof rome, 'string');
    assert.match(paris, /paris-eiffel-v3\.webp$/);
    assert.match(rome, /rome\.webp$/);
    assert.equal(destinationArtwork('CDG'), paris);
    assert.notEqual(rome, paris);
    assert.ok(destinationArtwork('UNKNOWN').startsWith('data:image/svg+xml,'));
    assert.equal(destinationArtwork(), destinationArtwork('UNKNOWN'));
  }
});
