import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { prepareAndroidRelease, validateAndroidVersion, validateGoogleServices } from "../scripts/prepare-android-release.mjs";

const copier = fileURLToPath(new URL("../scripts/copy-mobile-build.mjs", import.meta.url));
const firebase = { project_info: { project_id: "fixture-project", project_number: "12345" }, client: [{ client_info: { android_client_info: { package_name: "tr.com.letsgo2travel.app" }, mobilesdk_app_id: "1:12345:android:0000000000000000" }, api_key: [{ current_key: "AIza" + "0".repeat(35) }] }] };
const env = { L2T_ANDROID_VERSION_CODE: "59", L2T_FIREBASE_PROJECT_ID: "fixture-project", L2T_GOOGLE_SERVICES_JSON_BASE64: Buffer.from(JSON.stringify(firebase)).toString("base64") };

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "l2t-android-packaging-"));
  const paths = ["mobile/dist/assets", "mobile-dist", "ios/App/App/public", "android/app/src/main/assets/public"];
  for (const entry of paths) await mkdir(path.join(root, entry), { recursive: true });
  await writeFile(path.join(root, "mobile/dist/index.html"), '<div id="root"></div><script src="./assets/index-new.js"></script>');
  await writeFile(path.join(root, "mobile/dist/assets/index-new.js"), "new-shared-ui");
  await writeFile(path.join(root, "ios/App/App/public/keep.txt"), "approved-ios-input");
  await writeFile(path.join(root, "android/app/src/main/assets/public/stale.txt"), "old-android");
  await writeFile(path.join(root, "release-manifest.json"), JSON.stringify({ appVersion: "1.4.0", buildNumber: 27, nativeBuildNumber: 27 }));
  await writeFile(path.join(root, "android/app/build.gradle"), 'android { defaultConfig { versionCode 27\n versionName "1.4.0" } }');
  return root;
}

test("Android copy removes stale Android assets while preserving iOS and unrelated files", async () => {
  const root = await fixture();
  const result = spawnSync(process.execPath, [copier, "--platform=android"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(root, "ios/App/App/public/keep.txt"), "utf8"), "approved-ios-input");
  await assert.rejects(readFile(path.join(root, "android/app/src/main/assets/public/stale.txt")), { code: "ENOENT" });
  assert.equal(await readFile(path.join(root, "mobile-dist/assets/index-new.js"), "utf8"), "new-shared-ui");
});

test("Unknown platform and junction cleanup fail before deleting any platform assets", async () => {
  const root = await fixture();
  assert.notEqual(spawnSync(process.execPath, [copier, "--platform=androdi"], { cwd: root }).status, 0);
  assert.equal(await readFile(path.join(root, "android/app/src/main/assets/public/stale.txt"), "utf8"), "old-android");
  const linkedRoot = await mkdtemp(path.join(os.tmpdir(), "l2t-android-linked-"));
  await mkdir(path.join(linkedRoot, "mobile/dist/assets"), { recursive: true });
  await writeFile(path.join(linkedRoot, "mobile/dist/index.html"), '<div id="root"></div>');
  await symlink(path.join(root, "android"), path.join(linkedRoot, "android"), process.platform === "win32" ? "junction" : "dir");
  assert.notEqual(spawnSync(process.execPath, [copier, "--platform=android"], { cwd: linkedRoot }).status, 0);
  assert.equal(await readFile(path.join(root, "android/app/src/main/assets/public/stale.txt"), "utf8"), "old-android");
});

test("Release version rejects malformed, downgraded or out-of-range Play codes", () => {
  for (const value of ["", "1.2", "0", "-1", "26", "2100000001", "59;echo secret", " 59 "]) assert.throws(() => validateAndroidVersion(value, 27));
  assert.equal(validateAndroidVersion("59", 27), 59);
  for (const minimum of [undefined, NaN, 0, -1, "27"]) assert.throws(() => validateAndroidVersion("59", minimum));
});

test("Firebase client identity must match both the shared project and package", () => {
  assert.equal(validateGoogleServices(firebase, "fixture-project"), firebase);
  assert.throws(() => validateGoogleServices(firebase, "another-project"));
  const wrongPackage = structuredClone(firebase);
  wrongPackage.client[0].client_info.android_client_info.package_name = "another.app";
  assert.throws(() => validateGoogleServices(wrongPackage, "fixture-project"));
  for (const sdkId of ["garbage", "1:99999:android:0000000000000000"]) {
    const invalid = structuredClone(firebase); invalid.client[0].client_info.mobilesdk_app_id = sdkId;
    assert.throws(() => validateGoogleServices(invalid, "fixture-project"));
  }
  const invalidKey = structuredClone(firebase); invalidKey.client[0].api_key[0].current_key = "x";
  assert.throws(() => validateGoogleServices(invalidKey, "fixture-project"));
  assert.throws(() => validateGoogleServices({ ...firebase, type: "service_account", private_key: "PRIVATE_CANARY" }, "fixture-project"), error => !error.message.includes("PRIVATE_CANARY"));
});

test("Android release stamping validates everything before writes and leaves iOS intact", async () => {
  const root = await fixture();
  await assert.rejects(prepareAndroidRelease(root, { ...env, L2T_GOOGLE_SERVICES_JSON_BASE64: "PRIVATE_CANARY" }));
  assert.match(await readFile(path.join(root, "android/app/build.gradle"), "utf8"), /versionCode 27/);
  assert.equal(await prepareAndroidRelease(root, env), 59);
  assert.match(await readFile(path.join(root, "android/app/build.gradle"), "utf8"), /versionCode 59/);
  const manifest = JSON.parse(await readFile(path.join(root, "release-manifest.json"), "utf8"));
  assert.equal(manifest.nativeBuildNumber, 59);
  assert.equal(manifest.buildNumber, 27);
  assert.equal(await readFile(path.join(root, "ios/App/App/public/keep.txt"), "utf8"), "approved-ios-input");
  await writeFile(path.join(root, "android/app/build.gradle"), 'android { defaultConfig { versionCode 60\n versionName "1.4.0" } }');
  await assert.rejects(prepareAndroidRelease(root, env));
});
