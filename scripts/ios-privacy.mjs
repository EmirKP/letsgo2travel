// plist is the parser already installed by the pinned Capacitor CLI dependency.
import plist from "plist";

const typePrefix = "NSPrivacyCollectedDataType";
const functionality = `${typePrefix}PurposeAppFunctionality`;
const personalization = `${typePrefix}PurposeProductPersonalization`;

// Reviewed against real retained-data paths, not permission prompts.
// Keep store/apple/PRIVACY-INVENTORY.md in sync when a feature changes.
export const collectedDataRequirements = {
  Name: [functionality],
  EmailAddress: [functionality],
  UserID: [functionality],
  SearchHistory: [functionality, personalization],
  PhotosorVideos: [functionality],
  OtherUserContent: [functionality],
  DeviceID: [functionality],
  CustomerSupport: [functionality],
  CoarseLocation: [functionality],
  OtherFinancialInfo: [functionality],
  ProductInteraction: [functionality],
  OtherDiagnosticData: [functionality],
};

export function validateIosPrivacyManifest(source) {
  const errors = [];
  let manifest;
  try {
    manifest = plist.parse(source);
  } catch {
    return ["iOS gizlilik manifesti geçerli bir XML plist değil."];
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["iOS gizlilik manifestinin kökü bir sözlük olmalı."];
  }
  if (manifest.NSPrivacyTracking !== false) errors.push("Gizlilik manifestinde NSPrivacyTracking=false olmalı.");
  if (!Array.isArray(manifest.NSPrivacyTrackingDomains) || manifest.NSPrivacyTrackingDomains.length) {
    errors.push("İzleme yapılmayan bu sürümde izleme alan adları boş dizi olmalı.");
  }

  // LiveActivityTokenObserver.swift reads/writes its own l2t.* defaults.
  // Apple's own-app-only reason is CA92.1; an SDK/App Group reason is not a substitute.
  const apiEntries = Array.isArray(manifest.NSPrivacyAccessedAPITypes) ? manifest.NSPrivacyAccessedAPITypes : [];
  const defaults = apiEntries.filter(entry => entry?.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults");
  if (defaults.length !== 1 || !Array.isArray(defaults[0]?.NSPrivacyAccessedAPITypeReasons)
    || !defaults[0].NSPrivacyAccessedAPITypeReasons.includes("CA92.1")) {
    errors.push("Uygulamanın UserDefaults kullanımı için CA92.1 gerekçesi kendi API sözlüğünde bulunmalı.");
  }
  for (const entry of apiEntries) {
    if (!entry?.NSPrivacyAccessedAPIType || !Array.isArray(entry.NSPrivacyAccessedAPITypeReasons)
      || !entry.NSPrivacyAccessedAPITypeReasons.length
      || entry.NSPrivacyAccessedAPITypeReasons.some(reason => typeof reason !== "string" || !/^[A-F0-9]{4}\.\d+$/.test(reason))) {
      errors.push("Gizlilik manifestinde eksik veya geçersiz API gerekçesi var.");
    }
  }

  const dataEntries = Array.isArray(manifest.NSPrivacyCollectedDataTypes) ? manifest.NSPrivacyCollectedDataTypes : [];
  for (const [name, requiredPurposes] of Object.entries(collectedDataRequirements)) {
    const entries = dataEntries.filter(entry => entry?.NSPrivacyCollectedDataType === `${typePrefix}${name}`);
    if (entries.length !== 1) {
      errors.push(`Gizlilik manifestinde ${name} veri türü tam bir kez beyan edilmeli.`);
      continue;
    }
    const entry = entries[0];
    if (entry.NSPrivacyCollectedDataTypeLinked !== true || entry.NSPrivacyCollectedDataTypeTracking !== false) {
      errors.push(`${name}: hesapla bağlantılı, izleme amaçlı kullanılmayan veri beyanı gerekli.`);
    }
    if (!Array.isArray(entry.NSPrivacyCollectedDataTypePurposes)
      || requiredPurposes.some(purpose => !entry.NSPrivacyCollectedDataTypePurposes.includes(purpose))) {
      errors.push(`${name}: mevcut özelliğin veri kullanım amacı beyan edilmemiş.`);
    }
  }
  return errors;
}
