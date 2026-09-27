import type { CockpitTrip } from "./supabaseData";

/** Read-only presentation. Provider flight details are never copied or persisted. */
export function nextHomeJourney(trips: CockpitTrip[], today: string) {
  return trips.filter(trip => trip.status === "active" || (trip.status === "upcoming" && trip.endDate >= today))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.startDate.localeCompare(b.startDate))[0] || null;
}

export function homeJourneyStep(trip: CockpitTrip, today: string) {
  const checklist = trip.checklistItems.filter(item => item.kind !== "event");
  const completed = checklist.filter(item => item.completed).length;
  const nextItem = checklist.find(item => !item.completed);
  const stage = trip.endDate < today ? "wrap-up" : trip.status === "active" || trip.startDate <= today ? "travelling" : "preparing";
  return { stage, completed, total: checklist.length, nextItem };
}
