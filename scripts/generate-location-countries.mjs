// Natural Earth public-domain boundaries, from the already pinned world-atlas.
// Run when updating world-atlas; lazy-loaded and processed on-device only.
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
const topology = JSON.parse(readFileSync('node_modules/world-atlas/countries-50m.json','utf8'));
const iso = JSON.parse(readFileSync('mobile/src/data/iso3166.json','utf8'));
const countries = feature(topology,topology.objects.countries).features.flatMap(f => {
 const code=iso.find(r=>Number(r.numeric)===Number(f.id))?.alpha2 || (f.properties.name==='Kosovo'?'XK':'');
 return code ? [{type:'Feature',properties:{code},geometry:f.geometry}] : [];
});
writeFileSync('mobile/src/data/locationCountries.json',JSON.stringify(countries,(_,value)=>typeof value==='number'?Math.round(value*10000)/10000:value));
