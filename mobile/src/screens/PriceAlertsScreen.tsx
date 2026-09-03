import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AirportField } from "../components/AirportField";
import { Icon } from "../components/Icon";
import { ApiError, createAlert, deleteAlert, listAlerts, updateAlert, type AlertMutationResponse } from "../lib/api";
import type { AirportOption } from "../lib/airports";
import { isPastLocalDate, localIsoDate } from "../lib/dates";
import { enablePushForUser, isPushAvailable } from "../lib/push";
import type { AuthUser, FlightAlert } from "../types";

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

const priceFormat = new Intl.NumberFormat("tr-TR");

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      .format(new Date(value));
  } catch {
    return value;
  }
}

function formError(form: AlertForm) {
  if (!form.origin) return "Kalkış havalimanını listeden seç.";
  if (!form.destination) return "Varış havalimanını listeden seç.";
  if (form.origin.iata === form.destination.iata) return "Kalkış ve varış aynı olamaz.";
  if (!form.departureDate) return "Gidiş tarihini seç.";
  if (isPastLocalDate(form.departureDate)) return "Gidiş tarihi geçmiş bir gün olamaz.";
  if (form.targetPrice) {
    const price = Number(form.targetPrice);
    if (!Number.isFinite(price) || price <= 0) return "Hedef fiyat pozitif bir sayı olmalı.";
  }
  if (!form.notifyEmail && !form.notifyPush) return "En az bir bildirim kanalı seçmelisin.";
  return "";
}

function alertStatusLabel(alert: FlightAlert) {
  if (alert.is_active === false) return "DURAKLATILDI";
  if (alert.status === "triggered") return "HEDEF YAKALANDI";
  return "TAKİPTE";
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}

function responseNotice(result: AlertMutationResponse, fallback: string, preferServerMessage = false) {
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
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AlertForm>(EMPTY_FORM);
  const [pushBusy, setPushBusy] = useState(false);
  const loadGeneration = useRef(0);

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
      if (generation === loadGeneration.current) setLoadError(errorText(requestError, "Fiyat alarmların yüklenemedi."));
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    void load();
    return () => { loadGeneration.current += 1; };
  }, [load]);

  const requestPushOptIn = useCallback(async () => {
    if (!isPushAvailable()) {
      onNotice("Telefon bildirimleri yalnızca uygulamanın cihaz sürümünde açılabilir. E-posta ile devam edebilirsin.");
      return false;
    }
    setPushBusy(true);
    try {
      const result = await enablePushForUser(getToken);
      if (result.ok) return true;
      if (result.reason === "denied") {
        onNotice("Bildirim izni verilmedi. E-posta bildirimleri çalışmaya devam eder; izni cihaz ayarlarından açabilirsin.");
      } else {
        onNotice("Telefon bildirimi şu an açılamadı. E-posta ile devam edebilirsin.");
      }
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [getToken, onNotice]);

  const toggleFormPush = async (checked: boolean) => {
    if (!checked) {
      if (!form.notifyEmail) {
        setActionError("En az bir bildirim kanalı açık kalmalı. Önce e-posta bildirimini aç.");
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
      setActionError("En az bir bildirim kanalı açık kalmalı. Telefon bildirimi istiyorsan önce onu aç.");
      return;
    }
    setActionError("");
    setForm((current) => ({ ...current, notifyEmail: checked }));
  };

  const submitAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !accessToken || busy || loading) return;
    const validation = formError(form);
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
      onNotice(responseNotice(result, "Fiyat alarmın kuruldu.", true));
      await load();
    } catch (requestError) {
      setActionError(errorText(requestError, "Alarm kaydedilemedi. Bilgileri kontrol edip tekrar dene."));
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
      onNotice(responseNotice(result, notice));
    } catch (requestError) {
      // İstek başarısızsa ekrandaki doğrulanmış son listeyi koru. Kullanıcı
      // isterse üstteki Yenile düğmesiyle sunucudan yeniden eşitleyebilir.
      setActionError(errorText(requestError, failNotice));
    } finally {
      setBusy("");
    }
  };

  const toggleActive = (alert: FlightAlert) => {
    const nextActive = alert.is_active === false;
    if (nextActive && !hasAlertChannel(alert)) {
      setActionError("Bu alarmı başlatmadan önce e-posta veya telefon bildirimini aç.");
      return;
    }
    void patchAlert(
      alert,
      { is_active: nextActive },
      nextActive ? "Alarm yeniden başlatıldı." : "Alarm duraklatıldı.",
      "Alarm durumu güncellenemedi.",
    );
  };

  const toggleEmailChannel = (alert: FlightAlert, checked: boolean) => {
    if (!checked && isActiveAlert(alert) && alert.notify_push !== true) {
      setActionError("Aktif alarmın son bildirim kanalını kapatamazsın. Önce telefon bildirimini aç veya alarmı durdur.");
      return;
    }
    void patchAlert(
      alert,
      { notify_email: checked },
      checked ? "E-posta bildirimi açıldı." : "E-posta bildirimi kapatıldı.",
      "Bildirim kanalı güncellenemedi.",
    );
  };

  const togglePushChannel = async (alert: FlightAlert, checked: boolean) => {
    if (!checked) {
      if (isActiveAlert(alert) && alert.notify_email === false) {
        setActionError("Aktif alarmın son bildirim kanalını kapatamazsın. Önce e-posta bildirimini aç veya alarmı durdur.");
        return;
      }
      void patchAlert(alert, { notify_push: false }, "Bu alarm için telefon bildirimi kapatıldı.", "Bildirim kanalı güncellenemedi.");
      return;
    }
    const enabled = await requestPushOptIn();
    if (!enabled) return;
    void patchAlert(alert, { notify_push: true }, "Bu alarm için telefon bildirimi açıldı.", "Bildirim kanalı güncellenemedi.");
  };

  const removeAlert = async (alert: FlightAlert) => {
    if (!accessToken || busy) return;
    if (!window.confirm(`${alert.origin_code} → ${alert.destination_code} alarmını silmek istiyor musun?`)) return;
    setBusy(alert.id);
    setActionError("");
    try {
      await deleteAlert(alert.id, accessToken);
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      onNotice("Fiyat alarmı silindi.");
    } catch (requestError) {
      setActionError(errorText(requestError, "Alarm silinemedi."));
    } finally {
      setBusy("");
    }
  };

  if (!user || !accessToken) {
    return <div className="screen alerts-screen">
      <section className="page-intro compact-intro">
        <span className="page-icon"><Icon name="bell" size={27} /></span>
        <div><small>FİYAT ALARMLARIM</small><h1>Fiyat düşünce haber al</h1><p>Takip ettiğin rota hedef fiyata inince e-posta veya telefon bildirimiyle haberdar olursun.</p></div>
      </section>
      <div className="login-required">
        <span><Icon name="lock" size={28} /></span>
        <h2>Alarmların için giriş yap</h2>
        <p>Fiyat alarmların hesabına bağlı saklanır ve web ile mobilde birlikte çalışır.</p>
        <button className="primary-wide" onClick={onOpenAccount}><Icon name="user" size={18} /> Giriş yap / hesap aç</button>
      </div>
    </div>;
  }

  return <div className="screen alerts-screen">
    <section className="page-intro compact-intro">
      <span className="page-icon"><Icon name="bell" size={27} /></span>
      <div><small>FİYAT ALARMLARIM</small><h1>Rotanı takibe al</h1><p>Hangi tarihte, hangi rotayı takip ettiğini burada yönet; fiyat hedefe inince haber verilir.</p></div>
    </section>

    <div className="alerts-toolbar">
      <button type="button" className="primary-button" disabled={Boolean(busy) || loading} onClick={() => { setFormOpen((open) => !open); setActionError(""); }}>
        <Icon name={formOpen ? "close" : "plus"} size={18} /> {formOpen ? "Formu kapat" : "Alarm kur"}
      </button>
      <button type="button" className="secondary-button" disabled={loading || Boolean(busy)} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} Yenile
      </button>
    </div>

    {formOpen && <form className="form-card alert-form" onSubmit={submitAlert}>
      <AirportField label="Nereden" required value={form.origin} onChange={(origin) => setForm({ ...form, origin })} />
      <AirportField label="Nereye" required value={form.destination} onChange={(destination) => setForm({ ...form, destination })} />
      <div className="form-grid two stack-narrow">
        <label><span>Gidiş tarihi <em className="required-mark">· zorunlu</em></span><input type="date" required aria-required="true" min={localIsoDate(0)} value={form.departureDate} onChange={(event) => setForm({ ...form, departureDate: event.target.value })} /></label>
        <label>Hedef fiyat (TL, isteğe bağlı)<input type="number" min={1} step={1} inputMode="numeric" value={form.targetPrice} onChange={(event) => setForm({ ...form, targetPrice: event.target.value })} placeholder="Boşsa %5 düşüşte haber verilir" /></label>
      </div>
      <fieldset className="alert-channels" aria-describedby="alert-channel-help">
        <legend>Bildirim kanalları · en az biri zorunlu</legend>
        <label><input type="checkbox" checked={form.notifyEmail} onChange={(event) => toggleFormEmail(event.target.checked)} /> E-posta</label>
        <label><input type="checkbox" checked={form.notifyPush} disabled={pushBusy} onChange={(event) => void toggleFormPush(event.target.checked)} /> Telefon bildirimi</label>
        <p className="alert-push-note" id="alert-channel-help">En az bir kanal açık kalmalı.{form.notifyPush ? " Fiyat hedefe inince telefonuna anlık bildirim gönderilir." : " Telefon bildirimi için cihaz izni gerekir."}</p>
      </fieldset>
      <button className="primary-wide" disabled={busy === "create" || loading || pushBusy} type="submit">
        {busy === "create" ? <span className="button-loader" /> : <Icon name="bell" size={18} />} {busy === "create" ? "Kaydediliyor" : "Alarmı kur"}
      </button>
    </form>}

    {actionError && <div className="info-box error" role="alert"><Icon name="alert" size={19} /><p>{actionError}</p></div>}

    {loadError && <div className="info-box error alert-load-error" role="alert">
      <Icon name="alert" size={19} />
      <div>
        <strong>{alerts.length ? "Liste yenilenemedi" : "Alarmlar yüklenemedi"}</strong>
        <p>{loadError}{alerts.length ? " Ekrandaki son kayıtların korunuyor." : " Bağlantını kontrol edip tekrar dene."}</p>
      </div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={16} />} Tekrar dene
      </button>
    </div>}

    <div className="saved-list alert-list" aria-busy={loading}>
      {loading && !alerts.length
        ? <div className="skeleton-list" role="status" aria-label="Fiyat alarmları yükleniyor"><div /><div /></div>
        : alerts.length ? alerts.map((alert) => {
          const paused = alert.is_active === false;
          return <article className={`saved-card alert-card ${paused ? "paused" : ""}`} key={alert.id}>
            <div className="saved-card-head">
              <span className="saved-icon"><Icon name="bell" /></span>
              <div>
                <small>{alertStatusLabel(alert)} · {formatDate(alert.departure_date)} gidiş</small>
                <strong>{alert.origin_label || alert.origin_code} ({alert.origin_code}) → {alert.destination_label || alert.destination_code} ({alert.destination_code})</strong>
              </div>
              <button type="button" disabled={busy === alert.id} onClick={() => void removeAlert(alert)} aria-label="Alarmı sil"><Icon name="trash" size={18} /></button>
            </div>
            <div className="alert-metrics">
              <div><span>Hedef</span><strong>{alert.target_price ? `${priceFormat.format(alert.target_price)} TL` : `%${alert.threshold_percent || 5} düşüş`}</strong></div>
              <div><span>Son kontrol</span><strong>{alert.last_checked_price
                ? `${priceFormat.format(alert.last_checked_price)} TL${alert.last_checked_at ? ` · ${formatDateTime(alert.last_checked_at)}` : ""}`
                : "Henüz fiyat verisi yok"}</strong></div>
            </div>
            {alert.last_error_message && <div className="alert-server-warning" role="status">
              <Icon name="alert" size={17} />
              <div><strong>Bildirim uyarısı</strong><p>{alert.last_error_message}</p></div>
            </div>}
            <fieldset className="alert-channels compact">
              <legend className="sr-only">Bu alarmın bildirim kanalları</legend>
              <label><input type="checkbox" checked={alert.notify_email !== false} disabled={busy === alert.id} onChange={(event) => toggleEmailChannel(alert, event.target.checked)} /> E-posta</label>
              <label><input type="checkbox" checked={alert.notify_push === true} disabled={busy === alert.id || pushBusy} onChange={(event) => void togglePushChannel(alert, event.target.checked)} /> Telefon bildirimi</label>
            </fieldset>
            <button type="button" className="secondary-wide" disabled={busy === alert.id} onClick={() => toggleActive(alert)}>
              {busy === alert.id ? <span className="button-loader dark" /> : <Icon name={paused ? "check" : "close"} size={17} />} {paused ? "Başlat" : "Durdur"}
            </button>
          </article>;
        }) : !loadError && !actionError ? <div className="empty-state compact">
          <span><Icon name="bell" size={26} /></span>
          <strong>Henüz fiyat alarmın yok</strong>
          <p>Bir rota ve gidiş tarihi seç; fiyat hedefe inince e-posta veya telefon bildirimiyle haber verelim.</p>
          <button type="button" className="primary-wide" onClick={() => setFormOpen(true)}><Icon name="plus" size={17} /> İlk alarmını kur</button>
        </div> : null}
    </div>
  </div>;
}
