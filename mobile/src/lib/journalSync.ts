import { readJournal, writeJournal, journalPayload, reconcileJournal, type JournalEntry } from "./travelJournal";
import { deleteUserTrip, listUserTrips, upsertUserTrip } from "./supabaseData";

// Owned by App, so changing screens does not stop the queue. Account changes
// stop callbacks from an earlier session from writing into the current store.
export function startJournalSync(ownerId: string, accessToken: string) {
  let stopped = false;
  let running = false;
  let again = false;
  let refreshRemote = true;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    clearTimeout(timer);
    let failed = false;
    try {
      if (refreshRemote) {
        const snapshotIds = new Set(readJournal(ownerId).entries.map(item => item.id));
        const rows = await listUserTrips(ownerId, accessToken, "travel_journal");
        if (stopped) return;
        const remote: JournalEntry[] = rows.map(item => ({ id: item.clientKey || `journal-${item.id}`, remoteId: item.id,
          title: String(item.tripData.title || item.title), note: String(item.tripData.note || ""),
          entryDate: String(item.tripData.entry_date || item.createdAt.slice(0,10)), mood: String(item.tripData.mood || "✨"),
          place: String(item.tripData.place || item.destination || ""), countryCode: String(item.tripData.country_code || "") }));
        writeJournal(ownerId, reconcileJournal(readJournal(ownerId),remote,snapshotIds), true);
        refreshRemote = false;
      }
      const snapshot = readJournal(ownerId);
      for (const tombstone of snapshot.deleted) {
        if (stopped) return;
        if (tombstone.remoteId !== undefined) {
          try { await deleteUserTrip(ownerId,tombstone.remoteId,accessToken); }
          catch (error) { if ((error as { status?: number }).status !== 404) throw error; }
        }
        if (stopped) return;
        // Keep the id as a tombstone; older remote snapshots cannot resurrect it.
        if (tombstone.remoteId !== undefined) {
          const latest = readJournal(ownerId);
          latest.deleted = latest.deleted.map(item => item.id === tombstone.id && item.remoteId === tombstone.remoteId ? { id:item.id } : item);
          writeJournal(ownerId,latest,true);
        }
      }
      for (const entry of snapshot.entries.filter(item => item.remoteId === undefined)) {
        if (stopped) return;
        const current = readJournal(ownerId);
        if (current.deleted.some(item => item.id === entry.id)) continue;
        const saved = await upsertUserTrip(ownerId,journalPayload(entry),accessToken);
        if (stopped) return;
        const next = readJournal(ownerId);
        next.entries = next.entries.map(item => item.id === entry.id ? { ...item,remoteId:saved.id } : item);
        next.deleted = next.deleted.map(item => item.id === entry.id ? { ...item,remoteId:saved.id } : item);
        writeJournal(ownerId,next,true);
      }
      failures = 0;
    } catch { failed = true; failures += 1; }
    finally {
      running = false;
      if (!stopped && (again || failed)) {
        const delay = failed ? Math.min(300_000, 5000 * 2 ** Math.min(failures - 1,6)) : 0;
        again = false; timer = setTimeout(() => void flush(),delay);
      }
    }
  };
  const changed = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.ownerId === ownerId && !detail.fromSync) void flush();
  };
  const foreground = () => { if (document.visibilityState === "visible") { refreshRemote = true; void flush(); } };
  window.addEventListener("l2t:journal-change",changed);
  document.addEventListener("visibilitychange",foreground);
  void flush();
  return () => { stopped = true; clearTimeout(timer); window.removeEventListener("l2t:journal-change",changed); document.removeEventListener("visibilitychange",foreground); };
}
