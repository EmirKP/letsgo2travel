import { formatAppDate } from "../lib/localeFormatting";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getVisaAppointmentNotifications, listAlerts, markVisaAppointmentNotificationRead } from "../lib/api";
import {
  getReadNotificationIds,
  getSavedRoutePlans,
  hasSeenRelease,
  markNotificationsRead,
} from "../lib/storage";
import type { AppNotification, FlightAlert, ViewId, VisaAppointmentNotification } from "../types";
import { config, releaseId } from "../lib/config";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { useI18n } from "../lib/i18n";
import { socialRead, socialWrite } from "../lib/social";
type SocialNotification = { id: string; kind: 'comment'|'reply'|'follow'; author: {username:string;key:string}; postId: string|null; commentId: string|null; createdAt:string; readAt:string|null };

function checkedSocialNotifications(value: unknown): SocialNotification[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) {
    throw new Error("Invalid notifications response");
  }
  const items = (value as { items: unknown[] }).items;
  if (!items.every(item => {
    if (!item || typeof item !== "object") return false;
    const row = item as SocialNotification;
    return typeof row.id === "string" && ["comment", "reply", "follow"].includes(row.kind)
      && row.author && typeof row.author.username === "string" && typeof row.author.key === "string"
      && typeof row.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt))
      && (row.readAt === null || typeof row.readAt === "string")
      && (row.postId === null || typeof row.postId === "string")
      && (row.commentId === null || typeof row.commentId === "string");
  })) throw new Error("Invalid notifications response");
  return items as SocialNotification[];
}

function formatDate(value: string, locale = "tr-TR") {
  try {
    return formatAppDate(new Date(value), locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

type NotificationCenterProps = {
  open: boolean;
  ownerId?: string | null;
  accessToken: string;
  online: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onOpenRelease: () => void;
  onUnreadChange: (count: number) => void;
  onOpenSocial?: (intent:{postId?:string;profileKey?:string})=>void;
};

export function NotificationCenter(props: NotificationCenterProps) {
  return <NotificationCenterSession key={JSON.stringify([props.ownerId || "", props.accessToken])} {...props} />;
}

function NotificationCenterSession({ open, ownerId, accessToken, online, onClose, onNavigate, onOpenRelease, onUnreadChange, onOpenSocial }: NotificationCenterProps) {
  const { copy, dateLocale } = useI18n();
  const [visaNotifications, setVisaNotifications] = useState<VisaAppointmentNotification[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<FlightAlert[]>([]);
  const [socialNotifications,setSocialNotifications] = useState<SocialNotification[]>([]);
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
    if (!open || !accessToken || !online) {
      setLoading(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setServerWarning("");
    void Promise.allSettled([
      getVisaAppointmentNotifications(accessToken),
      listAlerts(accessToken),
      socialRead<unknown>({section:'notifications'},accessToken,controller.signal).then(checkedSocialNotifications),
    ])
      .then(([visaResult, alertResult, socialResult]) => {
        if (!active) return;
        if (visaResult.status === "fulfilled") setVisaNotifications(visaResult.value.slice(0, 10));
        if (alertResult.status === "fulfilled") setTriggeredAlerts(alertResult.value.filter((item) => item.status === "triggered" || item.last_notified_at).slice(0, 6));
        if (socialResult.status === 'fulfilled') setSocialNotifications(socialResult.value);
        if (visaResult.status === "rejected" || alertResult.status === "rejected" || socialResult.status === 'rejected') {
          setServerWarning(copy("Bazı bildirimler yenilenemedi. Varsa son alınan bilgiler gösteriliyor.", "Some notifications could not refresh. Last loaded items are shown when available.", "Disa njoftime nuk u rifreskuan. Shfaqen të dhënat e fundit kur janë të disponueshme."));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [accessToken, copy, online, open, ownerId]);

  const notifications = useMemo<AppNotification[]>(() => {
    const items: AppNotification[] = [{
      id: `release-${releaseId}`,
      title: copy(`Mobil deneyim · Build ${config.buildNumber}`, `Mobile experience · Build ${config.buildNumber}`, `Përvoja në celular · Versioni ${config.buildNumber}`),
      message: copy("Etkinlik Radarını, anlık seyahat yardımını ve yenilenen araçları keşfet.", "Explore Events Radar, in-the-moment travel help and redesigned tools."),
      createdAt: "2026-09-03T16:00:00.000Z",
      kind: "release",
      view: "home",
    }];

    const latestRoute = getSavedRoutePlans(ownerId)[0];
    if (latestRoute) items.push({
      id: `route-${latestRoute.id}`,
      title: copy("Rotan seni bekliyor", "Your route is waiting"),
      message: copy(`${latestRoute.plan.routes.map((route) => route.name).join(" · ")} planına kaldığın yerden devam et.`, `Continue your ${latestRoute.plan.routes.map((route) => route.name).join(" · ")} plan.`, `Vazhdo planin tënd ${latestRoute.plan.routes.map((route) => route.name).join(" · ")}.`),
      createdAt: latestRoute.createdAt,
      kind: "route",
      view: "trips",
    });

    for (const alert of triggeredAlerts) items.push({
      id: `price-${alert.id}-${alert.last_notified_at || alert.last_checked_price || "triggered"}`,
      title: copy(`${alert.origin_code} → ${alert.destination_code} fiyat alarmı`, `${alert.origin_code} → ${alert.destination_code} price alert`, `Njoftim çmimi ${alert.origin_code} → ${alert.destination_code}`),
      message: alert.last_checked_price
        ? copy(`${alert.departure_date} gidişi için son kontrol fiyatı ${new Intl.NumberFormat("tr-TR").format(alert.last_checked_price)} TL.`, `Last checked price for ${alert.departure_date}: TRY ${new Intl.NumberFormat("en-GB").format(alert.last_checked_price)}.`, `Çmimi i fundit i kontrolluar për ${alert.departure_date}: ${new Intl.NumberFormat("sq-AL").format(alert.last_checked_price)} TRY.`)
        : copy("Alarmın tetiklendi. Ayrıntılar için fiyat alarmlarını aç.", "Your alert was triggered. Open Price Alerts for details."),
      createdAt: alert.last_notified_at || alert.last_checked_at || alert.created_at,
      kind: "price",
      view: "alerts",
    });

    for (const notification of visaNotifications) items.push({
      id: `visa-${notification.id}`,
      title: notification.title || copy("Vize takibinde güncelleme", "Visa tracking update"),
      message: notification.message || copy("Takip ayrıntılarını kontrol et.", "Check tracking details."),
      createdAt: notification.created_at,
      kind: "visa",
      view: "passport",
    });
    for(const item of socialNotifications) items.push({id:`social-${item.id}`,title:`@${item.author.username}`,message:item.kind==='follow'?copy('Seni takip etmeye başladı.','Started following you.','Filloi të të ndjekë.'):item.kind==='reply'?copy('Yorumuna yanıt yazdı.','Replied to your comment.','Iu përgjigj komentit tënd.'):copy('Gönderine yorum yazdı.','Commented on your post.','Komentoi në postimin tënd.'),createdAt:item.createdAt,kind:'social',view:'community'});
    return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [copy, ownerId, storageTick, triggeredAlerts, visaNotifications,socialNotifications]);

  const isRead = useCallback((item: AppNotification) => {
    if (readIds.includes(item.id)) return true;
    if(item.kind==='social')return Boolean(socialNotifications.find(n=>`social-${n.id}`===item.id)?.readAt);
    if (item.kind === "release" && hasSeenRelease(releaseId)) return true;
    if (!item.id.startsWith("visa-")) return false;
    return Boolean(visaNotifications.find((notification) => `visa-${notification.id}` === item.id)?.read_at);
  }, [readIds, visaNotifications,socialNotifications]);
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
    if(item.kind==='social'&&accessToken)void socialWrite('notifications-read',{id:item.id.slice(7)},accessToken).catch(()=>undefined);
    onClose();
    if(item.kind==='social'&&onOpenSocial){const social=socialNotifications.find(n=>`social-${n.id}`===item.id);if(social){onOpenSocial(social.kind==='follow'?{profileKey:social.author.key}:{postId:social.postId||undefined});return;}}
    if (item.kind === "release") onOpenRelease();
    else if (item.view) onNavigate(item.view);
  };

  const markAllRead = () => {
    markRead(notifications.map((item) => item.id));
    if (!accessToken) return;
    void socialWrite('notifications-read',{},accessToken).catch(()=>undefined);
    void Promise.allSettled(visaNotifications.filter((item) => !item.read_at).map((item) => markVisaAppointmentNotificationRead(item.id, accessToken)));
  };

  return <Sheet open={open} title={copy("Bildirimler", "Notifications")} onClose={onClose} size="large">
    <div className="notification-toolbar">
      <span>{unread ? copy(`${unread} okunmamış bildirim`, `${unread} unread notifications`, `${unread} njoftime të palexuara`) : copy("Tüm bildirimleri gördün", "You're all caught up")}</span>
      {unread > 0 && <button onClick={markAllRead}>{copy("Tümünü okundu yap", "Mark all as read")}</button>}
    </div>

    {loading && <div className="skeleton-list"><div /><div /></div>}
    <div className="notification-list">
      {notifications.map((item) => {
        const unreadItem = !isRead(item);
        return <button className={unreadItem ? "notification-item unread" : "notification-item"} key={item.id} onClick={() => openNotification(item)}>
          <span className={`notification-icon kind-${item.kind}`}><Icon name={item.kind === "social" ? "users" : item.kind === "price" ? "bell" : item.kind === "route" ? "route" : item.kind === "release" ? "sparkles" : "passport"} size={20} /></span>
          <span><strong>{item.title}</strong><small>{item.message}</small><em>{formatDate(item.createdAt, dateLocale)}</em></span>
          {unreadItem ? <i /> : <Icon name="chevron" size={16} />}
        </button>;
      })}
    </div>
    {serverWarning && <div className="info-box"><Icon name="info" size={19} /><p>{serverWarning}</p></div>}
    {!online && <div className="info-box"><Icon name="offline" size={19} /><p>{copy("Çevrimdışısın. Kayıtlı bildirimler gösteriliyor; canlı bildirimler bağlantı geldiğinde yenilenir.", "You're offline. Saved notifications are shown; live notifications will refresh when you're connected.")}</p></div>}
  </Sheet>;
}
