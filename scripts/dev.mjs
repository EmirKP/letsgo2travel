import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensureJourneyApi } from './mobile-dev-api.mjs';
import { ensureEventCommunityRelay, eventCommunityRelayLaunch } from './mobile-event-community-dev.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// A supervised mobile QA server mounts the entire repository so Vite can read
// the shared release manifest. Normal `npm run dev` remains Next.js.
const mobile = args.includes('--mobile') || args.includes('--strictPort');
const entry = mobile ? 'mobile/node_modules/vite/bin/vite.js' : 'node_modules/next/dist/bin/next';
const children = new Set();
const shutdown = new AbortController();
function stop(child) {
  if (!children.delete(child) || child.exitCode !== null) return;
  // Next's dev worker is a child process too. Stop only this launcher's tree.
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}
function launch(file, params, env = process.env) {
  const child = spawn(process.execPath, [path.isAbsolute(file) ? file : path.join(root, file), ...params], { cwd: root, stdio: 'inherit', env, windowsHide: true });
  children.add(child);
  child.on('error', () => { console.error('Development process could not start.'); shutdown.abort(); });
  return child;
}
function stopAll() { shutdown.abort(); for (const child of [...children]) stop(child); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stopAll);
try {
  if (mobile) {
    const { loadEnv } = await import('../mobile/node_modules/vite/dist/node/index.js');
    const modeIndex = args.indexOf('--mode');
    const mode = modeIndex >= 0 ? args[modeIndex + 1] : args.find(arg => arg.startsWith('--mode='))?.slice(7) || 'development';
    const env = loadEnv(mode, root, '');
    if (env.L2T_MAPS_DEV_API_URL) console.log('Checking local journey API before starting mobile preview…');
    await ensureJourneyApi(env.L2T_MAPS_DEV_API_URL, ({ host, port }) => {
      const api = launch('node_modules/next/dist/bin/next', ['dev', '--hostname', host, '--port', String(port)]);
      api.on('exit', code => { children.delete(api); if (!shutdown.signal.aborted) { process.exitCode = code || 1; stopAll(); } });
      return () => stop(api);
    }, { signal: shutdown.signal });
    if (env.L2T_EVENT_COMMUNITY_DEV_API_URL) console.log('Checking protected event chat access before starting mobile preview…');
    await ensureEventCommunityRelay(env, config => {
      const command = eventCommunityRelayLaunch(config, { root });
      const relay = launch(command.file, command.args, command.env);
      relay.on('exit', code => { children.delete(relay); if (!shutdown.signal.aborted) { process.exitCode = code || 1; stopAll(); } });
      return () => stop(relay);
    }, { signal: shutdown.signal });
  }
  shutdown.signal.throwIfAborted();
  const child = launch(entry, [...(mobile ? ['mobile', '--config', 'mobile/vite.config.ts'] : ['dev']), ...args.filter(arg => arg !== '--mobile')]);
  child.on('exit', code => { children.delete(child); process.exitCode = code ?? 1; stopAll(); });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  stopAll();
}
