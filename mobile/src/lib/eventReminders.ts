import { addPluginListener, isNativePlatform, plugin } from "./capacitor";
import { hasEventTime } from "../../../lib/event-time";
import type { TravelEvent } from "../types";

type LocalNotificationsSurface = {
  checkPermissions?: () => Promise<{ display?: string }>;
  requestPermissions?: () => Promise<{ display?: string }>;
  schedule?: (options: { notifications: Array<Record<string, unknown>> }) => Promise<void>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
};
const REMINDER_STORE_KEY = "l2t.mobile.event-reminders.v1";
type StoredReminder = { id: number; eventId: string; startsAt: string; updatedAt: string; status: TravelEvent["status"]; ownerId?: string; pendingCancel?: boolean; timePrecision?: "exact" | "date" };
function readReminders(): StoredReminder[] {
  const value = JSON.parse(window.localStorage.getItem(REMINDER_STORE_KEY) || "[]");
  if (!Array.isArray(value)) throw new Error("Reminder registry cannot be read");
  return value;
}
function writeReminders(reminders: StoredReminder[]) { window.localStorage.setItem(REMINDER_STORE_KEY, JSON.stringify(reminders)); window.dispatchEvent(new CustomEvent("l2t:event-reminders-change")); }
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>) { const operation = queue.catch(() => undefined).then(run); queue = operation; return operation; }
function notificationId(value: string) {
  let hash = 17;
  for (const char of value) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return 520_000 + (hash % 1_500_000_000);
}
const sameOwner = (item: StoredReminder, owner: string) => (item.ownerId || "guest") === owner;
async function cancel(reminder: StoredReminder) {
  writeReminders(readReminders().map(item => item.id === reminder.id ? { ...item, pendingCancel: true } : item));
  const notifications = plugin("LocalNotifications") as LocalNotificationsSurface | undefined;
  if (!notifications?.cancel) return false;
  try { await notifications.cancel({ notifications: [{ id: reminder.id }] }); }
  catch { return false; }
  writeReminders(readReminders().filter(item => item.id !== reminder.id));
  return true;
}
export function scheduleEventReminder(event: TravelEvent, locale: "tr" | "en", ownerId?: string | null) {
  return serial(async () => {
    if (!hasEventTime(event)) return { ok: false, reason: "time" as const };
    if (event.status !== "scheduled") return { ok: false, reason: "status" as const };
    const now = Date.now(), start = Date.parse(event.startsAt);
    if (!Number.isFinite(start) || start <= now + 60_000) return { ok: false, reason: "past" as const };
    if (!isNativePlatform()) return { ok: false, reason: "native" as const };
    const notifications = plugin("LocalNotifications") as LocalNotificationsSurface | undefined;
    if (!notifications?.schedule || !notifications.cancel || !notifications.checkPermissions) return { ok: false, reason: "unavailable" as const };
    let permission = await notifications.checkPermissions();
    if (permission.display === "prompt" && notifications.requestPermissions) permission = await notifications.requestPermissions();
    if (permission.display !== "granted") return { ok: false, reason: "permission" as const };
    const owner = ownerId || "guest";
    const existing = readReminders().find(item => item.eventId === event.id && sameOwner(item, owner));
    if (existing && !await cancel(existing)) throw new Error("Previous reminder could not be cancelled");
    const lead = start - now > 26 * 3_600_000 ? 24 * 3_600_000 : 2 * 3_600_000;
    const at = new Date(Math.max(now + 60_000, start - lead));
    let id = notificationId(`${owner}:${event.id}`);
    const registered = readReminders();
    while (registered.some(item => item.id === id)) id = id === 2_000_000_000 ? 520_000 : id + 1;
    if (registered.length >= 60) throw new Error("Reminder capacity reached");
    const record: StoredReminder = { id, eventId: event.id, ownerId: owner, startsAt: event.startsAt, updatedAt: event.updatedAt, status: event.status, timePrecision: "exact", pendingCancel: true };
    // Durable before native scheduling. A crash or quota error cannot leave an
    // untracked notification, and failed schedule calls remain cancellable.
    writeReminders([...registered, record]);
    await notifications.schedule({ notifications: [{ id, title: locale === "tr" ? "Etkinliğin yaklaşıyor 🎟️" : "Your event is coming up 🎟️", body: `${event.title} · ${event.city}`, schedule: { at }, extra: { screen: "events", eventId: event.id, ownerId: owner } }] });
    writeReminders(readReminders().map(item => item.id === id ? { ...item, pendingCancel: false } : item));
    return { ok: true as const, at };
  });
}
export function cancelEventReminder(eventId: string, ownerId?: string | null) {
  return serial(async () => {
    const reminder = readReminders().find(item => item.eventId === eventId && sameOwner(item, ownerId || "guest"));
    return reminder ? cancel(reminder) : true;
  });
}
export async function reconcileEventReminders(events: TravelEvent[], locale: "tr" | "en", ownerId?: string | null) {
  const registered = readReminders().filter(item => sameOwner(item, ownerId || "guest"));
  let changes = 0;
  for (const reminder of registered) {
    const event = events.find(item => item.id === reminder.eventId);
    if (!event) continue;
    const changed = reminder.pendingCancel || !hasEventTime(event) || reminder.startsAt !== event.startsAt || reminder.updatedAt !== event.updatedAt || reminder.status !== event.status;
    if (!changed) continue;
    if (!await cancelEventReminder(event.id, ownerId)) continue;
    changes++;
    if (!reminder.pendingCancel && hasEventTime(event) && event.status === "scheduled" && Date.parse(event.startsAt) > Date.now()) await scheduleEventReminder(event, locale, ownerId);
  }
  return changes;
}
export function startEventReminderMaintenance(ownerId?: string | null) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const owner = ownerId || "guest";
  const run = async () => {
    if (stopped || running || !isNativePlatform()) return;
    running = true; clearTimeout(timer);
    let pending = false;
    try {
      await serial(async () => {
        if (stopped) return;
        for (const item of readReminders()) {
          if (stopped) return;
          // Legacy reminders may have used an invented noon or a different account.
          if (item.pendingCancel || !sameOwner(item, owner) || item.timePrecision !== "exact") {
            if (!await cancel(item)) pending = true;
          }
        }
      });
    } catch { pending = true; }
    finally { running = false; if (!stopped && pending) timer = setTimeout(() => void run(), 30_000); }
  };
  const foreground = () => { if (document.visibilityState === "visible") void run(); };
  const changed = () => { if (!stopped && !running) { clearTimeout(timer); timer = setTimeout(() => void run(), 30_000); } };
  window.addEventListener("l2t:event-reminders-change", changed);
  void run(); window.addEventListener("online", foreground); document.addEventListener("visibilitychange", foreground);
  return () => { stopped = true; clearTimeout(timer); window.removeEventListener("l2t:event-reminders-change", changed); window.removeEventListener("online", foreground); document.removeEventListener("visibilitychange", foreground); };
}
export function initEventReminderTapListener(onOpen: (eventId: string, ownerId: string) => void) {
  let active = true;
  let handle: { remove: () => Promise<void> } | null = null;
  if (isNativePlatform()) {
    void addPluginListener("LocalNotifications", "localNotificationActionPerformed", (payload) => {
      const extra = (payload.notification as { extra?: { screen?: string; eventId?: string; ownerId?: string } } | undefined)?.extra;
      if (active && extra?.screen === "events" && typeof extra.eventId === "string") onOpen(extra.eventId, extra.ownerId || "guest");
    }).then(next => { if (!active) void next?.remove(); else handle = next; });
  }
  return () => { active = false; void handle?.remove().catch(() => undefined); };
}
