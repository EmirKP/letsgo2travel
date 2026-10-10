import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const { getRootDirs } = require("@next/eslint-plugin-next/dist/utils/get-root-dirs.js");

test("the local glob adapter is restricted to the reviewed Next lint dependency", () => {
  const plugin = require("@next/eslint-plugin-next/package.json");
  assert.equal(plugin.version, "16.3.8", "review the adapter before upgrading Next's ESLint plugin");
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const consumers = Object.entries(lock.packages).filter(([, value]) => [value.dependencies, value.devDependencies, value.optionalDependencies].some((dependencies) => dependencies?.["fast-glob"]));
  assert.deepEqual(consumers.map(([name]) => name), ["node_modules/@next/eslint-plugin-next"]);
  const caller = readFileSync(require.resolve("@next/eslint-plugin-next/dist/utils/get-root-dirs.js"), "utf8");
  assert.match(caller, /_fastglob\.globSync/);
  assert.match(caller, /onlyDirectories: true/);
  assert.equal(lock.packages["node_modules/fast-glob"].resolved, "tools/next-eslint-glob");
  assert.equal(Object.keys(lock.packages).some((name) => /node_modules\/(braces|micromatch)$/.test(name)), false);
  const adapter = require("fast-glob");
  assert.deepEqual(Object.keys(adapter), ["globSync"]);
  assert.throws(() => adapter.globSync(["app"], { onlyDirectories: true }), TypeError);
  assert.throws(() => adapter.globSync("app", { onlyFiles: true }), TypeError);
  assert.throws(() => adapter.globSync("app", { onlyDirectories: true, dot: true }), TypeError);
});

test("Next lint root discovery preserves directory-only glob semantics", () => {
  const previousCwd = process.cwd();
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "l2t-eslint-roots-"));
  const directories = ["packages/web/app", "packages/docs/app", "packages/.hidden/app", "other/shop/app"];
  for (const directory of directories) mkdirSync(path.join(fixtureRoot, directory), { recursive: true });
  writeFileSync(path.join(fixtureRoot, "packages/readme.txt"), "Not a Next root");
  const roots = (rootDir) => getRootDirs({ cwd: fixtureRoot, settings: { next: { rootDir } } }).sort();
  const unixPath = (value) => value.replaceAll("\\", "/");

  try {
    process.chdir(fixtureRoot);
    assert.deepEqual(roots(undefined), [fixtureRoot], "default is the ESLint context cwd");
    assert.deepEqual(roots("packages/web"), ["packages/web"], "literal roots must not include descendants");
    assert.deepEqual(roots("packages/web/").map((directory) => path.normalize(directory)), [path.normalize("packages/web/")], "trailing slash still identifies the same directory");
    assert.deepEqual(roots("packages/*"), ["packages/docs", "packages/web"], "files and hidden roots are excluded");
    assert.deepEqual(roots("packages/{docs,web}"), ["packages/docs", "packages/web"], "brace alternatives work");
    assert.deepEqual(roots(["packages/*", "other/*", null]), ["other/shop", "packages/docs", "packages/web"], "workspace arrays work");
    assert.deepEqual(roots("missing/*"), [], "missing workspaces do not become roots");
    assert.deepEqual(roots("packages/.hidden"), ["packages/.hidden"], "explicit hidden paths work");
    assert.deepEqual(roots(path.join(fixtureRoot, "packages/web")), [unixPath(path.join(fixtureRoot, "packages/web"))], "absolute paths work on the host platform");
    assert.deepEqual(roots(path.join(fixtureRoot, "packages/*")), ["docs", "web"].map((name) => unixPath(path.join(fixtureRoot, "packages", name))), "absolute workspace patterns work");
    assert.deepEqual(roots("packages\\web"), ["packages/web"], "Next normalizes Windows separators before globbing");
  } finally {
    process.chdir(previousCwd);
    // Only remove the unique fixture created above, directly under the OS temp directory.
    assert.equal(path.dirname(path.resolve(fixtureRoot)), path.resolve(tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith("l2t-eslint-roots-"));
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("Next, React hooks, accessibility and TypeScript lint checks stay active", async () => {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(`
    import { useState } from "react";
    export default function Page({ enabled }: { enabled: boolean }) {
      if (enabled) useState(false);
      const invalid: {} = "text";
      return <><script src="/blocking.js" /><div aria-fake="true">{String(invalid)}</div></>;
    }
  `, { filePath: "app/lint-fixture.tsx" });
  const reportedRules = new Set(result.messages.map((message) => message.ruleId));
  for (const rule of ["@next/next/no-sync-scripts", "react-hooks/rules-of-hooks", "jsx-a11y/aria-props", "@typescript-eslint/no-empty-object-type"]) {
    assert.ok(reportedRules.has(rule), `${rule} must still detect its violation`);
  }
});
