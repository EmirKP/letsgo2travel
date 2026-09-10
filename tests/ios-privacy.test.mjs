import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import plist from "plist";
import { validateIosPrivacyManifest } from "../scripts/ios-privacy.mjs";

const source = await readFile(new URL("../ios/App/App/PrivacyInfo.xcprivacy", import.meta.url), "utf8");
const change = (mutate) => {
  const manifest = plist.parse(source);
  mutate(manifest);
  return plist.build(manifest);
};
const entry = (manifest, suffix) => manifest.NSPrivacyCollectedDataTypes.find(item => item.NSPrivacyCollectedDataType === `NSPrivacyCollectedDataType${suffix}`);

test("the app-owned UserDefaults token buffer is covered by the shipping manifest", async () => {
  const observer = await readFile(new URL("../ios/App/App/LiveActivityTokenObserver.swift", import.meta.url), "utf8");
  assert.match(observer, /UserDefaults\.standard\.set\(/);
  assert.match(observer, /UserDefaults\.standard\.(?:array|string)\(/);
  assert.match(observer, /"l2t\.liveActivity\.tokenBuffer"/);
  assert.doesNotMatch(observer, /UserDefaults\(suiteName:|persistentDomain\(forName:/);
  assert.deepEqual(validateIosPrivacyManifest(source), []);
});

test("an empty API list is rejected even when the reason exists only in an XML comment", () => {
  const xml = change(manifest => { manifest.NSPrivacyAccessedAPITypes = []; });
  assert.match(validateIosPrivacyManifest(xml.replace("<dict>", "<dict><!-- NSPrivacyAccessedAPICategoryUserDefaults CA92.1 -->")).join(" "), /UserDefaults/);
});

test("a reason for another API or SDK cannot satisfy app-owned defaults usage", () => {
  for (const reason of [[], ["C56D.1"], ["1C8F.1"]]) {
    const xml = change(manifest => {
      manifest.NSPrivacyAccessedAPITypes[0].NSPrivacyAccessedAPITypeReasons = reason;
      manifest.NSPrivacyAccessedAPITypes.push({ NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] });
    });
    assert.match(validateIosPrivacyManifest(xml).join(" "), /UserDefaults/);
  }
});

test("malformed plist and a non-dictionary manifest cannot pass the release gate", () => {
  assert.ok(validateIosPrivacyManifest("not a plist").length);
  assert.ok(validateIosPrivacyManifest(plist.build([])).length);
});

test("removing retained photo data or changing Apple's PhotosorVideos spelling fails", () => {
  const missing = change(manifest => { manifest.NSPrivacyCollectedDataTypes = manifest.NSPrivacyCollectedDataTypes.filter(item => item !== entry(manifest, "PhotosorVideos")); });
  const wrongCase = change(manifest => { entry(manifest, "PhotosorVideos").NSPrivacyCollectedDataType = "NSPrivacyCollectedDataTypePhotosOrVideos"; });
  for (const xml of [missing, wrongCase]) assert.match(validateIosPrivacyManifest(xml).join(" "), /PhotosorVideos/);
});

test("private bucket photos and push identifiers cannot be declared unlinked or tracking", () => {
  const xml = change(manifest => {
    entry(manifest, "PhotosorVideos").NSPrivacyCollectedDataTypeLinked = false;
    entry(manifest, "DeviceID").NSPrivacyCollectedDataTypeTracking = true;
    entry(manifest, "OtherDiagnosticData").NSPrivacyCollectedDataTypePurposes = [];
  });
  const errors = validateIosPrivacyManifest(xml).join(" ");
  for (const name of ["PhotosorVideos", "DeviceID", "OtherDiagnosticData"]) assert.ok(errors.includes(name));
});

test("empty data lists, duplicate declarations and accidental tracking domains fail", () => {
  assert.ok(validateIosPrivacyManifest(change(manifest => { manifest.NSPrivacyCollectedDataTypes = []; })).length);
  const xml = change(manifest => {
    manifest.NSPrivacyCollectedDataTypes.push(entry(manifest, "OtherUserContent"));
    manifest.NSPrivacyTrackingDomains = ["tracker.example"];
  });
  assert.match(validateIosPrivacyManifest(xml).join(" "), /OtherUserContent/);
  assert.match(validateIosPrivacyManifest(xml).join(" "), /alan adları/);
});
