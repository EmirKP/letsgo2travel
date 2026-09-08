import { publicJson } from "./fetch";
import { PRICE_BASELINES } from "./prices";
import type { CostData, InflationData, Rate } from "./types";
import { VERIFIED_MONTHLY_INDICES } from "./last-verified";
import { CITY_FX_REFERENCE_DATE } from "./city-benchmarks";

export async function getReferenceRate(currency: string): Promise<Rate | null> {
  if (currency === "GBP") return { base: "GBP", quote: "GBP", rate: 1, date: CITY_FX_REFERENCE_DATE, sourceUrl: "https://frankfurter.dev/" };
  const url = `https://api.frankfurter.dev/v2/rates?date=${CITY_FX_REFERENCE_DATE}&base=GBP&quotes=${currency}`;
  try {
    const rows = await publicJson<Array<{ base: string; quote: string; date: string; rate: number }>>(url, 86400);
    const row = Array.isArray(rows) ? rows.find(r => r.base === "GBP" && r.quote === currency && r.date === CITY_FX_REFERENCE_DATE && Number.isFinite(r.rate) && r.rate > 0) : null;
    return row ? { ...row, sourceUrl: "https://frankfurter.dev/" } : null;
  } catch { return null; }
}

type Eurostat = {
  id: string[]; size: number[]; value: Record<string, number>;
  dimension: Record<string, { category: { index: Record<string, number> } }>;
};

export function readMonthlyIndex(data: Eurostat, referenceMonth: string | null, now = new Date()): Omit<InflationData, "checkedAt" | "sourceUrl" | "provider"> | null {
  if (!Array.isArray(data.id) || data.id.at(-1) !== "time" || data.size.slice(0, -1).some(n => n !== 1)) return null;
  const currentMonth = now.toISOString().slice(0, 7);
  const points = Object.entries(data.dimension.time?.category.index || {})
    .map(([period, index]) => ({ period, value: data.value[String(index)] }))
    .filter(row => row.period <= currentMonth && /^\d{4}-\d{2}$/.test(row.period) && Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  const latest = points.at(-1);
  if (!latest) return null;
  const lastYear = `${Number(latest.period.slice(0, 4)) - 1}${latest.period.slice(4)}`;
  const prior = points.find(row => row.period === lastYear);
  const reference = points.find(row => row.period === referenceMonth);
  return { period: latest.period, annualPercent: prior ? (latest.value / prior.value - 1) * 100 : null,
    index: latest.value, referenceIndex: reference?.value ?? null, referenceMonth };
}

export async function getInflation(code: string, referenceMonth: string | null): Promise<InflationData | null> {
  const checkedAt = new Date().toISOString();
  const startYear = Math.max(new Date().getUTCFullYear() - 4, Math.min(new Date().getUTCFullYear() - 1, Number(referenceMonth?.slice(0, 4)) || 9999));
  const eurostatUrl = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?lang=EN&freq=M&unit=I25&coicop18=TOTAL&geo=${code === "GR" ? "EL" : code}&sinceTimePeriod=${startYear}-01`;
  try {
    const raw = await publicJson<Eurostat>(eurostatUrl, 21_600);
    const result = readMonthlyIndex(raw, referenceMonth);
    if (result) return { ...result, checkedAt, freshness: "live", provider: "Eurostat", sourceUrl: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table" };
  } catch { /* Coverage differs by country; continue with explicitly annual data. */ }
  const saved = VERIFIED_MONTHLY_INDICES[code];
  const age = saved ? Date.now() - Date.parse(saved.checkedAt) : Infinity;
  if (saved && age >= 0 && age <= 45 * 86_400_000) {
    const periods = Object.keys(saved.points).sort();
    const raw = { id: ["time"], size: [periods.length], dimension: { time: { category: { index: Object.fromEntries(periods.map((p, i) => [p, i])) } } }, value: Object.fromEntries(periods.map((p, i) => [String(i), saved.points[p]])) };
    const result = readMonthlyIndex(raw, referenceMonth);
    if (result) return { ...result, checkedAt: saved.checkedAt, freshness: "last-known", provider: "Eurostat", sourceUrl: "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table" };
  }
  try {
    const raw = await publicJson<unknown[]>(`https://api.worldbank.org/v2/country/${code}/indicator/FP.CPI.TOTL.ZG?format=json&mrnev=3&per_page=3`, 86_400, 6000);
    if (!Array.isArray(raw[1])) return null;
    const rows = (raw[1] as Array<{ date: string; value: number | null }>).filter(row => /^\d{4}$/.test(row.date)
      && Number(row.date) <= new Date().getUTCFullYear() && typeof row.value === "number" && Number.isFinite(row.value));
    rows.sort((a, b) => b.date.localeCompare(a.date));
    if (!rows[0]) return null;
    return { provider: "World Bank", period: rows[0].date, annualPercent: rows[0].value,
      index: null, referenceIndex: null, referenceMonth, checkedAt,
      sourceUrl: `https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=${code}` };
  } catch { return null; }
}

export async function getRates(currencies: string[], quote = "TRY"): Promise<Record<string, Rate>> {
  // One request for all currencies, then invert the published quote-to-local
  // ratio. This prevents mixing exchange dates across a hand-maintained table.
  const sources = [...new Set(currencies.filter(currency => currency !== quote))].sort();
  const result: Record<string, Rate> = { [quote]: { base: quote, quote, rate: 1, date: new Date().toISOString().slice(0, 10), sourceUrl: "https://frankfurter.dev/" } };
  if (!sources.length) return result;
  const sourceUrl = `https://api.frankfurter.dev/v2/rates?base=${quote}&quotes=${sources.join(",")}`;
  try {
    const raw = await publicJson<Array<{ base: string; quote: string; rate: number; date: string }>>(sourceUrl, 3600);
    if (!Array.isArray(raw)) return result;
    for (const row of raw) {
      if (row.base !== quote || !sources.includes(row.quote) || !Number.isFinite(row.rate) || row.rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      result[row.quote] = { base: row.quote, quote, rate: 1 / row.rate, date: row.date, sourceUrl: "https://frankfurter.dev/" };
    }
  } catch { /* Return unavailable currencies as missing, never as zero. */ }
  return result;
}

export async function listCosts(): Promise<CostData[]> {
  const [rates, inflations] = await Promise.all([
    getRates(PRICE_BASELINES.map(item => item.currency)),
    Promise.all(PRICE_BASELINES.map(item => getInflation(item.code, item.referenceMonth))),
  ]);
  return PRICE_BASELINES.map((baseline, i) => ({ baseline, fx: rates[baseline.currency] || null, inflation: inflations[i] }));
}
