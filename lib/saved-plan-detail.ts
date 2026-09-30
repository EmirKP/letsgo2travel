type SavedDetailRoute = { name: string; country: string; why: string; estimatedBudget: string; idealDuration: string; dailyPlan: string[]; warnings: string[]; visaNote: string; visaSourceUrl: string; visaVerifiedAt: string };
export type SavedPlanDetailData = { title: string; summary: string; createdAt: string; preferences: string; routes: SavedDetailRoute[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, maximum = 3000) => typeof value === "string" ? value.slice(0, maximum) : "";
const strings = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === "string").slice(0, 30).map(item => text(item)) : [];
export function readSavedPlanDetail(value: unknown): SavedPlanDetailData | null {
  const row = record(value), data = record(row.trip_data), plan = record(data.plan), input = record(data.input);
  if (!Array.isArray(plan.routes)) return null;
  const routes = plan.routes.slice(0, 30).map(record).filter(route => typeof route.name === "string" && route.name.trim()).map(route => {
    let visaSourceUrl = "";
    try { const url = new URL(text(route.visaSourceUrl)); if (url.protocol === "https:") visaSourceUrl = url.href; } catch { /* Missing/unsafe source link is omitted. */ }
    return { name: text(route.name, 240), country: text(route.country, 240), why: text(route.why), estimatedBudget: text(route.estimatedBudget), idealDuration: text(route.idealDuration), dailyPlan: strings(route.dailyPlan), warnings: strings(route.warnings), visaNote: text(route.visaNote), visaVerifiedAt: text(route.visaVerifiedAt, 40), visaSourceUrl };
  });
  if (!routes.length) return null;
  const createdAt = text(data.saved_at || row.created_at, 40);
  if (!Number.isFinite(Date.parse(createdAt))) return null;
  return { title: text(row.title, 160) || routes.map(route => route.name).join(" · "), summary: text(plan.summary), createdAt, preferences: [input.origin, input.days, input.month].filter(item => typeof item === "string" && item).join(" · "), routes };
}
