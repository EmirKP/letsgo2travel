import { addPluginListener, isNativePlatform, plugin } from "./capacitor";
import type { TravelEvent } from "../types";

type LocalNotificationsSurface = {
  checkPermissions?: () => Promise<{ display?: string }>;
  requestPermissions?: () => Promise<{ display?: string }>;
  schedule?: (options: { notifications: Array<Record<string, unknown>> }) => Promise<void>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
};

const REMINDER_STORE_KEY = "l2t.mobile.event-reminders.v1";
type StoredReminder = { id: number; eventId: string; startsAt: string; updatedAt: string; status: TravelEvent["status"] };

function readReminders(): StoredReminder[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(REMINDER_STORE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is StoredReminder => Boolean(item && typeof item === "object" && typeof (item as StoredReminder).eventId === "string")) : [];
  } catch {
    return [];
  }
}

function writeReminders(reminders: StoredReminder[]) {
  try { window.localStorage.setItem(REMINDER_STORE_KEY, JSON.stringify(reminders.slice(0, 80))); } catch { /* Hatırlatıcı native tarafta yine çalışır. */ }
}

function notificationId(value: string) {
  let hash = 17;
  for (const char of value) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  // LocalNotifications kimliği signed 32-bit aralıkta kalır. Geniş alan,
  // çok etkinlik kaydeden cihazlarda hash çakışmasıyla yanlış alarmın
  // iptal edilme ihtimalini pratikte ortadan kaldırır.
  return 520_000 + (hash % 1_500_000_000);
}

export async function scheduleEventReminder(event: TravelEvent, locale: "tr" | "en") {
  if (!isNativePlatform()) return { ok: false, reason: "native" as const };
  const notifications = plugin("LocalNotifications") as LocalNotificationsSurface | undefined;
  if (!notifications?.schedule || !notifications.checkPermissions) return { ok: false, reason: "unavailable" as const };
  let permission = await notifications.checkPermissions();
  if (permission.display === "prompt" && notifications.requestPermissions) permission = await notifications.requestPermissions();
  if (permission.display !== "granted") return { ok: false, reason: "permission" as const };
  if (event.status === "cancelled" || event.status === "completed") return { ok: false, reason: "status" as const };
  const start = Date.parse(event.startsAt);
  if (!Number.isFinite(start) || start <= Date.now()) return { ok: false, reason: "past" as const };
  const lead = start - Date.now() > 26 * 60 * 60 * 1000 ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  const at = new Date(Math.max(Date.now() + 60_000, start - lead));
  const id = notificationId(event.id);
  await notifications.cancel?.({ notifications: [{ id }] });
  await notifications.schedule({ notifications: [{
    id,
    title: locale === "tr" ? "Etkinliğin yaklaşıyor 🎟️" : "Your event is coming up 🎟️",
    body: `${event.title} · ${event.city}`,
    schedule: { at },
    extra: { screen: "events", eventId: event.id },
  }] });
  writeReminders([{ id, eventId: event.id, startsAt: event.startsAt, updatedAt: event.updatedAt, status: event.status }, ...readReminders().filter((item) => item.eventId !== event.id)]);
  return { ok: true as const, at };
}

export async function cancelEventReminder(eventId: string) {
  const reminders = readReminders();
  const reminder = reminders.find((item) => item.eventId === eventId);
  if (!reminder) return false;
  try {
    const notifications = plugin("LocalNotifications") as LocalNotificationsSurface | undefined;
    await notifications?.cancel?.({ notifications: [{ id: reminder.id }] });
  } catch {
    // Registry is still removed so stale data does not keep retrying.
  }
  writeReminders(reminders.filter((item) => item.eventId !== eventId));
  return true;
}

/** Reconciles reminders whenever fresh provider/editorial event facts arrive. */
export async function reconcileEventReminders(events: TravelEvent[], locale: "tr" | "en") {
  const registered = readReminders();
  if (!registered.length) return 0;
  const byId = new Map(events.map((event) => [event.id, event]));
  let changes = 0;
  for (const reminder of registered) {
    const event = byId.get(reminder.eventId);
    if (!event) continue;
    const changed = reminder.startsAt !== event.startsAt || reminder.updatedAt !== event.updatedAt || reminder.status !== event.status;
    if (!changed) continue;
    changes += 1;
    await cancelEventReminder(event.id);
    if (event.status !== "cancelled" && event.status !== "completed" && Date.parse(event.startsAt) > Date.now()) {
      await scheduleEventReminder(event, locale).catch(() => undefined);
    }
  }
  return changes;
}

export function initEventReminderTapListener(onOpen: () => void) {
  let active = true;
  let handle: { remove: () => Promise<void> } | null = null;
  if (isNativePlatform()) {
    void addPluginListener("LocalNotifications", "localNotificationActionPerformed", (payload) => {
      const extra = (payload.notification as { extra?: { screen?: string } } | undefined)?.extra;
      if (extra?.screen === "events") onOpen();
    }).then((next) => {
      if (!active) void next?.remove();
      else handle = next;
    });
  }
  return () => {
    active = false;
    void handle?.remove().catch(() => undefined);
  };
}
