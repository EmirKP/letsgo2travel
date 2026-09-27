import { createId } from "./id";

export const PERSONAL_TRAVEL_CARDS_PREFIX = "l2t.mobile.personal-travel-cards.v1:";
export const PERSONAL_TRAVEL_CARDS_EVENT = "l2t:personal-travel-cards-change";
export const MAX_PERSONAL_CARDS = 20;
export type PersonalCardDraft = { title: string; hotelName: string; address: string; reservationNote: string; tripId?: string | null };
export type PersonalTravelCard = PersonalCardDraft & { id: string; createdAt: string; updatedAt: string };
type CardError = "unreadable" | "storage" | "invalid" | "limit";
export type PersonalCardResult = { items: PersonalTravelCard[]; error: CardError | null };

function key(ownerId?: string | null) {
  if (ownerId && !/^[a-zA-Z0-9_-]{1,80}$/.test(ownerId)) throw new Error("Invalid owner scope");
  return PERSONAL_TRAVEL_CARDS_PREFIX + (ownerId ? `user-${ownerId}` : "guest");
}

function draft(value: unknown): PersonalCardDraft | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const fields = { title: 80, hotelName: 120, address: 400, reservationNote: 1000 } as const;
  for (const [name, max] of Object.entries(fields)) if (typeof item[name] !== "string" || (item[name] as string).length > max) return null;
  if (!(item.title as string).trim() || ![item.hotelName, item.address, item.reservationNote].some(value => (value as string).trim())) return null;
  if (item.tripId != null && (typeof item.tripId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.tripId))) return null;
  // Explicit allowlist: no provider response, flight, PNR or trip-object spread.
  return { title: (item.title as string).trim(), hotelName: (item.hotelName as string).trim(), address: (item.address as string).trim(), reservationNote: (item.reservationNote as string).trim(), tripId: (item.tripId as string | null) || null };
}

function card(value: unknown): PersonalTravelCard | null {
  const input = draft(value);
  if (!input) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)
    || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
    || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) return null;
  return { ...input, id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt };
}

export function readPersonalTravelCards(ownerId?: string | null): PersonalCardResult {
  try {
    const raw = localStorage.getItem(key(ownerId));
    if (raw === null) return { items: [], error: null };
    if (raw.length > 131072) return { items: [], error: "unreadable" };
    const store = JSON.parse(raw);
    if (store?.version !== 1 || !Array.isArray(store.items) || store.items.length > MAX_PERSONAL_CARDS) return { items: [], error: "unreadable" };
    const items = store.items.map(card) as Array<PersonalTravelCard | null>;
    if (items.some(item => !item) || new Set(items.map(item => item?.id)).size !== items.length) return { items: [], error: "unreadable" };
    return { items: items as PersonalTravelCard[], error: null };
  } catch { return { items: [], error: "unreadable" }; }
}

function write(ownerId: string | null | undefined, items: PersonalTravelCard[]): PersonalCardResult {
  try { localStorage.setItem(key(ownerId), JSON.stringify({ version: 1, items })); }
  catch { return { items: readPersonalTravelCards(ownerId).items, error: "storage" }; }
  window.dispatchEvent(new Event(PERSONAL_TRAVEL_CARDS_EVENT));
  return { items, error: null };
}

export function savePersonalTravelCard(ownerId: string | null | undefined, value: PersonalCardDraft, id?: string): PersonalCardResult {
  const current = readPersonalTravelCards(ownerId);
  if (current.error) return current;
  const clean = draft(value);
  const existing = id ? current.items.find(item => item.id === id) : undefined;
  if (!clean || (id && !existing)) return { ...current, error: "invalid" };
  if (!existing && current.items.length >= MAX_PERSONAL_CARDS) return { ...current, error: "limit" };
  const now = new Date().toISOString();
  const next = { ...clean, id: existing?.id || createId(), createdAt: existing?.createdAt || now, updatedAt: now };
  return write(ownerId, [next, ...current.items.filter(item => item.id !== next.id)]);
}

export function removePersonalTravelCard(ownerId: string | null | undefined, id: string): PersonalCardResult {
  const current = readPersonalTravelCards(ownerId);
  return current.error ? current : write(ownerId, current.items.filter(item => item.id !== id));
}

export function restorePersonalTravelCard(ownerId: string | null | undefined, value: PersonalTravelCard): PersonalCardResult {
  const current = readPersonalTravelCards(ownerId);
  if (current.error) return current;
  const clean = card(value);
  if (!clean) return { ...current, error: "invalid" };
  if (current.items.some(item => item.id === clean.id)) return current;
  if (current.items.length >= MAX_PERSONAL_CARDS) return { ...current, error: "limit" };
  return write(ownerId, [clean, ...current.items]);
}

/** Account deletion removes only the explicitly confirmed account's device cards. */
export function clearPersonalTravelCards(ownerId: string): boolean {
  if (!ownerId) return false;
  try { localStorage.removeItem(key(ownerId)); }
  catch { return false; }
  window.dispatchEvent(new Event(PERSONAL_TRAVEL_CARDS_EVENT));
  return true;
}
