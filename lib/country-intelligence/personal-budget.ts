import type { CityBenchmark } from "./city-benchmarks";

export type PersonalBudgetInput = {
  days: string; startDate: string; endDate: string; adults: string; children: string; rooms: string;
  accommodation: "hostel" | "apartment" | "hotel"; stars: "2" | "3" | "4" | "5";
  roomType: "single" | "double" | "family"; style: "economical" | "standard" | "comfort";
  food: "self-catering" | "local" | "restaurants"; transport: "walk" | "public" | "taxi";
  activities: "free" | "mixed" | "paid"; activityAllowance: string;
  season: "auto" | "low" | "normal" | "high"; holiday: boolean; buffer: string;
};
export const DEFAULT_PERSONAL_BUDGET: PersonalBudgetInput = {
  days: "3", startDate: "", endDate: "", adults: "2", children: "0", rooms: "1",
  accommodation: "hotel", stars: "3", roomType: "double", style: "standard", food: "local",
  transport: "public", activities: "free", activityAllowance: "", season: "auto", holiday: false, buffer: "10",
};

// All coefficients below are explicit planning assumptions, never researched
// hostel, apartment, star-category, seasonal or child prices. Measured inputs
// remain the dated hotel room, dinner and 48-hour transit benchmark only.
export const PERSONAL_BUDGET_FACTORS = {
  style: { economical: { hotel: .85, food: .9, travel: .9 }, standard: { hotel: 1, food: 1, travel: 1 }, comfort: { hotel: 1.25, food: 1.2, travel: 1.15 } },
  stars: { "2": .8, "3": 1, "4": 1.4, "5": 2 },
  room: { single: { capacity: 1, factor: .8 }, double: { capacity: 2, factor: 1 }, family: { capacity: 4, factor: 1.5 } },
  food: { "self-catering": 1, local: 1.7, restaurants: 2.5 },
  season: { low: .85, normal: 1, high: 1.25 }, holiday: 1.2,
};

function count(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}
function nonnegative(value: string, max: number, precision = 2) {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(value)) return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}
export function calendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const n = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
}
export function personalBudgetDuration(input: Pick<PersonalBudgetInput, "startDate" | "endDate" | "days">) {
  if (input.startDate || input.endDate) {
    const start = calendarDay(input.startDate), end = calendarDay(input.endDate);
    if (start === null || end === null || end < start) return null;
    const nights = (end - start) / 86400000;
    return nights <= 29 ? { days: nights + 1, nights } : null;
  }
  const days = count(input.days, 1, 30);
  return days === null ? null : { days, nights: days - 1 };
}
export function minimumBudgetRooms(input: Pick<PersonalBudgetInput, "adults" | "children" | "roomType">) {
  const adults = count(input.adults, 1, 20), children = count(input.children, 0, 19);
  const room = Object.hasOwn(PERSONAL_BUDGET_FACTORS.room, input.roomType) ? PERSONAL_BUDGET_FACTORS.room[input.roomType] : null;
  return adults === null || children === null || !room || adults + children > 20 ? null : Math.ceil((adults + children) / room.capacity);
}
export function validatePersonalBudget(input: PersonalBudgetInput) {
  const duration = personalBudgetDuration(input);
  if (!duration) return "dates" as const;
  const adults = count(input.adults, 1, 20), children = count(input.children, 0, 19), rooms = count(input.rooms, 1, 20);
  const minimum = minimumBudgetRooms(input);
  if (adults === null || children === null || minimum === null) return "party" as const;
  if (!(input.accommodation === "hostel" || input.accommodation === "apartment" || input.accommodation === "hotel")
    || !Object.hasOwn(PERSONAL_BUDGET_FACTORS.stars, input.stars) || !Object.hasOwn(PERSONAL_BUDGET_FACTORS.style, input.style)
    || !Object.hasOwn(PERSONAL_BUDGET_FACTORS.food, input.food) || !["walk", "public", "taxi"].includes(input.transport)
    || !["auto", "low", "normal", "high"].includes(input.season) || typeof input.holiday !== "boolean"
    || !["free", "mixed", "paid"].includes(input.activities)) return "preferences" as const;
  if (duration.nights && input.accommodation !== "hostel" && (rooms === null || rooms < minimum)) return "rooms" as const;
  if (nonnegative(input.buffer, 50) === null || (input.activityAllowance !== "" && nonnegative(input.activityAllowance, 100000, 6) === null)) return "allowance" as const;
  return null;
}

export type BudgetRange = { low: number; high: number };
export function personalTripBudget(row: Pick<CityBenchmark, "hotel" | "meal" | "travel">, input: PersonalBudgetInput, allowanceToGbp = 1) {
  if (validatePersonalBudget(input) || ![row.hotel, row.meal, row.travel].every(n => Number.isFinite(n) && n >= 0)
    || !Number.isFinite(allowanceToGbp) || allowanceToGbp <= 0) return null;
  const { days, nights } = personalBudgetDuration(input)!;
  const adults = Number(input.adults), children = Number(input.children), people = adults + children;
  const rooms = nights === 0 || input.accommodation === "hostel" ? 0 : Number(input.rooms);
  const style = PERSONAL_BUDGET_FACTORS.style[input.style];
  // Broad calendar scenario for comparison; destination-specific season and
  // actual holidays must be chosen by the traveller, never asserted as facts.
  const month = input.startDate ? Number(input.startDate.slice(5, 7)) : null;
  const season = input.season !== "auto" ? input.season : month === null ? "normal" : month >= 6 && month <= 8 ? "high" : month <= 2 || month === 11 ? "low" : "normal";
  const seasonFactor = PERSONAL_BUDGET_FACTORS.season[season];
  const holidayFactor = input.holiday ? PERSONAL_BUDGET_FACTORS.holiday : 1;
  const roomFactor = PERSONAL_BUDGET_FACTORS.room[input.roomType].factor;
  const lodgingUnits = input.accommodation === "hostel" ? people * .3 : rooms * roomFactor * (input.accommodation === "apartment" ? .9 : PERSONAL_BUDGET_FACTORS.stars[input.stars]);
  const hotel = row.hotel / 2 * nights * lodgingUnits * style.hotel * seasonFactor * holidayFactor;
  // Dinner is the only measured meal. The selected factor models a full day's
  // food; children use an explicit 70% portion allowance, not a claimed discount.
  const meals = row.meal / 2 * days * (adults + children * .7) * PERSONAL_BUDGET_FACTORS.food[input.food] * style.food;
  const travel = input.transport === "walk" ? 0 : row.travel * people * Math.ceil(days / 2) * style.travel * (input.transport === "taxi" ? 3 : 1);
  const activities = input.activities === "free" ? 0 : input.activityAllowance === "" ? null : Number(input.activityAllowance) * allowanceToGbp * people * days;
  const unpricedTaxi = input.transport === "taxi" && row.travel === 0;
  const subtotal = hotel + meals + travel + (activities || 0);
  const contingency = subtotal * Number(input.buffer) / 100;
  const total = subtotal + contingency;
  const range = (value: number, low = .8, high = 1.35): BudgetRange => ({ low: value * low, high: value * high });
  const hotelRange = range(hotel, .75, input.holiday || season === "high" ? 1.5 : 1.35);
  const mealsRange = range(meals), travelRange = input.transport === "taxi" ? range(travel, .7, 1.6) : range(travel);
  const activitiesRange = activities === null ? null : { low: activities, high: activities };
  const factor = 1 + Number(input.buffer) / 100;
  const totalRange = { low: (hotelRange.low + mealsRange.low + travelRange.low + (activities || 0)) * factor, high: (hotelRange.high + mealsRange.high + travelRange.high + (activities || 0)) * factor };
  return { days, nights, adults, children, people, rooms, hotel, meals, travel, activities, contingency, total,
    partial: activities === null || unpricedTaxi, unpricedTaxi, perPerson: total / people, perPersonDay: total / people / days,
    totalRange, perPersonRange: { low: totalRange.low / people, high: totalRange.high / people },
    perPersonDayRange: { low: totalRange.low / people / days, high: totalRange.high / people / days },
    ranges: { hotel: hotelRange, meals: mealsRange, travel: travelRange, activities: activitiesRange, contingency: { low: totalRange.low / factor * Number(input.buffer) / 100, high: totalRange.high / factor * Number(input.buffer) / 100 } },
    season, seasonFactor, holidayFactor, model: "personal-budget-v1" as const,
  };
}
