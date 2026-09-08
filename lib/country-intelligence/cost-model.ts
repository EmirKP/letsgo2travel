import type { CostData } from "./types";

export type Area = "average" | "centre" | "outside";
// These are editable planning scenarios, not measured neighbourhood prices.
// Transport grows outside the centre instead of applying a blanket discount.
export const DEFAULT_AREA_SCENARIO = {
  accommodationShare: 0.4, foodShare: 0.3, transportShare: 0.15, otherShare: 0.15,
  centre: { accommodation: 1.2, food: 1.1, transport: 0.8 },
  outside: { accommodation: 0.8, food: 0.9, transport: 1.5 },
};

export function estimateCost(data: CostData, area: Area, now = new Date()) {
  const { baseline, fx, inflation } = data;
  const age = fx ? (now.getTime() - Date.parse(`${fx.date}T00:00:00Z`)) / 86_400_000 : Infinity;
  const rateUsable = !!fx && fx.base === baseline.currency && fx.quote === "TRY"
    && Number.isFinite(fx.rate) && fx.rate > 0 && age >= 0 && age <= 7;
  const monthlyIndex = inflation?.provider === "Eurostat" && inflation.referenceMonth === baseline.referenceMonth
    && inflation.referenceIndex && inflation.index && inflation.period >= (baseline.referenceMonth || "")
    ? inflation.index / inflation.referenceIndex : null;
  // Never extrapolate current prices from an old annual inflation percentage,
  // or apply Turkish inflation to an expense denominated in another currency.
  const inflationApplied = typeof monthlyIndex === "number" && Number.isFinite(monthlyIndex) && monthlyIndex > 0;
  const inflationFactor = inflationApplied ? monthlyIndex : 1;
  const s = DEFAULT_AREA_SCENARIO;
  const areaFactor = area === "average" ? 1 :
    s.accommodationShare * s[area].accommodation + s.foodShare * s[area].food
    + s.transportShare * s[area].transport + s.otherShare;
  const localDaily = baseline.daily * inflationFactor * areaFactor;
  const converted = rateUsable ? localDaily * fx.rate : null;
  return { localDaily, converted, inflationApplied, inflationFactor,
    areaFactor, rateUsable, low: converted === null ? null : converted * .8,
    high: converted === null ? null : converted * 1.3 };
}

export function quoteComparison(centreNight: number, outsideNight: number, extraTransport: number, nights: number, days: number, people: number) {
  if (![centreNight, outsideNight, extraTransport].every(n => Number.isFinite(n) && n >= 0 && n <= 1_000_000)
    || !Number.isInteger(nights) || nights < 1 || nights > 365
    || !Number.isInteger(days) || days < nights || days > 366
    || !Number.isInteger(people) || people < 1 || people > 99) return null;
  // Accommodation is the whole room quote; transport is per traveller/day.
  const centre = centreNight * nights;
  const outside = outsideNight * nights + extraTransport * days * people;
  return { centre, outside, saving: centre - outside };
}
