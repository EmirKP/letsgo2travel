/** The public destination is encoded in history, so refresh and Back retain it. */
export function cityCodeFromUrl(value: string): string | null {
  try {
    const hash = new URL(value, 'https://app.invalid').hash;
    return /^#\/?city\/([a-z0-9]{3})$/i.exec(hash)?.[1].toUpperCase() || null;
  } catch { return null; }
}

export function cityHash(code: string): string {
  if (!/^[A-Z0-9]{3}$/.test(code)) throw new Error('invalid_destination');
  return `#city/${code}`;
}

/** Country selection is part of catalogue history, not a different city. */
export function cityCountryFromUrl(value: string): string | null {
  try {
    const hash = new URL(value, 'https://app.invalid').hash;
    return /^#\/?cities\/([a-z]{2})$/i.exec(hash)?.[1].toUpperCase() || null;
  } catch { return null; }
}

export function cityCatalogueHash(countryCode?: string | null): string {
  if (!countryCode) return '#cities';
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('invalid_country');
  return `#cities/${countryCode}`;
}
