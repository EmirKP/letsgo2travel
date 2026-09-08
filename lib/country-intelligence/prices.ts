import type { PriceBaseline } from "./types";

const checkedAt = "2026-09-08T00:00:00Z";
const source = (path: string) => ({ name: "Budget Your Trip · traveller-reported average", url: `https://www.budgetyourtrip.com/${path}`, checkedAt });
// Aggregate daily spending, not a room quote. Do not substitute the date we
// read a page for the unknown collection period of travellers' observations.
// A missing reference month deliberately prevents unjustified CPI re-indexing.
export const PRICE_BASELINES: PriceBaseline[] = [
  { code: "BA", city: { tr: "Saraybosna", en: "Sarajevo" }, currency: "BAM", daily: 170, referenceMonth: null, source: source("bosnia-and-herzegowina/sarajevo"), quality: "traveller-average" },
  { code: "GE", city: { tr: "Tiflis", en: "Tbilisi" }, currency: "GEL", daily: 94, referenceMonth: null, source: source("georgia/tbilisi"), quality: "traveller-average" },
  { code: "RS", city: { tr: "Belgrad", en: "Belgrade" }, currency: "RSD", daily: 5617, referenceMonth: null, source: source("serbia/belgrade"), quality: "traveller-average" },
  { code: "IT", city: { tr: "Roma", en: "Rome" }, currency: "EUR", daily: 207, referenceMonth: null, source: source("italy/rome"), quality: "traveller-average" },
  { code: "AE", city: { tr: "Dubai", en: "Dubai" }, currency: "AED", daily: 1060, referenceMonth: null, source: source("united-arab-emirates/dubai"), quality: "traveller-average" },
  // Kept for backwards compatibility, conspicuously labelled in the interface.
  { code: "AZ", city: { tr: "Bakü", en: "Baku" }, currency: "TRY", daily: 2980, referenceMonth: null, source: null, quality: "legacy-example" },
];
