import { requestJson, ApiError } from "./api";
import { config } from "./config";
import { onAccountResume } from "./accountResume";
import { COLLECTION_CHANGE, applyCollectionOperations, emptyCollection, readCollection, validateCollection, writeCollection, type CollectionKind, type CollectionDocument } from "./accountCollections";
import { readSavedPlaces, validateAccountPlaces } from "./savedPlaces";
import { getSavedTravelEvents, validateAccountEvents } from "./storage";

type Remote = { revision: number; document: CollectionDocument };
const chains = new Map<string, Promise<unknown>>();
const validated = (kind: CollectionKind, value: unknown): value is CollectionDocument => validateCollection(value)
  && (kind === "saved_places" ? validateAccountPlaces(value) : validateAccountEvents(value));
export function syncAccountCollection(owner: string, token: string, kind: CollectionKind, active: () => boolean = () => true): Promise<void> {
  const key = `${owner}:${kind}`;
  const task = (chains.get(key) || Promise.resolve()).catch(() => undefined).then(async () => {
    if (!active()) return;
    // Only events had a trustworthy account-scoped legacy store. The places
    // reader never imports the old shared device list into an account.
    if (kind === "saved_events") getSavedTravelEvents(owner);
    else if (readSavedPlaces(owner).error) throw new Error("corrupt");
    const base = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1`;
    const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` };
    for (let attempt = 0; attempt < 4 && active(); attempt++) {
      const rows = await requestJson<Remote[]>(`${base}/account_collections?${new URLSearchParams({ owner_id: `eq.${owner}`, kind: `eq.${kind}`, select: "revision,document", limit: "1" })}`, { headers });
      if (!active()) return;
      const remote = rows[0] || { revision: 0, document: emptyCollection() };
      if (!Number.isSafeInteger(remote.revision) || remote.revision < 0 || !validated(kind, remote.document)) throw new Error("invalid_remote");
      const snapshot = readCollection(owner, kind);
      const document = applyCollectionOperations(remote.document, snapshot.pending);
      if (!validated(kind, document)) throw new Error("invalid_local");
      let saved = remote;
      if (snapshot.pending.length) {
        try {
          const result = await requestJson<Remote[]>(`${base}/rpc/save_account_collection`, { method: "POST", headers,
            body: { p_owner_id: owner, p_kind: kind, p_expected_revision: remote.revision, p_document: document } });
          saved = result[0];
          if (!saved || !Number.isSafeInteger(saved.revision) || saved.revision <= remote.revision || !validated(kind, saved.document)) throw new Error("invalid_remote");
        } catch (error) {
          if (!active()) return;
          if (error instanceof ApiError && (error.status === 409 || error.code === "40001") && attempt < 3) continue;
          throw error;
        }
      }
      if (!active()) return;
      const latest = readCollection(owner, kind);
      const acknowledged = new Set(snapshot.pending.map(op => op.id));
      const pending = latest.pending.filter(op => !acknowledged.has(op.id));
      writeCollection(owner, kind, { version: 1, revision: saved.revision, document: applyCollectionOperations(saved.document, pending), pending }, true);
      return;
    }
  });
  chains.set(key, task);
  void task.finally(() => { if (chains.get(key) === task) chains.delete(key); }).catch(() => undefined);
  return task;
}
export function startAccountCollectionSync(owner: string, token: string) {
  let stopped = false, running = false, again = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true; clearTimeout(timer);
    let failed = false;
    try {
      const results = await Promise.allSettled((["saved_places", "saved_events"] as const).map(kind => syncAccountCollection(owner, token, kind, () => !stopped)));
      failed = results.some(result => result.status === "rejected");
      failures = failed ? failures + 1 : 0;
    } finally {
      running = false;
      if (!stopped && (failed || again)) {
        again = false;
        timer = setTimeout(() => void run(), failed ? Math.min(300_000, 5000 * 2 ** Math.min(failures - 1, 6)) : 0);
      }
    }
  };
  const change = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.ownerId === owner && !detail.fromSync) void run(); };
  window.addEventListener(COLLECTION_CHANGE, change);
  const stopResume = onAccountResume(() => { void run(); });
  void run();
  return () => { stopped = true; clearTimeout(timer); stopResume(); window.removeEventListener(COLLECTION_CHANGE, change); };
}
