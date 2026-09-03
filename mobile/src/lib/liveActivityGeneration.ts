/** Kalıcı sayaçtan sonraki güvenli Live Activity login generation'ı. */
export function nextSessionGenerationValue(raw: unknown): number {
  const current = Number(raw);
  const safeCurrent = Number.isSafeInteger(current) && current >= 0 ? current : 0;
  return safeCurrent < Number.MAX_SAFE_INTEGER ? safeCurrent + 1 : 0;
}
