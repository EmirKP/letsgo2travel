import { spawnSync } from "node:child_process";
import path from "node:path";

const tsNodeCli = path.join(process.cwd(), "node_modules", "ts-node", "dist", "bin.js");
const compilerOptions = {
  module: "CommonJS",
  moduleResolution: "Node",
  target: "ES2019",
  esModuleInterop: true,
  strict: true,
};
const result = spawnSync(process.execPath, [tsNodeCli, "tests/flights/run-tests.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    TS_NODE_COMPILER_OPTIONS: JSON.stringify(compilerOptions),
  },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
