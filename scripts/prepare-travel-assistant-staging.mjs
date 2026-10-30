// Export only the new public-data APIs. No production routes, secrets or cron jobs.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'letsgo2travel-assistant-staging-'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const version = name => lock.packages[`node_modules/${name}`].version;
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sources = [
  'app/api/travel-assistant/places/route.ts',
  'app/api/travel-assistant/rates/route.ts',
  'app/api/travel-assistant/transit/route.ts',
  'app/api/travel-assistant/offline-map/route.ts',
  'app/api/travel-assistant/discover/route.ts',
  'app/api/travel-assistant/journey-route/route.ts',
  'app/api/travel-assistant/journey-search/route.ts',
  'app/api/travel-assistant/journey-photos/route.ts',
  'lib/travel-assistant/journey-types.ts',
  'lib/travel-assistant/journey-discovery.ts',
  'lib/travel-assistant/journey-photos.ts',
  'lib/travel-assistant/journey-photo-contract.ts',
  'lib/travel-assistant/journey-venue-photos.ts',
  'lib/travel-assistant/journey-routing.ts',
  'lib/travel-assistant/journey-apple-routing.ts',
  'lib/travel-assistant/journey-apple-places.ts',
  'lib/maps/apple-maps-server.ts',
  'lib/travel-assistant/journey-search.ts',
  'lib/travel-assistant/transit.ts',
  'lib/travel-assistant/entur.ts',
  'lib/travel-assistant/entur-server.ts',
  'lib/travel-assistant/offline-map.ts',
  'lib/travel-assistant/overpass.ts',
  'lib/travel-assistant/result-cache.ts',
  'lib/travel-assistant/http.ts',
  'lib/travel-assistant/types.ts',
  'lib/travel-assistant/places.ts',
  'lib/travel-assistant/money.ts',
  'lib/travel-assistant/server.ts',
  'lib/country-intelligence/fetch.ts',
];
const allowed = new Set(sources);
if (allowed.size !== sources.length || sources.some(source => !/^(?:app\/api\/travel-assistant\/[^/]+\/route|lib\/travel-assistant\/[^/]+|lib\/maps\/apple-maps-server|lib\/country-intelligence\/fetch)\.ts$/.test(source))) {
  throw new Error('The assistant source allowlist contains an unexpected path.');
}
const pinnedPackages = ['next', 'react', 'react-dom'];
const runtimeImports = [];
for (const source of sources) {
  const tree = ts.createSourceFile(source, readFileSync(join(root, source), 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) specifiers.add(node.moduleSpecifier.text);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) specifiers.add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) throw new Error(`Unbounded runtime import in ${source}.`);
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const specifier of specifiers) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) {
      if (!specifier.startsWith('node:') && !pinnedPackages.some(name => specifier === name || specifier.startsWith(`${name}/`))) throw new Error(`Unlisted assistant package in ${source}.`);
      continue;
    }
    const base = specifier.startsWith('@/') ? specifier.slice(2) : posix.normalize(posix.join(posix.dirname(source), specifier));
    const resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, `${base}/index.ts`].find(candidate => existsSync(join(root, candidate)));
    if (!resolved || !allowed.has(resolved)) throw new Error(`Missing explicit assistant dependency: ${source} -> ${specifier}.`);
    runtimeImports.push({ from: source, to: resolved });
  }
}
const files = sources.map(source => {
  const contents = readFileSync(join(root, source));
  return { path: source, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') };
});
const sourceHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const sourceDirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '--', ...sources], { cwd: root, encoding: 'utf8' }).trim());
for (const source of sources) {
  const target = join(output, source);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, source), target);
}
const json = (name, value) => writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
json('package.json', {
  name: 'letsgo2travel-assistant-testflight', private: true, version: '1.0.0',
  scripts: { build: 'next build', start: 'next start' }, engines: { node: '24.x' },
  dependencies: Object.fromEntries(pinnedPackages.map(name => [name, version(name)])),
  devDependencies: Object.fromEntries(['typescript', '@types/node', '@types/react', '@types/react-dom'].map(name => [name, version(name)])),
});
json('tsconfig.json', {
  compilerOptions: { target: 'ES2022', lib: ['dom', 'dom.iterable', 'esnext'], strict: true,
    noEmit: true, skipLibCheck: true, esModuleInterop: true, module: 'esnext',
    moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true,
    jsx: 'react-jsx', plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] } },
  include: ['next-env.d.ts', '**/*.ts', '.next/types/**/*.ts'], exclude: ['node_modules'],
});
json('vercel.json', { framework: 'nextjs', crons: [], functions: { 'app/api/travel-assistant/places/route.ts': { maxDuration: 30 }, 'app/api/travel-assistant/offline-map/route.ts': { maxDuration: 30 } } });
writeFileSync(join(output, '.vercelignore'), '.env*\n.git\nnode_modules\n.next\n');
writeFileSync(join(output, 'app/route.ts'),
  `export function GET() { return Response.json(${JSON.stringify({ service: 'LetsGo2Travel travel assistant', environment: 'testflight', sourceCommit })}); }\n`);
json('staging-source.json', { sourceCommit, sourceDirty, sourceHash, sources, files, runtimeImports, exportedAt: new Date().toISOString() });
console.log(JSON.stringify({ output, sourceCommit, sourceDirty, sourceHash, sourceFiles: sources.length }));
