import { DEFAULT_PERSONAL_BUDGET, validatePersonalBudget, type PersonalBudgetInput } from "../../../lib/country-intelligence/personal-budget";
import { BUDGET_CURRENCIES, type BudgetCurrency } from "../../../lib/country-intelligence/trip-budget";
export type PersonalBudgetPreferences = PersonalBudgetInput & { currency: BudgetCurrency };
const key = (ownerId?: string | null) => `l2t-personal-budget-v1:${ownerId || "guest"}`;
export function readPersonalBudgetPreferences(ownerId?: string | null): PersonalBudgetPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key(ownerId)) || "null");
    if (value && !validatePersonalBudget(value) && BUDGET_CURRENCIES.includes(value.currency)) return value;
  } catch { /* The calculator remains usable without saved preferences. */ }
  return { ...DEFAULT_PERSONAL_BUDGET, currency: "TRY" };
}
export function savePersonalBudgetPreferences(value: PersonalBudgetPreferences, ownerId?: string | null) {
  if (validatePersonalBudget(value) || !BUDGET_CURRENCIES.includes(value.currency)) return;
  try { localStorage.setItem(key(ownerId), JSON.stringify(value)); } catch { /* Retain the current session. */ }
}
