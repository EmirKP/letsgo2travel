import { translateMessageTemplates } from '../mobile/src/lib/locale';

// Only application-owned planner copy. Keep the full Romanian catalog lazy on clients.
// Generated from the planner's static English labels and templates, never user records.
const PLANNER_RO_MESSAGES: Record<string, string> = {
  " · Visa required from 1 November 2026": " · Viză obligatorie de la 1 noiembrie 2026",
  "Adapt to your chosen travel style": "Adaptează la stilul tău de călătorie",
  "Arrive, reach your accommodation and get your bearings. Keep the first day to a short walk and a meal.": "Ajungi, mergi la cazare și familiarizează-te cu zona. Rezervă prima zi pentru o plimbare scurtă și o masă.",
  "Check current official travel information.": "Verifică informațiile oficiale actuale de călătorie.",
  "Check local connections": "Verifică legăturile locale",
  "Choose a museum, neighbourhood or local market matching your interests; check opening hours and group nearby stops.": "Alege un muzeu, un cartier sau o piață locală potrivită intereselor tale; verifică programul și grupează opririle apropiate.",
  "Choose a nearby coast or nature area; check transport and weather, and leave time to rest.": "Alege o zonă de coastă sau de natură din apropiere; verifică transportul și vremea și lasă timp pentru odihnă.",
  "Compare reservations for comfortable transfers and an optional guided experience.": "Compară rezervările pentru transferuri confortabile și o experiență opțională cu ghid.",
  "Day {{0}}": "Ziua {{0}}",
  "Diplomatic": "Diplomatic",
  "Entry conditions need verification": "Condițiile de intrare trebuie verificate",
  "Entry restriction · verify": "Restricție de intrare · verifică",
  "Entry with an ID card": "Intrare cu cartea de identitate",
  "Estimate separately for your dates": "Calculează separat pentru datele tale",
  "Finish exploring and prepare to return. Allow enough time for luggage, checkout and return transport.": "Încheie explorarea și pregătește-te de întoarcere. Lasă suficient timp pentru bagaje, plecarea de la cazare și transportul de retur.",
  "Group nearby stops and balance free exploring with a paid activity.": "Grupează opririle apropiate și combină explorarea gratuită cu o activitate plătită.",
  "Ordinary": "Simplu",
  "Passport not selected": "Pașaport neselectat",
  "Plan a short central walk and a local meal; leave time for the return journey.": "Planifică o plimbare scurtă prin centru și o masă locală; lasă timp pentru drumul de întoarcere.",
  "Planning outline": "Schiță de planificare",
  "Prioritise free stops, local food and public transport.": "Prioritizează opririle gratuite, mâncarea locală și transportul public.",
  "Service": "Serviciu",
  "Special": "Special",
  "This is an editable starter outline, without live prices, bookings or a verified venue schedule. Retry online for a detailed plan.": "Aceasta este o schiță inițială editabilă, fără prețuri în timp real, rezervări sau un program verificat al locațiilor. Reîncearcă online pentru un plan detaliat.",
  "Travel authorisation required (ETA)": "Este necesară autorizație de călătorie (ETA)",
  "Unknown type": "Tip necunoscut",
  "Use short, age-appropriate stops with regular meal and rest breaks; omit nightlife.": "Alege opriri scurte și potrivite vârstei, cu pauze regulate pentru masă și odihnă; evită viața de noapte.",
  "Verify entry conditions": "Verifică condițiile de intrare",
  "Visa on arrival": "Viză la sosire",
  "Visa required": "Este necesară viză",
  "Visa-free": "Fără viză",
  "Your passport country": "Țara pașaportului tău",
  "e-Visa required": "Este necesară e-viză",
  "{{0}} days": "{{0}} zile",
  "{{0}} → {{1}}: a {{2}}-day starter outline for your chosen destination.": "{{0}} → {{1}}: o schiță inițială de {{2}} zile pentru destinația aleasă."
};

export function translateAppCopy(locale: string | null | undefined, tr: string, en: string, sq?: string): string {
  if (locale === 'tr') return tr;
  if (locale === 'sq') return sq ?? en;
  if (locale === 'ro') return translateMessageTemplates(PLANNER_RO_MESSAGES, en);
  return en;
}
