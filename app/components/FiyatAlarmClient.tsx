"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";

const POPULAR_ROUTES = [
  { label: "IST → DXB (Dubai)", origin: "IST", dest: "DXB", destinationLabel: "Dubai" },
  { label: "IST → GYD (Bakü)", origin: "IST", dest: "GYD", destinationLabel: "Bakü" },
  { label: "SAW → TBS (Tiflis)", origin: "SAW", dest: "TBS", destinationLabel: "Tiflis" },
  { label: "IST → SJJ (Saraybosna)", origin: "IST", dest: "SJJ", destinationLabel: "Saraybosna" },
  { label: "IST → FCO (Roma)", origin: "IST", dest: "FCO", destinationLabel: "Roma" },
  { label: "IST → TIA (Tiran)", origin: "IST", dest: "TIA", destinationLabel: "Tiran" },
];

function defaultDepartureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export default function FiyatAlarmClient() {
  const [form, setForm] = useState({
    email: "",
    origin: "IST",
    destination: "",
    destinationLabel: "",
    departureDate: defaultDepartureDate(),
    targetPrice: "",
  });
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

  function setRoute(origin: string, dest: string, destinationLabel: string) {
    setForm((f) => ({ ...f, origin, destination: dest, destinationLabel }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.destination) return;
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
          originCode: form.origin,
          originLabel: form.origin,
          destinationCode: form.destination,
          destinationLabel: form.destinationLabel || form.destination,
          departureDate: form.departureDate,
          targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
          tripType: "one_way",
          adults: 1,
          cabinClass: "economy",
          notifyEmail,
          notifyPush: notifyPush && Boolean(sessionToken),
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
                key={r.dest}
                type="button"
                className={`l2t-chip${form.destination === r.dest ? " l2t-chip-active" : ""}`}
                onClick={() => setRoute(r.origin, r.dest, r.destinationLabel)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="l2t-alarm-form">
          <div className="l2t-alarm-route-row">
            <label className="l2t-alarm-field">
              <span>Nereden</span>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value.toUpperCase().slice(0, 3) }))}
                placeholder="IST"
                maxLength={3}
                required
              />
            </label>
            <button
              type="button"
              className="l2t-swap-btn"
              onClick={() => setForm((f) => ({ ...f, origin: f.destination, destination: f.origin }))}
              aria-label="Değiştir"
            >
              ⇄
            </button>
            <label className="l2t-alarm-field">
              <span>Nereye</span>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value.toUpperCase().slice(0, 3), destinationLabel: "" }))}
                placeholder="DXB, GYD..."
                maxLength={3}
                required
              />
            </label>
          </div>

          <label className="l2t-alarm-field">
            <span>Gidiş tarihi</span>
            <input
              type="date"
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
