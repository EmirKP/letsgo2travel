import { CITY_BENCHMARKS } from '../../../lib/country-intelligence/city-benchmarks';
import type { BudgetCockpitIntent } from './budgetCockpitIntent';
import type { CockpitTrip } from './supabaseData';
import { normalizeSearchText } from './searchText';

/** Compare context only; a saved estimate must never be recalculated implicitly. */
export function budgetTripContext(budget: BudgetCockpitIntent, trip: Pick<CockpitTrip, 'destinationCode' | 'destinationCity' | 'startDate' | 'endDate'>) {
  const source = CITY_BENCHMARKS.find(row => row.id === budget.sourceBenchmarkId);
  const cityNames = [budget.city, ...Object.values(source?.city || {})].map(normalizeSearchText);
  const tripCity = trip.destinationCity || '';
  const tripDays = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1;
  const country = Boolean(trip.destinationCode && budget.countryCode !== trip.destinationCode);
  const city = Boolean(tripCity.trim() && !cityNames.includes(normalizeSearchText(tripCity)));
  const days = Number.isFinite(tripDays) && tripDays !== budget.estimate.days;
  const dates = Boolean(budget.personalPreferences?.startDate && (budget.personalPreferences.startDate !== trip.startDate || budget.personalPreferences.endDate !== trip.endDate));
  return { country, city, days, dates, tripDays, differs: country || city || days || dates };
}
