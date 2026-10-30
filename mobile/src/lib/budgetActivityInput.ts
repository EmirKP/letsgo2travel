/** Existing preferences and saved estimates retain GBP as their canonical unit. */
export function activityAllowanceFromGbp(value: string, rate: number): string {
  if (value === "" || rate === 1) return value;
  const amount = Number(value) * rate;
  return Number.isFinite(amount) && rate > 0 ? String(Math.round((amount + Number.EPSILON) * 100) / 100) : value;
}

export function activityAllowanceToGbp(value: string, rate: number): string {
  if (value === "" || rate === 1) return value;
  const amount = Number(value) / rate;
  return Number.isFinite(amount) && rate > 0 ? amount.toFixed(6).replace(/\.?0+$/, "") : value;
}
