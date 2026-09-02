#!/usr/bin/env node
// =====================================================================
// lib/airports-dataset.json ureticisi (dunya capinda IATA'li TICARI
// havalimanlari; heliport/deniz ucagi/kapali/ozel pist HARIC).
// Kaynaklar:
//  - airports-json (ISC paket): OurAirports orta/buyuk havalimanlari —
//    verinin kendisi KAMU MALI (https://ourairports.com/data/). Sehir
//    (municipality) alani buradan gelir.
//  - airports@1.0.0 (MIT, jbrooksuk/JSON-Airports): OurAirports'ta
//    olmayan IATA'li aktif kucuk TICARI havalimanlarini tamamlar
//    (type === "airport" && status === 1). Bu kayitlarda sehir alani
//    bos olabilir; ad/IATA/ulke ile aranir.
// Ulke adlari TEK ortak ISO kaynagindan (lib/countries/iso3166.json).
// Siralama onceligi: 0 buyuk, 1 tarifeli orta, 2 diger orta/buyuk,
// 3 tamamlayici kucuk — arama sonuclarinda buyukler one gelir.
// Calistirma: node scripts/generate-airports.mjs  (cikti commit edilir)
// =====================================================================
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { airports } = require("airports-json");
const smallAirports = require("airports");
const isoCountries = require("../lib/countries/iso3166.json");

const countryName = new Map(isoCountries.map((row) => [row.alpha2, row.name]));

function nameFor(iso) {
  return countryName.get(String(iso || "").toUpperCase()) || String(iso || "");
}

const rows = [];
const seen = new Set();

for (const a of airports) {
  const iata = String(a.iata_code || "");
  if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
  seen.add(iata);
  const priority = a.type === "large_airport" ? 0 : a.scheduled_service === "yes" ? 1 : 2;
  rows.push({
    iata,
    name: String(a.name || "").trim().slice(0, 80),
    city: String(a.municipality || "").trim().slice(0, 60),
    country: nameFor(a.iso_country),
    countryCode: String(a.iso_country || "").toUpperCase(),
    priority,
  });
}

for (const a of smallAirports) {
  const iata = String(a.iata || "");
  if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
  if (a.type !== "airport" || a.status !== 1) continue; // heliport/seaplane/closed haric
  const iso = String(a.iso || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) continue;
  seen.add(iata);
  rows.push({
    iata,
    name: String(a.name || "").trim().slice(0, 80),
    city: "",
    country: nameFor(iso),
    countryCode: iso,
    priority: 3,
  });
}

rows.sort((a, b) => a.iata.localeCompare(b.iata));
writeFileSync(new URL("../lib/airports-dataset.json", import.meta.url), `${JSON.stringify(rows)}
`);
const counts = rows.reduce((acc, row) => { acc[row.priority] = (acc[row.priority] || 0) + 1; return acc; }, {});
console.log(`lib/airports-dataset.json yazildi: ${rows.length} havalimani`, counts);
