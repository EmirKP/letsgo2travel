#!/usr/bin/env node
// =====================================================================
// TEK ortak ISO 3166-1 ülke kaynağı üreticisi.
// Kod eşlemeleri: i18n-iso-countries (MIT). Türkçe adlar: Node ICU
// (Intl.DisplayNames 'tr'; yoksa paketin tr sözlüğü). Bayrak: bölgesel
// gösterge emojisi (XK gibi resmî emojisi olmayanlarda 🏳️).
// Çıktılar (ikisi de commit edilir; içerik AYNIDIR):
//   lib/countries/iso3166.json          (web/API)
//   mobile/src/data/iso3166.json        (mobil paket)
// Çalıştırma: node scripts/generate-countries.mjs
// =====================================================================
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const iso = require("i18n-iso-countries");
const trLang = require("i18n-iso-countries/langs/tr.json");
iso.registerLocale(trLang);

const display = new Intl.DisplayNames(["tr"], { type: "region" });

function flagEmoji(alpha2) {
  if (!/^[A-Z]{2}$/.test(alpha2) || alpha2 === "XK") return "🏳️";
  return String.fromCodePoint(...[...alpha2].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function turkishName(alpha2) {
  let name = "";
  try { name = display.of(alpha2) || ""; } catch { name = ""; }
  if (!name || name === alpha2) name = iso.getName(alpha2, "tr") || iso.getName(alpha2, "en") || alpha2;
  return name;
}

const rows = Object.keys(iso.getAlpha2Codes())
  .map((alpha2) => ({
    alpha2,
    alpha3: iso.alpha2ToAlpha3(alpha2) || "",
    numeric: iso.alpha2ToNumeric(alpha2) || "",
    name: turkishName(alpha2),
    flag: flagEmoji(alpha2),
  }))
  .filter((row) => row.alpha3 && row.name)
  .sort((a, b) => a.name.localeCompare(b.name, "tr"));

const payload = `${JSON.stringify(rows, null, 1)}\n`;
writeFileSync(new URL("../lib/countries/iso3166.json", import.meta.url), payload);
writeFileSync(new URL("../mobile/src/data/iso3166.json", import.meta.url), payload);
console.log(`iso3166.json yazildi: ${rows.length} ulke/bolge (web + mobil)`);
