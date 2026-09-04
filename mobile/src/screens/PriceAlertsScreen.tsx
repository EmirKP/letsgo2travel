import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { ApiError, createAlert, deleteAlert, listAlerts, updateAlert, type AlertMutationResponse } from "../lib/api";
import type { AirportOption } from "../lib/airports";
import { isPastLocalDate, localIsoDate } from "../lib/dates";
import { enablePushForUser, isPushAvailable } from "../lib/push";
import type { AuthUser, FlightAlert } from "../types";
import { useI18n } from "../lib/i18n";

type PriceAlertsScreenProps = {
  user: AuthUser | null;
  accessToken: string;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
};

type AlertForm = {
  origin: AirportOption | null;
  destination: AirportOption | null;
  departureDate: string;
  targetPrice: string;
  notifyEmail: boolean;
  notifyPush: boolean;
};

const EMPTY_FORM: AlertForm = {
  origin: null,
  destination: null,
  departureDate: "",
  targetPrice: "",
  notifyEmail: true,
  notifyPush: false,
};

function formatDate(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function formatDateTime(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      .format(new Date(value));
  } catch {
    return value;
  }
}

function formError(form: AlertForm, locale: "tr" | "en" = "tr") {
  const message = (tr: string, en: string) => locale === "en" ? en : tr;
  if (!form.origin) return message("Kalkış havalimanını listeden seç.", "Choose the departure airport from the list.");
  if (!form.destination) return message("Varış havalimanını listeden seç.", "Choose the arrival airport from the list.");
  if (form.origin.iata === form.destination.iata) return message("Kalkış ve varış aynı olamaz.", "Departure and arrival cannot be the same.");
  if (!form.departureDate) return message("Gidiş tarihini seç.", "Choose a departure date.");
  if (isPastLocalDate(form.departureDate)) return message("Gidiş tarihi geçmiş bir gün olamaz.", "The departure date cannot be in the past.");
  if (form.departureDate > localIsoDate(730)) return message("Gidiş tarihi bugünden itibaren iki yıl içinde olmalı.", "The departure date must be within two years from today.");
  if (form.targetPrice) {
    const price = Number(form.targetPrice);
    if (!Number.isFinite(price) || price <= 0) return message("Hedef fiyat pozitif bir sayı olmalı.", "Target price must be a positive number.");
  }
  if (!form.notifyEmail && !form.notifyPush) return message("En az bir bildirim kanalı seçmelisin.", "Choose at least one notification channel.");
  return "";
}

function errorText(error: unknown, fallback: string, locale: "tr" | "en") {
  if (locale === "tr" && error instanceof ApiError && error.message) return error.message;
  return fallback;
}

function responseNotice(result: AlertMutationResponse, fallback: string, locale: "tr" | "en", preferServerMessage = false) {
  if (locale === "en") {
    const hasWarning = Boolean(result.warning?.trim()) || Boolean(result.warnings?.some((item) => item?.trim()));
    return hasWarning ? `${fallback} One or more delivery channels may need attention.` : fallback;
  }
  const warnings = [result.warning, ...(Array.isArray(result.warnings) ? result.warnings : [])]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
  const headline = preferServerMessage && result.message?.trim() ? result.message.trim() : fallback;
  return [...new Set([headline, ...warnings])].join(" ");
}

function isActiveAlert(alert: FlightAlert) {
  return alert.is_active !== false;
}

function hasAlertChannel(alert: FlightAlert) {
  return alert.notify_email !== false || alert.notify_push === true;
}

export function PriceAlertsScreen({ user, accessToken, onOpenAccount, onNotice }: PriceAlertsScreenProps) {
  const { copy, dateLocale, locale } = useI18n();
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AlertForm>(EMPTY_FORM);
  const [pushBusy, setPushBusy] = useState(false);
  const loadGeneration = useRef(0);
  const priceFormat = useMemo(() => new Intl.NumberFormat(dateLocale), [dateLocale]);

  const getToken = useCallback(() => accessToken, [accessToken]);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!user || !accessToken) {
      setAlerts([]);
      setLoadError("");
      setActionError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const next = await listAlerts(accessToken);
      if (generation !== loadGeneration.current) return;
      setAlerts(next);
    } catch (requestError) {
      if (generation === loadGeneration.current) setLoadError(errorText(requestError, copy("Fiyat alarmların yüklenemedi.", "Your price alerts could not be loaded."), locale));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [accessToken, copy, locale, user]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const requestPushOptIn = useCallback(async () => {
    if (!isPushAvailable()) {
      onNotice(copy("Telefon bildirimleri yalnızca uygulamanın cihaz sürümünde açılabilir. E-posta ile devam edebilirsin.", "Phone notifications are available only in the installed app. You can continue with email."));
      return false;
    }
    setPushBusy(true);
    try {
      const result = await enablePushForUser(getToken);
      if (result.ok) return true;
      if (result.reason === "denied") {
        onNotice(copy("Bildirim izni verilmedi. E-posta bildirimleri çalışmaya devam eder; izni cihaz ayarlarından açabilirsin.", "Notification permission was denied. Email alerts will continue; enable permission in device settings."));
      } else {
        onNotice(copy("Telefon bildirimi şu an açılamadı. E-posta ile devam edebilirsin.", "Phone notifications could not be enabled. You can continue with email."));
      }
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [copy, getToken, onNotice]);

  const toggleFormPush = async (checked: boolean) => {
    if (!checked) {
      if (!form.notifyEmail) {
        setActionError(copy("En az bir bildirim kanalı açık kalmalı. Önce e-posta bildirimini aç.", "Keep at least one notification channel on. Enable email first."));
        return;
      }
      setActionError("");
      setForm((current) => ({ ...current, notifyPush: false }));
      return;
    }
    setActionError("");
    setForm((current) => ({ ...current, notifyPush: true }));
    const enabled = await requestPushOptIn();
    // İzin verilmezse kutu geri kapatılır; form e-posta ile gönderilebilir.
    if (!enabled) setForm((current) => ({ ...current, notifyPush: false }));
  };

  const toggleFormEmail = (checked: boolean) => {
    if (!checked && !form.notifyPush) {
      setActionError(copy("En az bir bildirim kanalı açık kalmalı. Telefon bildirimi istiyorsan önce onu aç.", "Keep at least one notification channel on. Enable phone notifications first if you want to turn off email."));
      return;
    }
    setActionError("");
    setForm((current) => ({ ...current, notifyEmail: checked }));
  };

  const submitAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !accessToken || busy || loading) return;
    const validation = formError(form, locale);
    if (validation) {
      setActionError(validation);
      return;
    }
    setBusy("create");
    setActionError("");
    try {
      const result = await createAlert({
        originCode: form.origin!.iata,
        originLabel: form.origin!.city || form.origin!.name,
        destinationCode: form.destination!.iata,
        destinationLabel: form.destination!.city || form.destination!.name,
        departureDate: form.departureDate,
        targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
        notifyEmail: form.notifyEmail,
        notifyPush: form.notifyPush,
      }, accessToken);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      onNotice(responseNotice(result, copy("Fiyat alarmın kuruldu.", "Your price alert is active."), locale, true));
      await load();
    } catch (requestError) {
      setActionError(errorText(requestError, copy("Alarm kaydedilemedi. Bilgileri kontrol edip tekrar dene.", "The alert could not be saved. Check the details and try again."), locale));
    } finally {
      setBusy("");
    }
  };

  const patchAlert = async (
    alert: FlightAlert,
    body: Partial<{ is_active: boolean; notify_email: boolean; notify_push: boolean }>,
    notice: string,
    failNotice: string,
  ) => {
    if (!accessToken || busy) return;
    setBusy(alert.id);
    setActionError("");
    try {
      const result = await updateAlert(alert.id, body, accessToken);
      setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, ...body } : item));
      onNotice(responseNotice(result, notice, locale));
    } catch (requestError) {
      // İstek başarısızsa ekrandaki doğrulanmış son listeyi koru. Kullanıcı
      // isterse üstteki Yenile düğmesiyle sunucudan yeniden eşitleyebilir.
      setActionError(errorText(requestError, failNotice, locale));
    } finally {
      setBusy("");
    }
  };

  const toggleActive = (alert: FlightAlert) => {
    const nextActive = alert.is_active === false;
    if (nextActive && !hasAlertChannel(alert)) {
      setActionError(copy("Bu alarmı başlatmadan önce e-posta veya telefon bildirimini aç.", "Enable email or phone notifications before restarting this alert."));
      return;
    }
    void patchAlert(
      alert,
      { is_active: nextActive },
      nextActive ? copy("Alarm yeniden başlatıldı.", "Alert restarted.") : copy("Alarm duraklatıldı.", "Alert paused."),
      copy("Alarm durumu güncellenemedi.", "Alert status could not be updated."),
    );
  };

  const toggleEmailChannel = (alert: FlightAlert, checked: boolean) => {
    if (!checked && isActiveAlert(alert) && alert.notify_push !== true) {
      setActionError(copy("Aktif alarmın son bildirim kanalını kapatamazsın. Önce telefon bildirimini aç veya alarmı durdur.", "You cannot turn off the last channel on an active alert. Enable phone notifications or pause the alert first."));
      return;
    }
    void patchAlert(
      alert,
      { notify_email: checked },
      checked ? copy("E-posta bildirimi açıldı.", "Email notifications enabled.") : copy("E-posta bildirimi kapatıldı.", "Email notifications disabled."),
      copy("Bildirim kanalı güncellenemedi.", "Notification channel could not be updated."),
    );
  };

  const togglePushChannel = async (alert: FlightAlert, checked: boolean) => {
    if (!checked) {
      if (isActiveAlert(alert) && alert.notify_email === false) {
        setActionError(copy("Aktif alarmın son bildirim kanalını kapatamazsın. Önce e-posta bildirimini aç veya alarmı durdur.", "You cannot turn off the last channel on an active alert. Enable email or pause the alert first."));
        return;
      }
      void patchAlert(alert, { notify_push: false }, copy("Bu alarm için telefon bildirimi kapatıldı.", "Phone notifications disabled for this alert."), copy("Bildirim kanalı güncellenemedi.", "Notification channel could not be updated."));
      return;
    }
    const enabled = await requestPushOptIn();
    if (!enabled) return;
    void patchAlert(alert, { notify_push: true }, copy("Bu alarm için telefon bildirimi açıldı.", "Phone notifications enabled for this alert."), copy("Bildirim kanalı güncellenemedi.", "Notification channel could not be updated."));
  };

  const removeAlert = async (alert: FlightAlert) => {
    if (!accessToken || busy) return;
    if (!window.confirm(copy(`${alert.origin_code} → ${alert.destination_code} alarmını silmek istiyor musun?`, `Delete the ${alert.origin_code} → ${alert.destination_code} alert?`))) return;
    setBusy(alert.id);
    setActionError("");
    try {
      await deleteAlert(alert.id, accessToken);
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      onNotice(copy("Fiyat alarmı silindi.", "Price alert deleted."));
    } catch (requestError) {
      setActionError(errorText(requestError, copy("Alarm silinemedi.", "The alert could not be deleted."), locale));
    } finally {
      setBusy("");
    }
  };

  if (!user || !accessToken) {
    return <div className="screen alerts-screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="bell" size={27} /></span>
        <div><small>{copy("FİYAT ALARMLARIM", "PRICE ALERTS")}</small><h1>{copy("Fiyat düşünce haber al", "Know when the price drops")}</h1><p>{copy("Takip ettiğin rota hedef fiyata inince e-posta veya telefon bildirimiyle haberdar olursun.", "Get an email or phone notification when a tracked route reaches your target.")}</p></div>
      </section>
      <div className="login-required">
        <span><Icon name="lock" size={28} /></span>
        <h2>{copy("Alarmların için giriş yap", "Sign in for price alerts")}</h2>
        <p>{copy("Fiyat alarmların hesabına bağlı saklanır ve web ile mobilde birlikte çalışır.", "Your alerts are linked to your account and stay in sync on web and mobile.")}</p>
        <button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> {copy("Giriş yap / hesap aç", "Sign in / create account")}</button>
      </div>
    </div>;
  }

  return <div className="screen alerts-screen">
    <section className="page-intro compact-intro">
      <span className="page-icon"><Icon name="bell" size={27} /></span>
      <div><small>{copy("FİYAT ALARMLARIM", "PRICE ALERTS")}</small><h1>{copy("Rotanı takibe al", "Track your route")}</h1><p>{copy("Hangi tarihte, hangi rotayı takip ettiğini burada yönet; fiyat hedefe inince haber verilir.", "Manage routes and dates here; we'll notify you when a fare reaches your target.")}</p></div>
    </section>

    <div className="alerts-toolbar">
      <button type="button" className="primary-button" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setActionError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? copy("Formu kapat", "Close form") : copy("Alarm kur", "Create alert")}
      </button>
      <button type="button" className="secondary-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} {copy("Yenile", "Refresh")}
      </button>
    </div>

    {formOpen && <form className="form-card alert-form" onSubmit={submitAlert}>
      <AirportField label={copy("Nereden", "From")} required value={form.origin} onChange={(origin) => setForm({ ...form, origin })} />
      <AirportField label={copy("Nereye", "To")} required value={form.destination} onChange={(destination) => setForm({ ...form, destination })} />
      <div className="form-grid two stack-narrow">
        <label><span>{copy("Gidiş tarihi", "Departure date")} <em className="required-mark">· {copy("zorunlu", "required")}</em></span><input type="date" required aria-required="true" min={localIsoDate(0)} max={localIsoDate(730)} value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate: event.target.value })} /></label>
        <label>{copy("Hedef fiyat (TL, isteğe bağlı)", "Target price (TRY, optional)")}<input type="number" min={1} step={1} inputMode="numeric" value={form.targetPrice} onChange={(event) => setForm({ ...form, targetPrice: event.target.value })} placeholder={copy("Boşsa %5 düşüşte haber verilir", "Leave empty for a 5% drop alert")} /></label>
      </div>
      <fieldset className="alert-channels" aria-describedby="alert-channel-help">
        <legend>{copy("Bildirim kanalları · en az biri zorunlu", "Notification channels · choose at least one")}</legend>
        <label><input type="checkbox" checked={form.notifyEmail} onChange={(event) => toggleFormEmail(event.target.checked)} /> {copy("E-posta", "Email")}</label>
        <label><input type="checkbox" checked={form.notifyPush} disabled={pushBusy} onChange={(event) => void toggleFormPush(event.target.checked)} /> {copy("Telefon bildirimi", "Phone notification")}</label>
        <p className="alert-push-note" id="alert-channel-help">{copy("En az bir kanal açık kalmalı.", "At least one channel must stay on.")}{form.notifyPush ? copy(" Fiyat hedefe inince telefonuna anlık bildirim gönderilir.", " You'll get an instant notification when the target is reached.") : copy(" Telefon bildirimi için cihaz izni gerekir.", " Device permission is required for phone notifications.")}</p>
      </fieldset>
      <button className="primary-wide" disabled={busy === "create" || loading || pushBusy} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="bell" size={18} />} {busy === "create" ? copy("Kaydediliyor", "Saving") : copy("Alarmı kur", "Create alert")}
      </button>
    </form>}

    {actionError && <div className="info-box error" role="alert"><Icon name="alert" size={19} /><p>{actionError}</p></div>}

    {loadError && <div className="info-box error alert-load-error" role="alert">
      <Icon name="alert" size={19} />
      <div>
        <strong>{alerts.length ? copy("Liste yenilenemedi", "List could not refresh") : copy("Alarmlar yüklenemedi", "Alerts could not be loaded")}</strong>
        <p>{loadError}{alerts.length ? copy(" Ekrandaki son kayıtların korunuyor.", " Your most recent items remain on screen.") : copy(" Bağlantını kontrol edip tekrar dene.", " Check your connection and try again.")}</p>
      </div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={16} />} {copy("Tekrar dene", "Try again")}
      </button>
    </div>}

    <div className="saved-list alert-list" aria-busy={loading}>
      {loading && !alerts.length
        ? <div className="skeleton-list" role="status" aria-label={copy("Fiyat alarmları yükleniyor", "Loading price alerts")}><div /><div /></div>
        : alerts.length ? alerts.map((alert) => {
          const paused = alert.is_active === false;
          return <article className={`saved-card alert-card ${paused ? "paused" : ""}`} key={alert.id}>
            <div className="saved-card-head">
              <span className="saved-icon"><Icon name="bell" /></span>
              <div>
                <small>{alert.is_active === false ? copy("DURAKLATILDI", "PAUSED") : alert.status === "triggered" ? copy("HEDEF YAKALANDI", "TARGET REACHED") : copy("TAKİPTE", "TRACKING")} · {formatDate(alert.departure_date, dateLocale)} {copy("gidiş", "departure")}</small>
                <strong>{alert.origin_label || alert.origin_code} ({alert.origin_code}) → {alert.destination_label || alert.destination_code} ({alert.destination_code})</strong>
              </div>
              <button type="button" disabled={busy === alert.id} onClick={() => void removeAlert(alert)} aria-label={copy("Alarmı sil", "Delete alert")}><Icon name="trash" size={18} /></button>
            </div>
            <div className="alert-metrics">
              <div><span>{copy("Hedef", "Target")}</span><strong>{alert.target_price ? `${priceFormat.format(alert.target_price)} TL` : copy(`%${alert.threshold_percent || 5} düşüş`, `${alert.threshold_percent || 5}% drop`)}</strong></div>
              <div><span>{copy("Son kontrol", "Last checked")}</span><strong>{alert.last_checked_price
                ? `${priceFormat.format(alert.last_checked_price)} TL${alert.last_checked_at ? ` · ${formatDateTime(alert.last_checked_at, dateLocale)}` : ""}`
                : copy("Henüz fiyat verisi yok", "No price data yet")}</strong></div>
            </div>
            {alert.last_error_message && <div className="alert-server-warning" role="status">
              <Icon name="alert" size={17} />
              <div><strong>{copy("Bildirim uyarısı", "Notification warning")}</strong><p>{alert.last_error_message}</p></div>
            </div>}
            <fieldset className="alert-channels compact">
              <legend className="sr-only">{copy("Bu alarmın bildirim kanalları", "Notification channels for this alert")}</legend>
              <label><input type="checkbox" checked={alert.notify_email !== false} disabled={busy === alert.id} onChange={(event) => toggleEmailChannel(alert, event.target.checked)} /> {copy("E-posta", "Email")}</label>
              <label><input type="checkbox" checked={alert.notify_push === true} disabled={busy === alert.id || pushBusy} onChange={(event) => void togglePushChannel(alert, event.target.checked)} /> {copy("Telefon bildirimi", "Phone notification")}</label>
            </fieldset>
            <button type="button" className="secondary-wide" disabled={busy === alert.id} onClick={() => toggleActive(alert)}>
              {busy === alert.id ? <span className="button-loader dark" /> : <Icon name={paused ? "check" : "close"} size={17} />} {paused ? copy("Başlat", "Resume") : copy("Durdur", "Pause")}
            </button>
          </article>;
        }) : !loadError && !actionError ? <div className="empty-state compact">
          <span><Icon name="bell" size={26} /></span>
          <strong>{copy("Henüz fiyat alarmın yok", "No price alerts yet")}</strong>
          <p>{copy("Bir rota ve gidiş tarihi seç; fiyat hedefe inince e-posta veya telefon bildirimiyle haber verelim.", "Choose a route and departure date; we'll notify you when the fare reaches your target.")}</p>
          <button type="button" className="primary-wide" onClick={() => setFormOpen(true)}><Icon name="plus" size={17} /> {copy("İlk alarmını kur", "Create your first alert")}</button>
        </div> : null}
    </div>
  </div>;
}
