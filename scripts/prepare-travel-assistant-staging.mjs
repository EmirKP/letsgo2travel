// Export only the new public-data APIs. No production routes, secrets or cron jobs.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
  'lib/travel-assistant/transit.ts',
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
for (const source of sources) {
  const target = join(output, source);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, source), target);
}
const json = (name, value) => writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
json('package.json', {
  name: 'letsgo2travel-assistant-testflight', private: true, version: '1.0.0',
  scripts: { build: 'next build', start: 'next start' }, engines: { node: '24.x' },
  dependencies: Object.fromEntries(['next', 'react', 'react-dom'].map(name => [name, version(name)])),
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
json('staging-source.json', { sourceCommit, sources, exportedAt: new Date().toISOString() });
console.log(JSON.stringify({ output, sourceCommit, sourceFiles: sources.length }));
