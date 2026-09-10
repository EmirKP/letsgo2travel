import { spawnSync } from "node:child_process";
import path from "node:path";

const checks = [
  [path.join(process.cwd(), "node_modules/ts-node/dist/bin.js"), "tests/apple-account-deletion/run.ts"],
  ["--test", "tests/apple-account-deletion/database.test.mjs"],
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(), stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", TS_NODE_COMPILER_OPTIONS: JSON.stringify({
      module: "CommonJS", moduleResolution: "Node", target: "ES2020", esModuleInterop: true, strict: true,
    }) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
