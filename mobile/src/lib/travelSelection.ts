// Session-only country choice shared by safety and existing phrase shortcuts.
// This is an explicit selection, never inferred from GPS or stored as history.
let selectedCountry = '';
export function readTravelCountry() { return selectedCountry; }
export function selectTravelCountry(country: string) {
  if (/^[A-Z]{2}$/.test(country)) selectedCountry = country;
}
