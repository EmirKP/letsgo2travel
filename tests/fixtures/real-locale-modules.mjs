import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute production translation helpers in restricted component fixtures.
// Existing tr/en/sq assertions still exercise the actual helper behaviour.
const cache = new Map();
function load(path) {
  const full = resolve(path);
  if (cache.has(full)) return cache.get(full);
  const loadedModule = { exports: {} };
  cache.set(full, loadedModule.exports);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {})(id => {
    if (!id.startsWith('.')) throw Error('Unexpected production locale dependency');
    return load(resolve(dirname(full), `${id}.ts`));
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

export function realLocaleModule(id) {
  if (/(?:^|\/)planner-copy$/.test(id)) return load('lib/planner-copy.ts');
  if (/(?:^|\/)locale-copy$/.test(id)) return load('lib/locale-copy.ts');
  if (/(?:^|\/)locale$/.test(id)) return load('mobile/src/lib/locale.ts');
  return undefined;
}
