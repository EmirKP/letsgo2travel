import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/ts-node/dist/bin.js", "tests/country-intelligence/run.ts"], {
  stdio: "inherit", env: { ...process.env, TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: "CommonJS", moduleResolution: "Node", target: "ES2022", esModuleInterop: true, resolveJsonModule: true }) },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
