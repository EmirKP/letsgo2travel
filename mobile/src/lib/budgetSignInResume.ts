import { validateBudgetCockpitIntent, type BudgetCockpitIntent } from "./budgetCockpitIntent";

const key = "l2t.budget-sign-in.v1";
const lifetime = 30 * 60_000;
type PendingBudget = { version: 1; createdAt: number; claimedOwner: string | null; intent: BudgetCockpitIntent };
let memory: PendingBudget | null = null;
let persisted = false;
let cancelled = false;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const ownerValid = (owner: string) => owner.length > 0 && owner.length <= 80;
function valid(value: unknown, now: number): value is PendingBudget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as PendingBudget;
  return row.version === 1 && Number.isFinite(row.createdAt) && now >= row.createdAt && now - row.createdAt < lifetime
    && (row.claimedOwner === null || typeof row.claimedOwner === "string" && ownerValid(row.claimedOwner))
    && validateBudgetCockpitIntent(row.intent) && row.intent.ownerId === null;
}
function read(now: number): PendingBudget | null {
  if (cancelled) return null;
  let value: unknown = memory;
  try {
    const raw = window.localStorage.getItem(key);
    // A different window may already have consumed or cancelled this action.
    if (!raw && persisted) { memory = null; persisted = false; return null; }
    if (raw) { value = raw.length <= 60_000 ? JSON.parse(raw) : null; persisted = true; }
  } catch { if (persisted) return null; }
  if (!valid(value, now)) { clearBudgetSignInResume(); return null; }
  return clone(value);
}
function write(value: PendingBudget): boolean {
  memory = clone(value);
  const previouslyStored = persisted;
  try { window.localStorage.setItem(key, JSON.stringify(value)); persisted = true; return true; }
  catch {
    // An unpersisted handoff can still continue in the same running app.
    if (!previouslyStored) {
      try { if (window.localStorage.getItem(key) !== null) { clearBudgetSignInResume(); return false; } }
      catch { /* No readable stored entry; use the current memory action only. */ }
      persisted = false; return true;
    }
    clearBudgetSignInResume(); return false;
  }
}

export function clearBudgetSignInResume() {
  memory = null; persisted = false; cancelled = true;
  try { window.localStorage.removeItem(key); } catch { /* Also invalidate it in this process. */ }
}
export function prepareBudgetSignInResume(intent: BudgetCockpitIntent, now = Date.now()): boolean {
  clearBudgetSignInResume();
  if (!validateBudgetCockpitIntent(intent) || intent.ownerId !== null) return false;
  cancelled = false;
  return write({ version: 1, createdAt: now, claimedOwner: null, intent: clone(intent) });
}
export function hasBudgetSignInResume(now = Date.now()): boolean { return read(now) !== null; }

/** Claim on the first authenticated account, before waiting for its profile. */
export function claimBudgetSignInResume(ownerId: string, now = Date.now()): boolean {
  if (!ownerValid(ownerId)) return false;
  const pending = read(now);
  if (!pending) return false;
  if (pending.claimedOwner && pending.claimedOwner !== ownerId) { clearBudgetSignInResume(); return false; }
  return pending.claimedOwner === ownerId || write({ ...pending, claimedOwner: ownerId });
}
export function takeBudgetSignInResume(ownerId: string, now = Date.now()): BudgetCockpitIntent | null {
  if (!ownerValid(ownerId)) return null;
  const pending = read(now);
  if (!pending || pending.claimedOwner !== ownerId) return null;
  // Consume before showing the review. No trip is created or saved here.
  if (persisted) {
    try { window.localStorage.removeItem(key); if (window.localStorage.getItem(key) !== null) return null; }
    catch { return null; }
  }
  clearBudgetSignInResume();
  const intent = { ...pending.intent, ownerId };
  return validateBudgetCockpitIntent(intent) ? intent : null;
}
