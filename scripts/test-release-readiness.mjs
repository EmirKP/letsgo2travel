import { spawnSync } from "node:child_process";

const checks = [
  ["--test", "tests/live-activity-read.test.mjs"],
  ["--test", "tests/mobile-public-config.test.mjs"],
  ["scripts/run-app-tests.mjs"],
  ["scripts/run-alert-tests.mjs"],
  ["scripts/test-country-intelligence.mjs"],
  ["tests/integrity/run.mjs"],
  ["tests/travel-readiness/run.mjs"],
  ["tests/account-deletion/run.mjs"],
  ["tests/account-deletion/database.mjs"],
  ["tests/account-deletion-ui/run.mjs"],
  ["scripts/test-apple-account-deletion.mjs"],
  ["tests/community/safety-db.mjs"],
  ["tests/community/moderation.mjs"],
  ["node_modules/ts-node/dist/bin.js", "tests/community/safety.ts"],
  ["tests/support/run.mjs"],
  ["--test", "tests/ios-privacy.test.mjs"],
];
for (const args of checks) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit", env: { ...process.env, NODE_ENV: "test",
      TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: "CommonJS", moduleResolution: "Node", target: "ES2022", esModuleInterop: true, strict: true }),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Release requirement checks completed.");
