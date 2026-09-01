import { useCallback, useEffect, useMemo, useState } from "react";
import { getVisaAppointmentNotifications, listAlerts, markVisaAppointmentNotificationRead } from "../lib/api";
import {
  getReadNotificationIds,
  getSavedRoutePlans,
  markNotificationsRead,
} from "../lib/storage";
import type { AppNotification, FlightAlert, ViewId, VisaAppointmentNotification } from "../types";
import { config, releaseId } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function NotificationCenter({ open, ownerId, accessToken, online, onClose, onNavigate, onUnreadChange }: {
  open: boolean;
  ownerId?: string | null;
  accessToken: string;
  online: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onUnreadChange: (count: number) => void;
}) {
  const [visaNotifications, setVisaNotifications] = useState<VisaAppointmentNotification[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverWarning, setServerWarning] = useState("");
  const [readIds, setReadIds] = useState<string[]>(() => getReadNotificationIds(ownerId));
  const [storageTick, setStorageTick] = useState(0);

  useEffect(() => {
    const update = () => setStorageTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  useEffect(() => setReadIds(getReadNotificationIds(ownerId)), [ownerId, storageTick]);

  useEffect(() => {
    setVisaNotifications([]);
    setTriggeredAlerts([]);
    setServerWarning("");
    setLoading(false);
  }, [accessToken, ownerId]);

  useEffect(() => {
    if (!open || !accessToken || !online) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setServerWarning("");
    void Promise.allSettled([getVisaAppointmentNotifications(accessToken), listAlerts(accessToken)])
      .then(([visaResult, alertResult]) => {
        if (!active) return;
        setVisaNotifications(visaResult.status === "fulfilled" ? visaResult.value.slice(0, 10) : []);
        setTriggeredAlerts(alertResult.status === "fulfilled"
          ? alertResult.value.filter((item) => item.status === "triggered" || item.last_notified_at).slice(0, 6)
          : []);
        if (visaResult.status === "rejected" || alertResult.status === "rejected") {
          setServerWarning("Bazı canlı bildirimler şu an alınamadı. Kayıtlı içerikler gösteriliyor.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, online, open]);

  const notifications = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [{
      id: `release-${releaseId}`,
      title: `Mobil deneyim · Build ${config.buildNumber}`,
      message: "Daha güvenli girişleri, yerel kısayolları ve yenilenen erişilebilir deneyimi incele.",
      createdAt: "2026-08-09T09:00:00.000Z",
      kind: "release",
      view: "home",
    }];

    const latestRoute = getSavedRoutePlans(ownerId)[0];
    if (latestRoute) items.push({
      id: `route-${latestRoute.id}`,
      title: "Rotan seni bekliyor",
      message: `${latestRoute.plan.routes.map((route) => route.name).join(" · ")} planına kaldığın yerden devam et.`,
      createdAt: latestRoute.createdAt,
      kind: "route",
      view: "trips",
    });

    for (const alert of triggeredAlerts) items.push({
      id: `price-${alert.id}-${alert.last_notified_at || alert.last_checked_price || "triggered"}`,
      title: `${alert.origin_code} → ${alert.destination_code} fiyat alarmı`,
      message: alert.last_checked_price
        ? `${alert.departure_date} gidişi için son kontrol fiyatı ${new Intl.NumberFormat("tr-TR").format(alert.last_checked_price)} TL.`
        : "Alarmın tetiklendi. Ayrıntılar için fiyat alarmlarını aç.",
      createdAt: alert.last_notified_at || alert.last_checked_at || alert.created_at,
      kind: "price",
      view: "alerts",
    });

    for (const notification of visaNotifications) items.push({
      id: `visa-${notification.id}`,
      title: notification.title || "Vize takibinde güncelleme",
      message: notification.message || "Takip ayrıntılarını kontrol et.",
      createdAt: notification.created_at,
      kind: "visa",
      view: "passport",
    });
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [ownerId, storageTick, triggeredAlerts, visaNotifications]);

  const isRead = useCallback((item: AppNotification) => {
    if (readIds.includes(item.id)) return true;
    if (!item.id.startsWith("visa-")) return false;
    return Boolean(visaNotifications.find((notification) => `visa-${notification.id}` === item.id)?.read_at);
  }, [readIds, visaNotifications]);
  const unread = useMemo(() => notifications.filter((item) => !isRead(item)).length, [isRead, notifications]);
  useEffect(() => onUnreadChange(unread), [onUnreadChange, unread]);

  const markRead = useCallback((ids: string[]) => {
    const next = markNotificationsRead(ids, ownerId);
    setReadIds(next);
  }, [ownerId]);

  const openNotification = (item: AppNotification) => {
    markRead([item.id]);
    const visaId = item.id.startsWith("visa-") ? item.id.slice(5) : "";
    if (visaId && accessToken) void markVisaAppointmentNotificationRead(visaId, accessToken).catch(() => undefined);
    if (item.view) onNavigate(item.view);
    onClose();
  };

  const markAllRead = () => {
    markRead(notifications.map((item) => item.id));
    if (!accessToken) return;
    void Promise.allSettled(visaNotifications.filter((item) => !item.read_at).map((item) => markVisaAppointmentNotificationRead(item.id, accessToken)));
  };

  return <Sheet open={open} title="Bildirimler" onClose={onClose} size="large">
    <div className="notification-toolbar">
      <span>{unread ? `${unread} okunmamış bildirim` : "Tüm bildirimleri gördün"}</span>
      {unread > 0 && <button onClick={markAllRead}>Tümünü okundu yap</button>}
    </div>

    {loading && <div className="skeleton-list"><div /><div /></div>}
    <div className="notification-list">
      {notifications.map((item) => {
        const unreadItem = !isRead(item);
        return <button className={unreadItem ? "notification-item unread" : "notification-item"} key={item.id} onClick={() => openNotification(item)}>
          <span className={`notification-icon kind-${item.kind}`}><Icon name={item.kind === "price" ? "bell" : item.kind === "route" ? "route" : item.kind === "release" ? "sparkles" : "passport"} size={20} /></span>
          <span><strong>{item.title}</strong><small>{item.message}</small><em>{formatDate(item.createdAt)}</em></span>
          {unreadItem ? <i /> : <Icon name="chevron" size={16} />}
        </button>;
      })}
    </div>
    {serverWarning && <div className="info-box"><Icon name="info" size={19} /><p>{serverWarning}</p></div>}
    {!online && <div className="info-box"><Icon name="offline" size={19} /><p>Çevrimdışısın. Kayıtlı bildirimler gösteriliyor; canlı bildirimler bağlantı geldiğinde yenilenir.</p></div>}
  </Sheet>;
}
