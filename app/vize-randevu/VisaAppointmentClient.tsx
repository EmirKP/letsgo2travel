"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileCheck2,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { SCHENGEN_COUNTRIES } from "@/lib/visa-appointments/catalog";
import { getProviderActionUrl } from "@/lib/visa-appointments/provider-links";
import {
  APPLICATION_CITIES,
  TRACK_STATUS_LABELS,
  VISA_CATEGORIES,
  type TrackCreateInput,
  type VisaAppointmentNotification,
  type VisaAppointmentTrack,
} from "@/lib/visa-appointments/types";
import styles from "./visa-appointment.module.css";

function inputDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function remainingHours(value: string) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 3_600_000));
}

function resultSummary(track: VisaAppointmentTrack) {
  if (track.status === "verification_required") {
    return "Resmî sağlayıcı doğrulama istiyor. İşlemi resmî sayfada tamamladıktan sonra kontrolü yeniden başlat.";
  }
  if (track.status === "match_found") return "Uygun tarih bulundu. Ayrıntıları gecikmeden kontrol et.";
  if (track.status === "error") return "Kontrol sırasında teknik bir hata oluştu. Yönetim ekibi inceleyecek.";
  return track.last_result || "Kontrol bekleniyor";
}

const initialForm: TrackCreateInput = {
  countryCode: "DE",
  applicationCity: "İstanbul",
  alternativeCity: "Ankara",
  visaCategory: "tourism",
  applicantsCount: 1,
  earliestDate: inputDate(7),
  latestDate: inputDate(90),
  notifyEmail: true,
  notifyPush: true,
  notifyInApp: true,
};

export default function VisaAppointmentClient() {
  const router = useRouter();
  const [form, setForm] = useState<TrackCreateInput>(initialForm);
  const [tracks, setTracks] = useState<VisaAppointmentTrack[]>([]);
  const [notifications, setNotifications] = useState<VisaAppointmentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const selectedCountry = useMemo(
    () => SCHENGEN_COUNTRIES.find((country) => country.code === form.countryCode),
    [form.countryCode],
  );

  const authorizedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, []);

  const loadTracks = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const loggedIn = Boolean(data.session);
    setIsLoggedIn(loggedIn);
    if (!loggedIn) {
      setTracks([]);
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const response = await authorizedFetch("/api/visa-appointments", { cache: "no-store" });
      const payload = (await response.json()) as {
        data?: VisaAppointmentTrack[];
        notifications?: VisaAppointmentNotification[];
        error?: string;
      };
      if (response.ok) {
        setTracks(payload.data || []);
        setNotifications(payload.notifications || []);
      } else {
        setMessage(payload.error || "Takipler yüklenemedi.");
      }
    } catch {
      setMessage("Takipler yüklenirken bağlantı hatası oluştu.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadTracks();
    const { data } = supabase.auth.onAuthStateChange(() => void loadTracks());
    return () => data.subscription.unsubscribe();
  }, [loadTracks]);

  async function submitTrack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!isLoggedIn) {
      router.push("/auth/login?next=/vize-randevu");
      return;
    }

    setSubmitting(true);
    try {
      const response = await authorizedFetch("/api/visa-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { data?: VisaAppointmentTrack; error?: string; message?: string };
      if (!response.ok) {
        setMessage(payload.error || "Takip oluşturulamadı.");
        return;
      }
      setMessage(payload.message || "Takip oluşturuldu.");
      await loadTracks();
    } catch {
      setMessage("Takip oluşturulurken bağlantı hatası oluştu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(id: string, action: "pause" | "resume" | "retry") {
    setMessage("");
    setBusyTrackId(id);
    try {
      const response = await authorizedFetch(`/api/visa-appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      setMessage(payload.error || payload.message || "Takip güncellendi.");
      if (response.ok) await loadTracks();
    } finally {
      setBusyTrackId(null);
    }
  }

  async function markNotificationRead(id: string) {
    const response = await authorizedFetch(`/api/visa-appointments/notifications/${id}`, { method: "PATCH" });
    if (response.ok) setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString(), status: "opened" } : item));
  }

  const unreadNotifications = notifications.filter((item) => !item.read_at);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.inner}>
          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <span className={styles.kicker}><SearchCheck size={16} /> Vize Randevu Asistanı</span>
              <h1>Randevu sayfalarını tekrar tekrar kontrol etme.</h1>
              <p>
                Ülke, başvuru şehri ve tarih aralığını kaydet. LetsGo2Travel uygunluk kontrollerini tek panelde
                düzenlesin ve işlem gerektiğinde seni haberdar etsin.
              </p>
              <div className={styles.heroBadges}>
                <span><Clock3 size={17} /> Planlı kontroller</span>
                <span><BellRing size={17} /> Anlık uyarı altyapısı</span>
                <span><ShieldCheck size={17} /> Güvenli işlem devri</span>
              </div>
            </div>
            <div className={styles.heroStatus}>
              <div className={styles.pulse} />
              <span>Sistem durumu</span>
              <strong>Worker bağlantısı aktif</strong>
              <p>Sağlayıcı doğrulama istediğinde takip durdurulur ve işlem güvenli biçimde sana devredilir.</p>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.inner}>
        <section className={styles.dashboard}>
          <div className={styles.formCard}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.step}>01</span>
                <h2>Takip tercihlerini belirle</h2>
              </div>
              <span className={styles.betaBadge}>24 saat beta hakkı</span>
            </div>

            <form onSubmit={submitTrack} className={styles.form}>
              <label>
                <span>Schengen ülkesi</span>
                <select value={form.countryCode} onChange={(event) => setForm({ ...form, countryCode: event.target.value })}>
                  {SCHENGEN_COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>{country.flag} {country.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Başvuru şehri</span>
                <select value={form.applicationCity} onChange={(event) => setForm({ ...form, applicationCity: event.target.value as TrackCreateInput["applicationCity"] })}>
                  {APPLICATION_CITIES.map((city) => <option key={city}>{city}</option>)}
                </select>
              </label>

              <label>
                <span>Alternatif şehir</span>
                <select value={form.alternativeCity} onChange={(event) => setForm({ ...form, alternativeCity: event.target.value as TrackCreateInput["alternativeCity"] })}>
                  <option value="">Alternatif istemiyorum</option>
                  {APPLICATION_CITIES.filter((city) => city !== form.applicationCity).map((city) => <option key={city}>{city}</option>)}
                </select>
              </label>

              <label>
                <span>Vize kategorisi</span>
                <select value={form.visaCategory} onChange={(event) => setForm({ ...form, visaCategory: event.target.value as TrackCreateInput["visaCategory"] })}>
                  {VISA_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </label>

              <label>
                <span>Kişi sayısı</span>
                <div className={styles.iconInput}><Users size={18} /><input type="number" min={1} max={4} value={form.applicantsCount} onChange={(event) => setForm({ ...form, applicantsCount: Number(event.target.value) })} /></div>
              </label>

              <label>
                <span>En erken uygun tarih</span>
                <div className={styles.iconInput}><CalendarDays size={18} /><input type="date" min={inputDate(1)} value={form.earliestDate} onChange={(event) => setForm({ ...form, earliestDate: event.target.value })} /></div>
              </label>

              <label>
                <span>En geç uygun tarih</span>
                <div className={styles.iconInput}><CalendarDays size={18} /><input type="date" min={form.earliestDate} value={form.latestDate} onChange={(event) => setForm({ ...form, latestDate: event.target.value })} /></div>
              </label>

              <div className={styles.providerInfo}>
                <MapPin size={19} />
                <div>
                  <strong>{selectedCountry?.name} sağlayıcısı</strong>
                  <p>Yetkili aracı kurum, seçilen şehir ve kategori için yönetim tarafında doğrulandıktan sonra etkinleşir.</p>
                </div>
              </div>

              <fieldset className={styles.notifications}>
                <legend>Bildirim kanalları</legend>
                <label><input type="checkbox" checked={form.notifyInApp} onChange={(event) => setForm({ ...form, notifyInApp: event.target.checked })} /><span>Uygulama içi</span></label>
                <label><input type="checkbox" checked={form.notifyPush} onChange={(event) => setForm({ ...form, notifyPush: event.target.checked })} /><span>Push</span></label>
                <label><input type="checkbox" checked={form.notifyEmail} onChange={(event) => setForm({ ...form, notifyEmail: event.target.checked })} /><span>E-posta</span></label>
              </fieldset>

              <div className={styles.consent}>
                <ShieldCheck size={18} />
                <p>Sistem CAPTCHA, SMS, e-posta doğrulaması veya ödeme onayını atlamaz. Bu adımlar gerektiğinde işlem sana devredilir.</p>
              </div>

              <button className={styles.submit} type="submit" disabled={submitting}>
                {submitting ? <RefreshCw className={styles.spin} size={19} /> : <SearchCheck size={19} />}
                {isLoggedIn ? (submitting ? "Oluşturuluyor..." : "24 saatlik takibi başlat") : "Giriş yap ve takibi başlat"}
              </button>
            </form>
          </div>

          <aside className={styles.sideColumn}>
            <div className={styles.workflowCard}>
              <span className={styles.step}>02</span>
              <h2>Nasıl çalışacak?</h2>
              <ol>
                <li><span>1</span><div><strong>Tercihler kaydedilir</strong><p>Ülke, şehir, kategori ve tarih aralığı tek görevde tutulur.</p></div></li>
                <li><span>2</span><div><strong>Sağlayıcı kontrol edilir</strong><p>Etkin sağlayıcı modülü planlı aralıklarla çalışır.</p></div></li>
                <li><span>3</span><div><strong>İşlem sana devredilir</strong><p>Uygun tarih veya doğrulama adımı çıktığında bildirim gönderilir.</p></div></li>
              </ol>
            </div>

            <div className={styles.documentCard}>
              <FileCheck2 size={25} />
              <div>
                <strong>Randevudan sonra sistem bitmeyecek</strong>
                <p>Evrak kontrol listesi, görüşme hatırlatması ve Seyahat Kokpiti bağlantısı sonraki pakette aynı takibe bağlanacak.</p>
              </div>
            </div>
          </aside>
        </section>

        {message && <div className={styles.message} role="status">{message}</div>}

        {unreadNotifications.length > 0 && (
          <section className={styles.notificationPanel} aria-label="Vize bildirimleri">
            <div className={styles.notificationHead}>
              <div><BellRing size={20} /><strong>İşlem bekleyen bildirimler</strong></div>
              <span>{unreadNotifications.length}</span>
            </div>
            <div className={styles.notificationList}>
              {unreadNotifications.map((notification) => (
                <article key={notification.id}>
                  <ShieldAlert size={20} />
                  <div>
                    <strong>{notification.title || "Vize takibinde işlem gerekiyor"}</strong>
                    <p>{notification.message || "Takip ayrıntılarını kontrol et."}</p>
                    <span>{formatDate(notification.created_at, true)}</span>
                  </div>
                  <button type="button" onClick={() => void markNotificationRead(notification.id)} aria-label="Bildirimi okundu olarak işaretle"><X size={17} /></button>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className={styles.tracksSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.step}>03</span>
              <h2>Takiplerin</h2>
            </div>
            {isLoggedIn && <button type="button" className={styles.refresh} onClick={() => void loadTracks()}><RefreshCw size={16} /> Yenile</button>}
          </div>

          {loading ? (
            <div className={styles.empty}><RefreshCw className={styles.spin} size={24} /><p>Takipler yükleniyor...</p></div>
          ) : !isLoggedIn ? (
            <div className={styles.empty}>
              <ShieldCheck size={32} />
              <h3>Takiplerini görmek için giriş yap</h3>
              <p>Kayıtlı takipler yalnızca hesabınla görüntülenir.</p>
              <Link href="/auth/login?next=/vize-randevu" className={styles.secondaryButton}>Giriş yap <ChevronRight size={17} /></Link>
            </div>
          ) : tracks.length === 0 ? (
            <div className={styles.empty}>
              <SearchCheck size={32} />
              <h3>Henüz aktif takip yok</h3>
              <p>Yukarıdaki formdan ilk 24 saatlik beta takibini oluştur.</p>
            </div>
          ) : (
            <div className={styles.trackGrid}>
              {tracks.map((track) => {
                const providerActionUrl = getProviderActionUrl(track.provider_code);
                return (
                  <article className={styles.trackCard} key={track.id}>
                    <div className={styles.trackTop}>
                      <div>
                        <span>{track.country_code}</span>
                        <h3>{track.country_name}</h3>
                      </div>
                      <span className={`${styles.status} ${styles[`status_${track.status}`] || ""}`}>
                        {TRACK_STATUS_LABELS[track.status]}
                      </span>
                    </div>

                    {track.status === "verification_required" && (
                      <div className={styles.handoffCard}>
                        <ShieldAlert size={22} />
                        <div>
                          <strong>Resmî sağlayıcı doğrulaması gerekiyor</strong>
                          <p>iDATA sayfasında gerekli doğrulamayı tamamla. Sonra bu ekrana dönüp kontrolü yeniden başlat.</p>
                          <div className={styles.handoffActions}>
                            {providerActionUrl && (
                              <a href={providerActionUrl} target="_blank" rel="noreferrer">
                                Resmî iDATA sayfasına git <ExternalLink size={15} />
                              </a>
                            )}
                            <button type="button" onClick={() => void changeStatus(track.id, "retry")} disabled={busyTrackId === track.id}>
                              <RefreshCw className={busyTrackId === track.id ? styles.spin : ""} size={15} /> Doğrulamayı yaptım, yeniden kontrol et
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={styles.trackMeta}>
                      <span><MapPin size={15} /> {track.application_city}{track.alternative_city ? ` + ${track.alternative_city}` : ""}</span>
                      <span><CalendarDays size={15} /> {formatDate(track.earliest_date)} – {formatDate(track.latest_date)}</span>
                      <span><Clock3 size={15} /> Son kontrol: {formatDate(track.last_checked_at, true)}</span>
                    </div>
                    <div className={styles.progressRow}>
                      <div><span>Kalan beta süresi</span><strong>{remainingHours(track.access_expires_at)} saat</strong></div>
                      <div><span>Sonuç</span><strong>{resultSummary(track)}</strong></div>
                    </div>
                    {track.last_result && track.status === "verification_required" && (
                      <details className={styles.technicalDetail}>
                        <summary>Teknik ayrıntıyı göster</summary>
                        <p>{track.last_result}</p>
                      </details>
                    )}
                    <div className={styles.trackActions}>
                      {track.status === "paused" ? (
                        <button type="button" onClick={() => void changeStatus(track.id, "resume")} disabled={busyTrackId === track.id}><Play size={16} /> Takibi sürdür</button>
                      ) : track.status === "active" || track.status === "pending_activation" ? (
                        <button type="button" onClick={() => void changeStatus(track.id, "pause")} disabled={busyTrackId === track.id}><Pause size={16} /> Duraklat</button>
                      ) : null}
                      <Link href="/vize-merkezi"><CheckCircle2 size={16} /> Vize rehberleri</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className={styles.legal}>
          <AlertTriangle size={17} /> LetsGo2Travel bilgilendirme ve takip desteği sağlar. Randevu uygunluğu ve resmî işlem adımları sağlayıcı ekranlarında değişebilir; kesin işlem için ilgili kurumun resmî ekranı esas alınır.
        </div>
      </div>
    </div>
  );
}
