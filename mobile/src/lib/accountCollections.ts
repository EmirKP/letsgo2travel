import { createId } from "./id";

export type CollectionKind = "saved_places" | "saved_events";
export type CollectionDocument = { items: Record<string, unknown>; dayIds: string[] };
export type CollectionOperation = { id: string; action: "add" | "remove" | "patch" | "replace" | "day-add" | "day-remove" | "day-before"; key: string; value?: unknown };
export type CollectionEnvelope = { version: 1; document: CollectionDocument; pending: CollectionOperation[]; revision: number | null };
export const COLLECTION_CHANGE = "l2t:account-collection-change";
const MAX_BYTES = 1_000_000;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
export function collectionKey(owner: string, kind: CollectionKind) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(owner)) throw new Error("invalid_owner");
  return `l2t.account-collection.v1:${owner}:${kind}`;
}
export const emptyCollection = (): CollectionDocument => ({ items: {}, dayIds: [] });
export function validateCollection(value: unknown): value is CollectionDocument {
  if (!record(value) || !record(value.items) || !Array.isArray(value.dayIds)) return false;
  const keys = Object.keys(value.items);
  return keys.length <= 1000 && keys.every(key => key.length > 0 && key.length <= 180 && !["__proto__", "constructor", "prototype"].includes(key))
    && value.dayIds.length <= 1000 && new Set(value.dayIds).size === value.dayIds.length
    && value.dayIds.every(key => typeof key === "string" && Object.hasOwn(value.items as object, key));
}
export function readCollection(owner: string, kind: CollectionKind): CollectionEnvelope {
  const raw = window.localStorage.getItem(collectionKey(owner, kind));
  if (raw === null) return { version: 1, document: emptyCollection(), pending: [], revision: null };
  if (raw.length > MAX_BYTES) throw new Error("corrupt");
  const value = JSON.parse(raw) as CollectionEnvelope;
  if (value?.version !== 1 || !validateCollection(value.document) || !Array.isArray(value.pending) || value.pending.length > 2000
    || value.pending.some(op => !op || typeof op.id !== "string" || typeof op.key !== "string" || !["add", "remove", "patch", "replace", "day-add", "day-remove", "day-before"].includes(op.action))
    || !(value.revision === null || Number.isSafeInteger(value.revision) && value.revision >= 0)) throw new Error("corrupt");
  return value;
}
export function writeCollection(owner: string, kind: CollectionKind, value: CollectionEnvelope, fromSync = false) {
  if (!validateCollection(value.document) || value.pending.length > 2000) throw new Error("full");
  const raw = JSON.stringify(value);
  if (raw.length > MAX_BYTES) throw new Error("full");
  window.localStorage.setItem(collectionKey(owner, kind), raw);
  window.dispatchEvent(new CustomEvent(COLLECTION_CHANGE, { detail: { ownerId: owner, kind, fromSync } }));
  window.dispatchEvent(new Event("l2t:storage-change"));
}
export function applyCollectionOperations(document: CollectionDocument, operations: CollectionOperation[]): CollectionDocument {
  const next: CollectionDocument = { items: { ...document.items }, dayIds: [...document.dayIds] };
  for (const op of operations) {
    if (["__proto__", "constructor", "prototype"].includes(op.key) || !op.key || op.key.length > 180) throw new Error("invalid");
    const exists = Object.hasOwn(next.items, op.key);
    const current = next.items[op.key];
    if (op.action === "add" && !exists) next.items[op.key] = op.value;
    else if (op.action === "remove") { delete next.items[op.key]; next.dayIds = next.dayIds.filter(id => id !== op.key); }
    else if (op.action === "replace" && exists) next.items[op.key] = op.value;
    else if (op.action === "patch" && exists && record(current) && record(op.value)) next.items[op.key] = { ...current, ...op.value };
    else if (op.action === "day-add" && exists && !next.dayIds.includes(op.key)) next.dayIds.push(op.key);
    else if (op.action === "day-remove") next.dayIds = next.dayIds.filter(id => id !== op.key);
    else if (op.action === "day-before" && exists && next.dayIds.includes(op.key)) {
      next.dayIds = next.dayIds.filter(id => id !== op.key);
      const before = typeof op.value === "string" ? next.dayIds.indexOf(op.value) : -1;
      next.dayIds.splice(before < 0 ? next.dayIds.length : before, 0, op.key);
    }
  }
  if (!validateCollection(next)) throw new Error("full");
  return next;
}
export function queueCollectionChange(owner: string, kind: CollectionKind, edits: Array<Omit<CollectionOperation, "id">>) {
  const current = readCollection(owner, kind);
  const pending = edits.map(edit => ({ ...edit, id: createId() }));
  const next = { ...current, document: applyCollectionOperations(current.document, pending), pending: [...current.pending, ...pending] };
  // One write commits both the visible copy and retry queue. A failed write
  // must not announce success or drop an earlier pending operation.
  writeCollection(owner, kind, next);
  return next;
}
export function resetCollectionCache(owner: string, kind: CollectionKind) {
  window.localStorage.removeItem(collectionKey(owner, kind));
  window.dispatchEvent(new CustomEvent(COLLECTION_CHANGE, { detail: { ownerId: owner, kind, fromSync: false } }));
}
