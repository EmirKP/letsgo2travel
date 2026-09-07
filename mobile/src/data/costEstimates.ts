// Existing Build 24 web budget examples, not measured prices or live quotes.
// Values are TRY per traveller per day, including the example accommodation allowance.
export type CostEstimate = { code: string; city: string; cityEn: string; country: string; countryEn: string; hotel: number; food: number; transport: number; activities: number };
export const COST_EXAMPLES: CostEstimate[] = [
  {code:"BA",city:"Saraybosna",cityEn:"Sarajevo",country:"Bosna Hersek",countryEn:"Bosnia and Herzegovina",hotel:1300,food:700,transport:180,activities:250},
  {code:"GE",city:"Tiflis",cityEn:"Tbilisi",country:"Gürcistan",countryEn:"Georgia",hotel:1400,food:650,transport:150,activities:250},
  {code:"AZ",city:"Bakü",cityEn:"Baku",country:"Azerbaycan",countryEn:"Azerbaijan",hotel:1700,food:800,transport:180,activities:300},
  {code:"RS",city:"Belgrad",cityEn:"Belgrade",country:"Sırbistan",countryEn:"Serbia",hotel:1800,food:900,transport:220,activities:350},
  {code:"IT",city:"Roma",cityEn:"Rome",country:"İtalya",countryEn:"Italy",hotel:3200,food:1500,transport:430,activities:900},
  {code:"AE",city:"Dubai",cityEn:"Dubai",country:"BAE",countryEn:"UAE",hotel:3600,food:1800,transport:800,activities:1200},
];
export const costPerDay = (item: Pick<CostEstimate,"hotel"|"food"|"transport"|"activities">) => item.hotel + item.food + item.transport + item.activities;
export function budgetTotal(values: string[], days: string, people: string): number | null {
  if (!values.every(v => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1_000_000)) return null;
  const d=Number(days),p=Number(people);
  if (!Number.isInteger(d)||d<1||d>365||!Number.isInteger(p)||p<1||p>99) return null;
  return Math.round(values.reduce((sum,v)=>sum+Number(v),0)*d*p*100)/100;
}
