import { addPluginListener, isIOSNative, isNativePlatform, plugin } from "./capacitor";

// Yaklaşan Kokpit uçuşları için Live Activity + yerel bildirim katmanı.
// - Live Activity (Dynamic Island / kilit ekranı) YALNIZ native
//   FlightLiveActivity eklentisi uygulamaya eklendiğinde çalışır
//   (LIVE-ACTIVITY-KURULUM.md'deki Xcode adımları). Eklenti yoksa veya
//   cihaz desteklemiyorsa NORMAL yerel bildirime düşülür — akış kırılmaz.
// - Veri yalnız kullanıcının kaydettiği uçuş bilgisidir; boarding/gate/
//   gecikme gibi canlı durumlar UYDURULMAZ (doğrulanmış sağlayıcı yok).
// - Yerel bildirim izni ASLA burada istenmez: izin verilmemişse sessizce
//   atlanır (izin akışı kullanıcının bildirim tercihinden yönetilir).

export type FlightReminderTrip = {
  id: string;
  title: string;
  departureAt: string | null;
  status: string;
  originIata?: string | null;
  destinationIata?: string | null;
};

/** Kokpit kaydına giden derin bağlantı (bildirim + Live Activity aynı adresi kullanır). */
export function cockpitDeepLink(tripId: string) {
  return `letsgo2travel://cockpit?tripId=${encodeURIComponent(tripId)}`;
}

export type ActivityPhase = "before" | "active" | "ended";

const ACTIVITY_LEAD_MS = 3 * 60 * 60 * 1000; // kalkışa 3 saat kala başlat
const ACTIVITY_TAIL_MS = 60 * 60 * 1000; // kalkıştan 1 saat sonra bitir
const REMINDER_ID_BASE = 411_000; // yerel bildirim kimlik alanımız

/**
 * Swift DepartureCountdown ile AYNI karar (ayna): kalkış gelecekteyse
 * geri sayım gösterilir; geçtiyse TERS zaman aralığı OLUŞTURULMAZ,
 * güvenli "kalkış gerçekleşti" görünümüne düşülür. Widget kalkıştan
 * sonra +1 saat açık kaldığı için bu dal gerçek hayatta HER uçuşta çalışır.
 */
export function countdownMode(departureAtIso: string | null, now: Date = new Date()): "countdown" | "departed" {
  if (!departureAtIso) return "departed";
  const departure = Date.parse(departureAtIso);
  if (!Number.isFinite(departure)) return "departed";
  return departure > now.getTime() ? "countdown" : "departed";
}

/** Uçuş için Live Activity/hatırlatma evresi (saf; birim testli). */
export function activityPhase(departureAtIso: string | null, now: Date = new Date()): ActivityPhase {
  if (!departureAtIso) return "ended";
  const departure = Date.parse(departureAtIso);
  if (!Number.isFinite(departure)) return "ended";
  if (now.getTime() < departure - ACTIVITY_LEAD_MS) return "before";
  if (now.getTime() > departure + ACTIVITY_TAIL_MS) return "ended";
  return "active";
}

/** Hatırlatma planlanacak uçuşlar: yaklaşan + gelecekte kalkışı olanlar. */
export function plannedReminders(trips: FlightReminderTrip[], now: Date = new Date()) {
  return trips
    .filter((trip) => trip.status === "upcoming" || trip.status === "active")
    .filter((trip) => trip.departureAt && Number.isFinite(Date.parse(trip.departureAt)))
    .filter((trip) => Date.parse(trip.departureAt!) - ACTIVITY_LEAD_MS > now.getTime())
    .slice(0, 8)
    .map((trip, index) => ({
      id: REMINDER_ID_BASE + index,
      tripId: trip.id,
      title: "Uçuşun yaklaşıyor ✈️",
      body: `${trip.title} uçuşuna 3 saat kaldı. Kokpitte hazırlık listen seni bekliyor.`,
      at: new Date(Date.parse(trip.departureAt!) - ACTIVITY_LEAD_MS),
    }));
}

type LocalNotificationsSurface = {
  checkPermissions?: () => Promise<{ display?: string }>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
  schedule?: (options: { notifications: Array<Record<string, unknown>> }) => Promise<void>;
};

type LiveActivitySurface = {
  isAvailable?: () => Promise<{ available?: boolean }>;
  startFlightActivity?: (options: Record<string, unknown>) => Promise<void>;
  endFlightActivity?: (options: { tripId: string }) => Promise<void>;
};

function localNotifications(): LocalNotificationsSurface | undefined {
  return plugin("LocalNotifications") as LocalNotificationsSurface | undefined;
}

function liveActivityPlugin(): LiveActivitySurface | undefined {
  return plugin("FlightLiveActivity") as LiveActivitySurface | undefined;
}

/**
 * Kokpit uçuşları için hatırlatmaları eşitler. İzin İSTEMEZ; yalnız
 * hâlihazırda verilmiş izinle çalışır. Kendi kimlik alanımızdaki eski
 * bildirimleri iptal edip günceller (silinen/geçmiş uçuş bildirimi kalmaz).
 */
export async function syncFlightReminders(trips: FlightReminderTrip[], now: Date = new Date()): Promise<void> {
  if (!isNativePlatform()) return;

  // 1) Live Activity: eklenti uygulamaya eklendiyse aktif pencerede başlat.
  //    (Desteklenmeyen cihaz/eksik eklenti → sessizce yerel bildirime düş.)
  const live = liveActivityPlugin();
  if (isIOSNative() && live?.startFlightActivity) {
    try {
      const availability = await live.isAvailable?.();
      if (availability?.available) {
        for (const trip of trips) {
          const phase = activityPhase(trip.departureAt, now);
          if (phase === "active") {
            await live.startFlightActivity({
              tripId: trip.id,
              title: trip.title,
              departureAt: trip.departureAt,
              originIata: trip.originIata || "",
              destinationIata: trip.destinationIata || "",
              deepLink: cockpitDeepLink(trip.id),
            });
          } else if (phase === "ended") {
            await live.endFlightActivity?.({ tripId: trip.id });
          }
        }
      }
    } catch {
      // Live Activity hatası akışı bozmaz; yerel bildirim planı devam eder.
    }
  }

  // 2) Yerel bildirim fallback'i.
  const notifications = localNotifications();
  if (!notifications?.schedule || !notifications.checkPermissions) return;
  try {
    const permission = await notifications.checkPermissions();
    if (permission.display !== "granted") return; // izin istenmez, sessiz geç

    const plans = plannedReminders(trips, now);
    await notifications.cancel?.({
      notifications: Array.from({ length: 8 }, (_, index) => ({ id: REMINDER_ID_BASE + index })),
    });
    if (!plans.length) return;
    await notifications.schedule({
      notifications: plans.map((planItem) => ({
        id: planItem.id,
        title: planItem.title,
        body: planItem.body,
        schedule: { at: planItem.at },
        extra: { screen: "cockpit", tripId: planItem.tripId },
      })),
    });
  } catch {
    // Bildirim planlanamazsa sessiz geçilir; Kokpit akışı etkilenmez.
  }
}

/**
 * ÇIKIŞTA cihazda çalışan TÜM uçuş aktivitelerini sonlandırır (eski
 * hesabın uçuşu yeni kullanıcının Ada'sında kalmasın). Eklenti yoksa
 * sessiz no-op.
 */
export async function endAllFlightActivities(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await liveActivityPlugin()?.endFlightActivity?.({ tripId: "" });
  } catch {
    // Sonlandırma hatası çıkışı engellemez.
  }
}

/** Bildirime dokununca ilgili Kokpit kaydına gider (tripId ile). */
export function initFlightReminderTapListener(onOpenCockpit: (tripId: string | null) => void): () => void {
  let active = true;
  let handle: { remove: () => Promise<void> } | null = null;
  if (isNativePlatform()) {
    void addPluginListener("LocalNotifications", "localNotificationActionPerformed", (payload) => {
      const extra = (payload.notification as { extra?: { screen?: string; tripId?: string } } | undefined)?.extra;
      if (!extra || extra.screen === "cockpit") onOpenCockpit(typeof extra?.tripId === "string" && extra.tripId ? extra.tripId : null);
    }).then((listener) => {
      if (!active) { void listener?.remove().catch(() => undefined); return; }
      handle = listener;
    });
  }
  return () => {
    active = false;
    void handle?.remove().catch(() => undefined);
  };
}
