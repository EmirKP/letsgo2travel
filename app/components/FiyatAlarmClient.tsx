"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import AirportAutocomplete, { type AirportOption } from "./AirportAutocomplete";

const IST: AirportOption = { iata: "IST", name: "İstanbul Havalimanı", city: "İstanbul", country: "Türkiye", countryCode: "TR" };
const SAW: AirportOption = { iata: "SAW", name: "Sabiha Gökçen Havalimanı", city: "İstanbul", country: "Türkiye", countryCode: "TR" };

// Hızlı seçim kısayolları; asıl seçim dünya çapında autocomplete iledir.
const POPULAR_ROUTES: Array<{ label: string; origin: AirportOption; destination: AirportOption }> = [
  { label: "İstanbul → Dubai", origin: IST, destination: { iata: "DXB", name: "Dubai International Airport", city: "Dubai", country: "Birleşik Arap Emirlikleri", countryCode: "AE" } },
  { label: "İstanbul → Bakü", origin: IST, destination: { iata: "GYD", name: "Heydar Aliyev International Airport", city: "Bakü", country: "Azerbaycan", countryCode: "AZ" } },
  { label: "İstanbul (SAW) → Tiflis", origin: SAW, destination: { iata: "TBS", name: "Tbilisi International Airport", city: "Tiflis", country: "Gürcistan", countryCode: "GE" } },
  { label: "İstanbul → Saraybosna", origin: IST, destination: { iata: "SJJ", name: "Sarajevo International Airport", city: "Saraybosna", country: "Bosna-Hersek", countryCode: "BA" } },
  { label: "İstanbul → Roma", origin: IST, destination: { iata: "FCO", name: "Roma Fiumicino Havalimanı", city: "Roma", country: "İtalya", countryCode: "IT" } },
];

// Saat dilimi guvenli: toISOString UTC gunu verdigi icin gece saatlerinde
// tarihi bir gun geri kaydirir; yerel takvim gunu kullanilir.
function localIsoDate(daysFromNow = 0) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function defaultDepartureDate() {
  return localIsoDate(30);
}

export default function FiyatAlarmClient() {
  const [form, setForm] = useState({
    email: "",
    departureDate: defaultDepartureDate(),
    targetPrice: "",
  });
  const [origin, setOrigin] = useState<AirportOption | null>(IST);
  const [destination, setDestination] = useState<AirportOption | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  // Bildirim kanallari: e-posta varsayilan aciktir; telefon bildirimi
  // varsayilan KAPALIDIR ve yalniz giris yapmis kullanicilar secebilir.
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionToken(data.session?.access_token || null);
      if (data.session?.user.email) {
        setForm((f) => (f.email ? f : { ...f, email: data.session!.user.email || "" }));
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function setRoute(route: { origin: AirportOption; destination: AirportOption }) {
    setOrigin(route.origin);
    setDestination(route.destination);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!origin || !destination) {
      setStatus("error");
      setMessage("Kalkış ve varış havalimanlarını listeden seçmelisin.");
      return;
    }
    if (origin.iata === destination.iata) {
      setStatus("error");
      setMessage("Kalkış ve varış aynı olamaz.");
      return;
    }
    if (form.departureDate < localIsoDate(0)) {
      setStatus("error");
      setMessage("Gidiş tarihi geçmiş bir gün olamaz.");
      return;
    }
    if (form.departureDate > localIsoDate(730)) {
      setStatus("error");
      setMessage("Gidiş tarihi bugünden itibaren iki yıl içinde olmalı.");
      return;
    }
    if (!notifyEmail && !notifyPush) {
      setStatus("error");
      setMessage("En az bir bildirim kanalı seçmelisin (e-posta veya telefon bildirimi).");
      return;
    }
    if (notifyEmail && !form.email && !sessionToken) {
      setStatus("error");
      setMessage("E-posta bildirimi için e-posta adresini yazmalısın.");
      return;
    }
    setStatus("loading");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const res = await fetch("/api/flight-alerts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: form.email,
          originCode: origin?.iata,
          originLabel: origin ? (origin.city || origin.name) : "",
          destinationCode: destination?.iata,
          destinationLabel: destination ? (destination.city || destination.name) : "",
          departureDate: form.departureDate,
          targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
          tripType: "one_way",
          adults: 1,
          cabinClass: "economy",
          notifyEmail,
          notifyPush: notifyPush && Boolean(sessionToken),
          // Tarih doğrulaması kullanıcının KENDİ takvim gününe göre yapılır.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Fiyat alarmın kuruldu. Onay maili gönderildi.");
        setForm((f) => ({ ...f, email: "", targetPrice: "" }));
      } else {
        setStatus("error");
        setMessage(data.error || "Bir hata oluştu.");
      }
    } catch {
      setStatus("error");
      setMessage("Bağlantı hatası. Lütfen tekrar dene.");
    }
  }

  return (
    <div className="l2t-alarm-layout">
      {/* Form kartı */}
      <div className="l2t-alarm-form-card">
        <h2>Fiyat alarmı oluştur</h2>
        <p>İstediğin rota ve tarih için hedef fiyat belirle; fiyat düşünce e-posta veya telefon bildirimi al.</p>

        {/* Popüler rota hızlı seçim */}
        <div className="l2t-alarm-quick-routes">
          <span>Popüler rotalar:</span>
          <div className="l2t-filter-chips">
            {POPULAR_ROUTES.map((r) => (
              <button
                key={r.label}
                type="button"
                className={`l2t-chip${destination?.iata === r.destination.iata && origin?.iata === r.origin.iata ? " l2t-chip-active" : ""}`}
                onClick={() => setRoute(r)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="l2t-alarm-form">
          <div className="l2t-alarm-route-stack">
            <AirportAutocomplete
              label="Nereden (kalkış)"
              placeholder="Şehir, ülke veya havalimanı yaz"
              value={origin}
              onChange={setOrigin}
              required
            />
            <button
              type="button"
              className="l2t-swap-btn"
              onClick={() => { const previous = origin; setOrigin(destination); setDestination(previous); }}
              aria-label="Kalkış ve varışı değiştir"
            >
              ⇄
            </button>
            <AirportAutocomplete
              label="Nereye (varış)"
              placeholder="Şehir, ülke veya havalimanı yaz"
              value={destination}
              onChange={setDestination}
              required
            />
          </div>

          <label className="l2t-alarm-field">
            <span>Gidiş tarihi</span>
            <input
              type="date"
              min={localIsoDate(0)}
              max={localIsoDate(730)}
              value={form.departureDate}
              onChange={(e) => setForm((f) => ({ ...f, departureDate: e.target.value }))}
              required
            />
          </label>

          <label className="l2t-alarm-field">
            <span>Hedef fiyat (TL) — boş bırakırsan %5 düşüşte haber veririz</span>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={form.targetPrice}
              onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
              placeholder="Örn: 3000"
              min={0}
            />
          </label>

          <fieldset className="l2t-alarm-channels">
            <legend>Sana nasıl haber verelim?</legend>

            <div className={`l2t-alarm-channel${notifyEmail ? " is-on" : ""}`}>
              <label className="l2t-alarm-channel-head">
                <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                <span>
                  <strong>E-posta</strong>
                  <small>Fiyat düşünce e-posta ile bildiririz.</small>
                </span>
              </label>
              {notifyEmail && (
                <label className="l2t-alarm-field l2t-alarm-channel-input">
                  <span>E-posta adresin</span>
                  <input
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="ornek@mail.com"
                    required
                  />
                </label>
              )}
            </div>

            <div className={`l2t-alarm-channel${notifyPush ? " is-on" : ""}${sessionToken ? "" : " is-disabled"}`}>
              <label className="l2t-alarm-channel-head">
                <input type="checkbox" checked={notifyPush} disabled={!sessionToken} onChange={(e) => setNotifyPush(e.target.checked)} />
                <span>
                  <strong>Telefon bildirimi</strong>
                  <small>
                    {sessionToken
                      ? "Mobil uygulamada aynı hesapla giriş yapıp bildirim iznini açman yeterli. İzni daha önce reddettiysen iPhone'da Ayarlar > Bildirimler > LetsGo2Travel'dan açabilirsin."
                      : "Bunun için önce giriş yapman gerekir; e-posta ile giriş yapmadan da devam edebilirsin."}
                  </small>
                </span>
              </label>
            </div>
          </fieldset>

          {status === "success" ? (
            <div className="l2t-alarm-success" role="status">
              <p>✓ {message}</p>
              <div className="l2t-alarm-success-actions">
                <a href="/profil/fiyat-alarmlari">Alarmlarımı gör</a>
                <button type="button" onClick={() => setStatus("idle")}>Yeni alarm kur</button>
              </div>
            </div>
          ) : (
            <button type="submit" className="l2t-btn l2t-btn-wide" disabled={status === "loading"}>
              {status === "loading" ? "Kaydediliyor..." : "🔔 Alarm kur"}
            </button>
          )}

          {status === "error" && (
            <p className="l2t-alarm-error" role="alert">{message}</p>
          )}
        </form>
      </div>

      {/* Bilgi paneli */}
      <div className="l2t-alarm-info">
        <h3>Nasıl çalışır?</h3>
        <ol className="l2t-alarm-steps">
          <li>
            <strong>Rotanı seç</strong>
            <span>Nereden nereye gideceğini ve hedef fiyatı belirle.</span>
          </li>
          <li>
            <strong>Bildirim kanalını seç</strong>
            <span>E-posta, telefon bildirimi veya ikisini birden seçebilirsin.</span>
          </li>
          <li>
            <strong>Bildirim al</strong>
            <span>Fiyat hedefine ulaştığında seçtiğin kanaldan (e-posta ve/veya telefon bildirimi) haber verilir.</span>
          </li>
        </ol>

        <div className="l2t-alarm-tips">
          <h4>💡 Fiyat takip taktikleri</h4>
          <ul>
            <li>Salı ve çarşamba günleri bilet fiyatları genellikle düşer</li>
            <li>IST ve SAW alternatifleri farklı fiyatlar gösterebilir</li>
            <li>1-2 gün tarih esnetmek %20–40 fiyat farkı yaratabilir</li>
            <li>Tatilden 6–8 hafta önce fiyatlar genellikle en uygun seviyededir</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
