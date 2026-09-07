import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// A supervised mobile QA server mounts the entire repository so Vite can read
// the shared release manifest. Normal `npm run dev` remains Next.js.
const mobile = args.includes('--mobile') || args.includes('--strictPort');
const entry = mobile ? 'mobile/node_modules/vite/bin/vite.js' : 'node_modules/next/dist/bin/next';
const child = spawn(process.execPath, [path.join(root, entry), ...(mobile ? ['mobile', '--config', 'mobile/vite.config.ts'] : ['dev']), ...args.filter(arg => arg !== '--mobile')], {cwd:root,stdio:'inherit',env:process.env});
child.on('error', error => { console.error(error.message); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
