import type { CityBenchmark } from "./city-benchmarks";

export const BUDGET_CURRENCIES = ["TRY", "EUR", "USD", "GBP"] as const;
export type BudgetCurrency = typeof BUDGET_CURRENCIES[number];

export function validBudgetCount(value: string | number, maximum: number) {
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= maximum ? number : null;
}

/** Deliberately models only the three measured components, not all 12 basket items. */
export function tripBudget(row: Pick<CityBenchmark, "hotel" | "meal" | "travel">, daysInput: string | number, peopleInput: string | number) {
  const days = validBudgetCount(daysInput, 30), people = validBudgetCount(peopleInput, 20);
  if (!days || !people || ![row.hotel, row.meal, row.travel].every(value => Number.isFinite(value) && value >= 0)) return null;
  const nights = days - 1;
  const rooms = Math.ceil(people / 2);
  // Source hotel is a 2-person room for 2 nights; a solo traveller still needs a room.
  const hotel = row.hotel / 2 * nights * rooms;
  // Source meal is one dinner for 2. Scenario assumes one such dinner each day.
  const meals = row.meal / 2 * people * days;
  // Source transit is one 48-hour pass/person; round up to complete pass periods.
  const travel = row.travel * people * Math.ceil(days / 2);
  const total = hotel + meals + travel;
  return { days, people, nights, rooms, hotel, meals, travel, total, perPerson: total / people, perPersonDay: total / people / days };
}

export function usableBudgetRate(value: { base: string; quote: string; date: string; rate: number } | null, currency: BudgetCurrency, now = Date.now()) {
  if (currency === "GBP") return 1;
  if (!value || value.base !== "GBP" || value.quote !== currency || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  const age = now - Date.parse(`${value.date}T00:00:00Z`);
  return Number.isFinite(value.rate) && value.rate > 0 && age >= 0 && age <= 7 * 86400000 ? value.rate : null;
}
