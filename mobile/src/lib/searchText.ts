/** Search accepts plain keyboards and Turkish I variants in either UI language. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[ıI]/g, "i").toLowerCase().trim().replace(/\s+/g, " ");
}
