import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Mobil saf yardımcılar (type:module paketinde) CJS test koşucusuna
// dogrudan require edilemez; GERÇEK mobil kaynak test anında buraya
// bayt-bayt kopyalanır ve testler bu kopyayı çalıştırır.
const mirrorDir = path.join(process.cwd(), "tests", "app", "_mobile");
mkdirSync(mirrorDir, { recursive: true });
writeFileSync(path.join(mirrorDir, "dates.ts"), readFileSync("mobile/src/lib/dates.ts", "utf8"));
writeFileSync(
  path.join(mirrorDir, "cockpitForm.ts"),
  readFileSync("mobile/src/lib/cockpitForm.ts", "utf8").replace('from "./airports"', 'from "../airport-types"'),
);
writeFileSync(
  path.join(mirrorDir, "liveActivity.ts"),
  readFileSync("mobile/src/lib/liveActivity.ts", "utf8").replace('from "./capacitor"', 'from "../capacitor-shim"'),
);
writeFileSync(path.join(mirrorDir, "deepLink.ts"), readFileSync("mobile/src/lib/deepLink.ts", "utf8"));
writeFileSync(path.join(mirrorDir, "id.ts"), readFileSync("mobile/src/lib/id.ts", "utf8"));

const tsNodeCli = path.join(process.cwd(), "node_modules", "ts-node", "dist", "bin.js");
const compilerOptions = {
  module: "CommonJS",
  moduleResolution: "Node",
  target: "ES2019",
  esModuleInterop: true,
  strict: true,
  resolveJsonModule: true,
};
const result = spawnSync(process.execPath, [tsNodeCli, "tests/app/run-tests.ts"], {
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
