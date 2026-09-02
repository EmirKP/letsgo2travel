#!/usr/bin/env node
// =====================================================================
// lib/airports-dataset.json ureticisi.
// Kaynak: airports-json (ISC) paketi — verinin kendisi OurAirports
// (https://ourairports.com/data/) kamu malidir (public domain).
// Yalniz IATA kodlu, tarifeli ucusa acik orta/buyuk havalimanlarini alir.
// Ulke adlari Node ICU (Intl.DisplayNames, 'tr') ile Turkce uretilir.
// Calistirma: node scripts/generate-airports.mjs  (cikti commit edilir)
// =====================================================================
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { airports } = require("airports-json");

const regionNames = new Intl.DisplayNames(["tr"], { type: "region" });

function countryNameTr(iso) {
  try {
    const name = regionNames.of(iso);
    return name && name !== iso ? name : iso;
  } catch {
    return iso;
  }
}

const rows = airports
  .filter((a) => /^[A-Z]{3}$/.test(String(a.iata_code || "")))
  .filter((a) => a.scheduled_service === "yes" || a.type === "large_airport")
  .map((a) => ({
    iata: a.iata_code,
    name: String(a.name || "").trim().slice(0, 80),
    city: String(a.municipality || "").trim().slice(0, 60),
    country: countryNameTr(a.iso_country),
    countryCode: a.iso_country,
  }))
  .filter((a, index, list) => list.findIndex((b) => b.iata === a.iata) === index)
  .sort((a, b) => a.iata.localeCompare(b.iata));

writeFileSync(new URL("../lib/airports-dataset.json", import.meta.url), `${JSON.stringify(rows, null, 1)}\n`);
console.log(`lib/airports-dataset.json yazildi: ${rows.length} havalimani`);
