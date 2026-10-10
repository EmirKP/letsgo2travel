import type { RouteSuggestion, SavedRoutePlan } from "../types";

/** A stale picker must never append a stop to another route after account sync. */
export function findSocialRoute(saved: SavedRoutePlan, selected: RouteSuggestion): number {
  const matches = saved.plan.routes.map((route, index) => ({route, index})).filter(({route}) =>
    route.name === selected.name && route.country === selected.country && route.cityOrRegion === selected.cityOrRegion && route.destinationCode === selected.destinationCode);
  return matches.length === 1 ? matches[0].index : -1;
}
/** Append a chosen stop without regenerating or losing the user's itinerary. */
export function appendSocialPlace(saved: SavedRoutePlan, routeIndex: number, dayIndex: number, name: string): SavedRoutePlan {
  const route = saved.plan.routes[routeIndex];
  if (!route || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= route.dailyPlan.length || !name.trim() || name.length > 120) throw new Error('invalid');
  const stop = name.trim();
  const existing = route.dailyPlan[dayIndex];
  if (existing.split('\n').some(line => line.replace(/^[•-]\s*/, '').trim().toLocaleLowerCase() === stop.toLocaleLowerCase())) return saved;
  const text = `${existing}\n• ${stop}`;
  if (text.length > 600) throw new Error('full');
  return {...saved,plan:{...saved.plan,routes:saved.plan.routes.map((item,index)=>index===routeIndex?{...item,dailyPlan:item.dailyPlan.map((day,index)=>index===dayIndex?text:day)}:item)}};
}
