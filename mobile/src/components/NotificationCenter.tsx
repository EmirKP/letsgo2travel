import { useCallback, useEffect, useMemo, useState } from "react";
import { getFlightAlerts } from "../lib/api";
import {
  getReadNotificationIds,
  getSavedRoutePlans,
  markNotificationsRead,
} from "../lib/storage";
import type { AppNotification, FlightAlert, ViewId } from "../types";
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
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => getReadNotificationIds(ownerId));
  const [storageTick, setStorageTick] = useState(0);

  useEffect(() => {
    const update = () => setStorageTick((value) => value + 1);
    window.addEventListener("l2t:storage-change", update);
    return () => window.removeEventListener("l2t:storage-change", update);
  }, []);

  useEffect(() => setReadIds(getReadNotificationIds(ownerId)), [ownerId, storageTick]);

  useEffect(() => {
    if (!open || !accessToken || !online) return;
    let active = true;
    setLoading(true);
    void getFlightAlerts(accessToken)
      .then((items) => { if (active) setAlerts(items.filter((item) => item.is_active !== false).slice(0, 6)); })
      .catch(() => { if (active) setAlerts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, online, open]);

  const notifications = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [{
      id: "release-1.4.0",
      title: "Yeni mobil deneyim hazır",
      message: "5 sekmeli yeni menüyü, Keşfet ekranını ve yenilenen Seyahatlerim merkezini incele.",
      createdAt: "2026-08-07T06:00:00.000Z",
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

    for (const alert of alerts) items.push({
      id: `price-${alert.id}-${alert.last_checked_price || "pending"}`,
      title: `${alert.origin_code} → ${alert.destination_code} fiyat alarmı`,
      message: alert.last_checked_price
        ? `Son görülen fiyat ${new Intl.NumberFormat("tr-TR").format(alert.last_checked_price)} TL.`
        : "Alarmın aktif. Yeni fiyat bulunduğunda e-posta ile de haber verilir.",
      createdAt: alert.created_at,
      kind: "price",
      view: "trips",
    });

    items.push({
      id: "tip-travel-cockpit",
      title: "Seyahat Kokpiti'ni dene",
      message: "Yaklaşan seyahatin için hava, giriş koşulları, eSIM ve transfer önerilerini tek yerde gör.",
      createdAt: "2026-08-06T09:00:00.000Z",
      kind: "tip",
      view: "trips",
    });
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [alerts, ownerId, storageTick]);

  const unread = useMemo(() => notifications.filter((item) => !readIds.includes(item.id)).length, [notifications, readIds]);
  useEffect(() => onUnreadChange(unread), [onUnreadChange, unread]);

  const markRead = useCallback((ids: string[]) => {
    const next = markNotificationsRead(ids, ownerId);
    setReadIds(next);
  }, [ownerId]);

  const openNotification = (item: AppNotification) => {
    markRead([item.id]);
    if (item.view) onNavigate(item.view);
    onClose();
  };

  return <Sheet open={open} title="Bildirimler" onClose={onClose} size="large">
    <div className="notification-toolbar">
      <span>{unread ? `${unread} okunmamış bildirim` : "Tüm bildirimleri gördün"}</span>
      {unread > 0 && <button onClick={() => markRead(notifications.map((item) => item.id))}>Tümünü okundu yap</button>}
    </div>

    {loading && <div className="skeleton-list"><div /><div /></div>}
    <div className="notification-list">
      {notifications.map((item) => {
        const unreadItem = !readIds.includes(item.id);
        return <button className={unreadItem ? "notification-item unread" : "notification-item"} key={item.id} onClick={() => openNotification(item)}>
          <span className={`notification-icon kind-${item.kind}`}><Icon name={item.kind === "price" ? "bell" : item.kind === "route" ? "route" : item.kind === "release" ? "sparkles" : "info"} size={20} /></span>
          <span><strong>{item.title}</strong><small>{item.message}</small><em>{formatDate(item.createdAt)}</em></span>
          {unreadItem ? <i /> : <Icon name="chevron" size={16} />}
        </button>;
      })}
    </div>
    {!online && <div className="info-box"><Icon name="offline" size={19} /><p>Çevrimdışısın. Kayıtlı bildirimler gösteriliyor; fiyat alarmları bağlantı geldiğinde yenilenir.</p></div>}
  </Sheet>;
}
