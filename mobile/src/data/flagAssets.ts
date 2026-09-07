// Bundled flag-icons (MIT) assets: no network or platform emoji support needed.
export function countryFlagAsset(code: string) {
  const normalized = code.trim().toLowerCase();
  const alpha2 = normalized === "xkk" || normalized === "xkx" ? "xk" : normalized;
  return /^[a-z]{2}$/.test(alpha2) ? `${import.meta.env.BASE_URL}flags/${alpha2}.svg` : "";
}
