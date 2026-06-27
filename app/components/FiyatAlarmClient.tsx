"use client";

import { useState } from "react";

const POPULAR_ROUTES = [
  { label: "IST → DXB (Dubai)", origin: "IST", dest: "DXB" },
  { label: "IST → GYD (Bakü)", origin: "IST", dest: "GYD" },
  { label: "SAW → TBS (Tiflis)", origin: "SAW", dest: "TBS" },
  { label: "IST → SJJ (Saraybosna)", origin: "IST", dest: "SJJ" },
  { label: "IST → FCO (Roma)", origin: "IST", dest: "FCO" },
  { label: "IST → TIA (Tiran)", origin: "IST", dest: "TIA" },
];

export default function FiyatAlarmClient() {
  const [form, setForm] = useState({
    email: "",
    origin: "IST",
    destination: "",
    targetPrice: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  function setRoute(origin: string, dest: string) {
    setForm((f) => ({ ...f, origin, destination: dest }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.email || !form.destination) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          // Ek bilgi olarak route ve hedef fiyat gönderiliyor
          note: `Alarm: ${form.origin}→${form.destination}${form.targetPrice ? ` @${form.targetPrice}TL` : ""}`,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Alarm kaydedildi!");
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
        <p>İstediğin rota için hedef fiyat belirle, bilet düşünce e-posta al.</p>

        {/* Popüler rota hızlı seçim */}
        <div className="l2t-alarm-quick-routes">
          <span>Popüler rotalar:</span>
          <div className="l2t-filter-chips">
            {POPULAR_ROUTES.map((r) => (
              <button
                key={r.dest}
                type="button"
                className={`l2t-chip${form.destination === r.dest ? " l2t-chip-active" : ""}`}
                onClick={() => setRoute(r.origin, r.dest)}
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
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value.toUpperCase().slice(0, 3) }))}
                placeholder="DXB, GYD..."
                maxLength={3}
                required
              />
            </label>
          </div>

          <label className="l2t-alarm-field">
            <span>Hedef fiyat (TL) — opsiyonel</span>
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

          <label className="l2t-alarm-field">
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

          {status === "success" ? (
            <div className="l2t-alarm-success">
              ✓ {message}
            </div>
          ) : (
            <button type="submit" className="l2t-btn l2t-btn-wide" disabled={status === "loading"}>
              {status === "loading" ? "Kaydediliyor..." : "🔔 Alarm kur"}
            </button>
          )}

          {status === "error" && (
            <p style={{ color: "#e53e3e", fontSize: ".88rem", margin: "8px 0 0" }}>{message}</p>
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
            <strong>E-postanı ekle</strong>
            <span>Fırsat çıktığında seni haberdar edelim.</span>
          </li>
          <li>
            <strong>Bildirim al</strong>
            <span>Bilet fiyatı hedefine ulaştığında e-posta gönderilir.</span>
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
