import type { EmergencyCategory, EmergencyContact } from './types';

// Values checked against the linked official guidance on the stated date.
// No universal-number fallback: an unknown country must remain unknown.
const rows: Array<[string, string, Partial<Record<EmergencyCategory, string>>]> = [
  ['TR', 'turkey', { general: '112', police: '112', ambulance: '112', fire: '112' }],
  ['DE', 'germany', { police: '110', ambulance: '112', fire: '112' }],
  ['FR', 'france', { general: '112', police: '17', ambulance: '15', fire: '18' }],
  ['IT', 'italy', { police: '112', ambulance: '118', fire: '115' }],
  ['ES', 'spain', { general: '112', police: '112', ambulance: '112', fire: '112' }],
  ['XK', 'kosovo', { general: '112', police: '192', ambulance: '194', fire: '193' }],
  ['AL', 'albania', { police: '112', ambulance: '127', fire: '128' }],
  ['AE', 'united-arab-emirates', { police: '999', ambulance: '998', fire: '997' }],
  ['JP', 'japan', { police: '110', ambulance: '119', fire: '119' }],
  ['TH', 'thailand', { general: '191', police: '191', ambulance: '1669', fire: '199', 'tourist-police': '1155' }],
  ['GE', 'georgia', { general: '112', police: '112', ambulance: '112', fire: '112' }],
  ['BA', 'bosnia-and-herzegovina', { police: '122', ambulance: '124', fire: '123' }],
  ['NL', 'netherlands', { general: '112', police: '112', ambulance: '112', fire: '112' }],
  ['US', 'usa', { general: '911', police: '911', ambulance: '911', fire: '911' }],
  ['CA', 'canada', { general: '911', police: '911', ambulance: '911', fire: '911', coastguard: '+18004634393' }],
  ['GB', '', { general: '999', police: '999', ambulance: '999', fire: '999', coastguard: '999' }],
];
export const EMERGENCY_CONTACTS: EmergencyContact[] = rows.flatMap(([country, slug, services]) =>
  Object.entries(services).map(([category, number]) => ({
    country, category: category as EmergencyCategory, number, verifiedAt: '2026-09-16',
    sourceUrl: slug ? `https://www.gov.uk/foreign-travel-advice/${slug}/getting-help` : 'https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers',
    ...(country === 'XK' && category !== 'general' ? { note: { tr: 'Cep telefonundan arama numarası.', en: 'Number for calls from a mobile phone.' } } : {}),
  })));
export function emergencyContacts(country: string) {
  return EMERGENCY_CONTACTS.filter(item => item.country === country.toUpperCase());
}
export function dialUrl(number: string): string | null {
  const clean = number.replace(/[\s()-]/g, '');
  return /^\+?\d{2,15}$/.test(clean) ? `tel:${clean}` : null;
}
