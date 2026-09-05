import { isCalendarDate, localIsoDate } from "./dates";

export type JournalEntry = {
  id: string; remoteId?: string | number; title: string; note: string;
  place: string; countryCode: string; entryDate: string; mood: string;
};
export type JournalStore = { entries: JournalEntry[]; deleted: Array<{ id: string; remoteId?: string | number }> };
const key = (ownerId?: string | null) => `l2t.mobile.travel-journal.v2:${ownerId || "guest"}`;

export function readJournal(ownerId?: string | null): JournalStore {
  const raw = localStorage.getItem(key(ownerId)) || localStorage.getItem(`l2t.mobile.travel-journal.v1:${ownerId || "guest"}`) || "[]";
  const value = JSON.parse(raw);
  const entries = Array.isArray(value) ? value : value?.entries;
  return {
    entries: (Array.isArray(entries) ? entries : []).filter((entry: JournalEntry) => entry && typeof entry.id === "string" && typeof entry.title === "string").map((entry: JournalEntry) => ({
      ...entry, title: entry.title.slice(0,120), note: String(entry.note || "").slice(0,1200),
      entryDate: isCalendarDate(entry.entryDate) ? entry.entryDate : "", mood: String(entry.mood || "✨"),
    })),
    deleted: Array.isArray(value?.deleted) ? value.deleted.filter((item: { id?: unknown }) => typeof item?.id === "string") : [],
  };
}

export function writeJournal(ownerId: string | null | undefined, value: JournalStore, fromSync = false) {
  // One write commits entries and tombstones together. Never truncate memories.
  localStorage.setItem(key(ownerId), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("l2t:journal-change", { detail: { ownerId: ownerId || null, fromSync } }));
}

export function validJournalDraft(title: string, note: string, date: string, today = localIsoDate()) {
  return title.trim().length >= 2 && note.trim().length >= 2 && isCalendarDate(date) && date <= today;
}

export function journalPayload(entry: JournalEntry) {
  return { title: entry.title, destination: entry.place || "Seyahat günlüğü", mobileKind: "travel_journal" as const, clientKey: entry.id,
    tripData: { title: entry.title, note: entry.note, entry_date: entry.entryDate, mood: entry.mood, place: entry.place, country_code: entry.countryCode } };
}

export function reconcileJournal(local: JournalStore, remote: JournalEntry[], snapshotIds: Set<string>): JournalStore {
  const deletedIds = new Set(local.deleted.map(item => item.id));
  const localById = new Map(local.entries.map(item => [item.id,item]));
  const remoteIds = new Set(remote.map(item => item.id));
  return { deleted: local.deleted, entries: [
    ...remote.filter(item => !deletedIds.has(item.id)).map(item => localById.get(item.id)?.remoteId === undefined && localById.has(item.id) ? { ...localById.get(item.id)!, remoteId: item.remoteId } : item),
    ...local.entries.filter(item => !deletedIds.has(item.id) && !remoteIds.has(item.id) && (item.remoteId === undefined || !snapshotIds.has(item.id))),
  ].sort((a,b) => b.entryDate.localeCompare(a.entryDate)) };
}
