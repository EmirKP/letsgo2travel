// Dünya haritası (world-atlas) SAYISAL ISO kodları kullanır. Mobildeki
// ISO-3 kodları TEK ortak ISO 3166 kaynağındaki numeric alanından çevrilir
// (93 ülkelik elle yazılmış tablo kaldırıldı; kapsam artık tüm liste).
import { ISO_3166 } from "./countries";

// Kaynakla harita/eski kayıtlar arasındaki bilinen istisnalar:
// - Kosova: statik harita dosyasında id "000" (world-atlas'ta resmî ISO
//   numarası yok); eski sürümler "383" ve alpha3 "XKX" kaydetmiş olabilir.
const GEO_ID_OVERRIDE: Record<string, string> = { XKK: "000" };
const LEGACY_GEO_ALIAS: Record<string, string> = { "383": "XKK" };
const LEGACY_ALPHA3_ALIAS: Record<string, string> = { XKX: "XKK" };

export const ALPHA3_TO_GEO_ID: Record<string, string> = Object.fromEntries(
  ISO_3166.map((row) => [row.alpha3, GEO_ID_OVERRIDE[row.alpha3] || row.numeric]),
);

export const GEO_ID_TO_ALPHA3 = {
  ...LEGACY_GEO_ALIAS,
  ...Object.fromEntries(
    Object.entries(ALPHA3_TO_GEO_ID).map(([alpha3, geoId]) => [geoId, alpha3]),
  ),
} as Record<string, string>;

export function alpha3ToGeoId(alpha3: string) {
  const normalized = alpha3.toUpperCase();
  const canonical = LEGACY_ALPHA3_ALIAS[normalized] || normalized;
  return ALPHA3_TO_GEO_ID[canonical] || null;
}

export function geoIdToAlpha3(geoId: string) {
  return GEO_ID_TO_ALPHA3[String(geoId).padStart(3, "0")] || null;
}

export function profileIdToAlpha3(value: string) {
  const normalized = value.trim().toUpperCase();
  const canonical = LEGACY_ALPHA3_ALIAS[normalized] || normalized;
  if (ALPHA3_TO_GEO_ID[canonical]) return canonical;
  return geoIdToAlpha3(normalized);
}

export function profileIdsForAlpha3(original: string[], alpha3Codes: string[]) {
  const preserved = original.filter((id) => !profileIdToAlpha3(id));
  const mapped = alpha3Codes.flatMap((alpha3) => {
    const geoId = alpha3ToGeoId(alpha3);
    return geoId ? [geoId] : [];
  });
  return Array.from(new Set([...preserved, ...mapped]));
}
