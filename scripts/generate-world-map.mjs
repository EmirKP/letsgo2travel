#!/usr/bin/env node
// =====================================================================
// mobile/src/data/worldMapPaths.json ureticisi.
// Kaynak: world-atlas@2 (countries-110m) — Natural Earth verisi (kamu
// mali / public domain); topojson-client + d3-geo ile sabit 800x400
// viewBox'a projeksiyonlanmis SVG path'leri uretilir. Calisma aninda ag
// veya harita kutuphanesi GEREKMEZ (mobil performans + cevrimdisi).
// Calistirma: node scripts/generate-world-map.mjs  (cikti commit edilir)
// =====================================================================
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const world = require("world-atlas/countries-110m.json");

const { features } = feature(world, world.objects.countries);
const projection = geoNaturalEarth1().fitSize([800, 400], { type: "FeatureCollection", features });
const path = geoPath(projection);

const rows = features
  .map((f) => ({
    id: String(f.id ?? "").padStart(3, "0"),
    name: String(f.properties?.name || ""),
    d: path(f),
  }))
  .filter((row) => row.d && row.id !== "010"); // Antarktika haritada gereksiz

// Yol verisini kucult: 2 ondalik yeterli
for (const row of rows) {
  row.d = row.d.replace(/(\d+\.\d{2})\d+/g, "$1");
}

writeFileSync(new URL("../mobile/src/data/worldMapPaths.json", import.meta.url), `${JSON.stringify(rows)}\n`);
console.log(`worldMapPaths.json yazildi: ${rows.length} ulke, ${Math.round(JSON.stringify(rows).length / 1024)} KB`);
