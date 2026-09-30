import { BUDGET_CURRENCIES, validBudgetCount, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";

const KEY = "l2t-cost-preferences-v1";
export type BudgetPreferences = { currency: BudgetCurrency; days: string; people: string };
const DEFAULT: BudgetPreferences = { currency: "TRY", days: "3", people: "2" };
export function readBudgetPreferences(): BudgetPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (value && BUDGET_CURRENCIES.includes(value.currency) && validBudgetCount(value.days, 30) && validBudgetCount(value.people, 20)) return { currency: value.currency, days: String(value.days), people: String(value.people) };
  } catch { /* Browsing must work without storage. */ }
  return { ...DEFAULT };
}
export function saveBudgetPreferences(value: BudgetPreferences) {
  if (!validBudgetCount(value.days, 30) || !validBudgetCount(value.people, 20)) return;
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Keep the current session usable. */ }
}
