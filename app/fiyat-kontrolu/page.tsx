"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AirportPicker from "@/app/components/AirportPicker";
import { getAirportDisplay } from "@/lib/airports";

type FlightLeg = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  departTime: string;
  arriveTime: string;
  departDate: string;
  arriveDate: string;
  durationText: string;
  segments: { airline: string; flightNumber: string; from: string; to: string; departTime: string; arriveTime: string }[];
};

type LiveOffer = {
  id: string;
  provider: "Travelpayouts" | "Demo";
  airline: string;
  price: number;
  currency: string;
  priceText: string;
  durationText: string;
  stopsText: string;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  offerId?: string;
  deepLink?: string;
  expiresAt?: string;
  cabinClass: string;
  bagsText: string;
  emissionsText?: string;
  score: number;
};

function bugun() { return new Date().toISOString().slice(0, 10); }
function gunEkle(value: string, days: number) { const d = new Date(`${value || bugun()}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function safeDate(value: string | null, fallback: string) { const today = bugun(); if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback < today ? today : fallback; return value < today ? today : value; }
function normalizeCode(value: string | null, fallback: string) { const raw = (value || "").toUpperCase(); const match = raw.match(/[A-Z]{3}/); return match?.[0] || fallback; }
function priceNumber(value: string) { return Number(String(value || "").replace(/[^0-9.]/g, "")) || 0; }

export default function FiyatKontroluPage() {
  const [nereden, setNereden] = useState("IST");
  const [nereye, setNereye] = useState("ROM");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(gunEkle(bugun(), 7));
  const [yolcu, setYolcu] = useState("1");
  const [sinif, setSinif] = useState("economy");
  const [aktarma, setAktarma] = useState("Tümü");
  const [maksimumFiyat, setMaksimumFiyat] = useState("50000");
  const [sirala, setSirala] = useState("best");
  const [offers, setOffers] = useState<LiveOffer[]>([]);
  const [mode, setMode] = useState("hazır");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const safeGidis = safeDate(sp.get("gidis"), bugun());
    const rawDonus = sp.get("donus") || gunEkle(safeGidis, 7);
    setNereden(normalizeCode(sp.get("nereden"), "IST"));
    setNereye(normalizeCode(sp.get("nereye"), "ROM"));
    setGidis(safeGidis);
    setDonus(rawDonus < safeGidis ? gunEkle(safeGidis, 7) : rawDonus);
    setYolcu(sp.get("yolcu") || "1");
    setSinif(sp.get("sinif") || "economy");
    setAktarma(sp.get("aktarma") || "Tümü");
    setMaksimumFiyat(sp.get("maksimumFiyat") || "50000");
  }, []);

  useEffect(() => {
    const today = bugun();
    if (gidis < today) setGidis(today);
    if (donus < gidis) setDonus(gunEkle(gidis, 7));
  }, [gidis, donus]);

  const params = useMemo(() => new URLSearchParams({ nereden, nereye, gidis, donus, yolcu, sinif, aktarma, maksimumFiyat }), [nereden, nereye, gidis, donus, yolcu, sinif, aktarma, maksimumFiyat]);

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/travelpayouts-search?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.message || "Travelpayouts araması başarısız oldu. Demo sonuç gösteriyorum.");
        setOffers(Array.isArray(data?.fallback) ? data.fallback : []);
        setMode("demo");
        return;
      }
      setOffers(Array.isArray(data.offers) ? data.offers : []);
      setMode(data.mode || "live");
      setMessage(data.message || (data.mode === "travelpayouts" ? "Travelpayouts / Aviasales son bulunan fiyat verileri getirildi." : "Travelpayouts token yok; gerçek görünümlü demo sonuç gösteriliyor."));
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arama sırasında hata oluştu.");
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setTimeout(() => search(), 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const sorted = useMemo(() => {
    const list = [...offers];
    if (sirala === "cheap") return list.sort((a, b) => a.price - b.price);
    if (sirala === "fast") return list.sort((a, b) => priceNumber(a.durationText) - priceNumber(b.durationText));
    return list.sort((a, b) => a.score - b.score);
  }, [offers, sirala]);

  const cheapest = offers.length ? [...offers].sort((a, b) => a.price - b.price)[0] : null;
  const fastest = offers.length ? [...offers].sort((a, b) => priceNumber(a.durationText) - priceNumber(b.durationText))[0] : null;
  const best = offers.length ? [...offers].sort((a, b) => a.score - b.score)[0] : null;
  const stopCounts = useMemo(() => ({
    direct: offers.filter((o) => o.stopsText === "Aktarmasız").length,
    one: offers.filter((o) => o.stopsText === "1 aktarma").length,
    multi: offers.filter((o) => !["Aktarmasız", "1 aktarma"].includes(o.stopsText)).length,
  }), [offers]);

  return (
    <main className="duffel-page">
      <Header />
      <section className="duffel-hero">
        <div className="duffel-container duffel-hero-grid">
          <div>
            <span className="duffel-pill">⚡ Travelpayouts / Aviasales fiyat kontrolü</span>
            <h1>Uçuş fiyatlarını Skyscanner tarzı ekranda kontrol et.</h1>
            <p>Letsgo2Travel, Travelpayouts / Aviasales son bulunan fiyat verilerini kullanarak rota bazlı fiyat kontrol ekranı sunar. Fiyatlar değişebilir; son adımda partner sayfasında tekrar kontrol edilir.</p>
          </div>
          <div className="duffel-hero-card">
            <span>En düşük sonuç</span>
            <strong>{cheapest?.priceText || "Hazır"}</strong>
            <small>{mode === "travelpayouts" ? "Travelpayouts cache fiyat" : "Demo / token bekliyor"}</small>
          </div>
        </div>
      </section>

      <section className="duffel-search-wrap">
        <div className="duffel-container">
          <form className="duffel-search-card" onSubmit={search}>
            <AirportPicker label="Kalkış" value={nereden} onChange={setNereden} />
            <button type="button" className="duffel-swap" onClick={() => { const a = nereden; setNereden(nereye); setNereye(a); }}>⇄</button>
            <AirportPicker label="Nereye" value={nereye} onChange={setNereye} />
            <label className="duffel-field"><span>Gidiş</span><input type="date" min={bugun()} value={gidis} onChange={(e) => setGidis(e.target.value)} /></label>
            <label className="duffel-field"><span>Dönüş</span><input type="date" min={gidis || bugun()} value={donus} onChange={(e) => setDonus(e.target.value)} /></label>
            <label className="duffel-field"><span>Yolcu</span><select value={yolcu} onChange={(e) => setYolcu(e.target.value)}>{[1,2,3,4,5,6,7,8,9].map((n) => <option key={n} value={n}>{n} yetişkin</option>)}</select></label>
            <label className="duffel-field"><span>Sınıf</span><select value={sinif} onChange={(e) => setSinif(e.target.value)}><option value="economy">Ekonomi</option><option value="premium_economy">Premium ekonomi</option><option value="business">Business</option><option value="first">First</option></select></label>
            <label className="duffel-field"><span>Aktarma</span><select value={aktarma} onChange={(e) => setAktarma(e.target.value)}><option>Tümü</option><option>Aktarmasız</option><option>1 Aktarma</option></select></label>
            <label className="duffel-field"><span>Maks. fiyat</span><input type="number" min="1" step="100" value={maksimumFiyat} onChange={(e) => setMaksimumFiyat(e.target.value)} /></label>
            <button className="duffel-submit">{loading ? "Aranıyor..." : "Fiyatları ara"}</button>
          </form>
        </div>
      </section>

      <section className="duffel-results-section">
        <div className="duffel-container duffel-results-grid">
          <aside className="duffel-sidebar">
            <div className="duffel-filter-box">
              <button className="duffel-alert">🔔 Fiyat uyarısı oluştur</button>
              <h3>Duraklar</h3>
              <label><input type="checkbox" defaultChecked /> Aktarmasız <small>{stopCounts.direct} sonuç</small></label>
              <label><input type="checkbox" defaultChecked /> 1 aktarma <small>{stopCounts.one} sonuç</small></label>
              <label><input type="checkbox" defaultChecked /> 2+ aktarma <small>{stopCounts.multi} sonuç</small></label>
              <h3>Kaynak</h3>
              <p className="duffel-muted">{mode === "travelpayouts" ? "Travelpayouts / Aviasales cache fiyat verisi" : "TRAVELPAYOUTS_TOKEN eklenince son bulunan fiyatlar gelir."}</p>
              <h3>Güven notu</h3>
              <p className="duffel-muted">Bu veriler Travelpayouts / Aviasales tarafındaki son bulunan fiyatlardır. Satın alma öncesi partner sayfasında tekrar doğrulanmalıdır.</p>
            </div>
          </aside>

          <div className="duffel-results-main">
            <div className="duffel-date-strip">
              {[0,1,2,3,4,5].map((offset) => {
                const date = gunEkle(gidis, offset);
                const fakePrice = cheapest ? Math.round(cheapest.price * (1 + offset * 0.035)) : 0;
                return <button key={date} className={offset === 0 ? "active" : ""}><span>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`))}</span><b>{fakePrice ? new Intl.NumberFormat("tr-TR").format(fakePrice) + " TL" : "—"}</b></button>;
              })}
            </div>

            <div className="duffel-results-head">
              <div><span>{getAirportDisplay(nereden)} → {getAirportDisplay(nereye)}</span><h2>{loading ? "Fiyatlar aranıyor..." : `${sorted.length} teklif bulundu`}</h2></div>
              <select value={sirala} onChange={(e) => setSirala(e.target.value)}><option value="best">En iyi</option><option value="cheap">En ucuz</option><option value="fast">En hızlı</option></select>
            </div>

            <div className="duffel-rank-row">
              <button className={sirala === "best" ? "active" : ""} onClick={() => setSirala("best")}><span>En iyi</span><b>{best?.priceText || "—"}</b><small>{best?.durationText || ""}</small></button>
              <button className={sirala === "cheap" ? "active" : ""} onClick={() => setSirala("cheap")}><span>En ucuz</span><b>{cheapest?.priceText || "—"}</b><small>{cheapest?.durationText || ""}</small></button>
              <button className={sirala === "fast" ? "active" : ""} onClick={() => setSirala("fast")}><span>En hızlı</span><b>{fastest?.priceText || "—"}</b><small>{fastest?.durationText || ""}</small></button>
            </div>

            {message && <div className={`duffel-note ${mode === "travelpayouts" ? "live" : "demo"}`}>{message}</div>}
            {error && <div className="duffel-error">{error}</div>}

            <div className="duffel-offer-list">
              {sorted.map((offer) => <OfferCard offer={offer} key={offer.id} />)}
              {!loading && !sorted.length && <div className="duffel-empty"><h3>Sonuç bulunamadı.</h3><p>Tarihi, rota kodunu veya aktarma filtresini değiştir. Travelpayouts tarafında bu rota için son bulunan fiyat olmayabilir.</p></div>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function OfferCard({ offer }: { offer: LiveOffer }) {
  return (
    <article className="duffel-offer-card">
      <div className="duffel-airline">
        <div className="duffel-logo-bubble">✈</div>
        <div><strong>{offer.airline}</strong><small>{offer.provider === "Travelpayouts" ? "Travelpayouts / Aviasales" : "Demo önizleme"}</small></div>
      </div>
      <div className="duffel-itinerary">
        <Leg leg={offer.outbound} />
        {offer.inbound && <Leg leg={offer.inbound} />}
        {offer.emissionsText && <div className="duffel-green">🌱 {offer.emissionsText}</div>}
      </div>
      <div className="duffel-price-panel">
        <button className="duffel-heart">♡</button>
        <strong>{offer.priceText}</strong>
        <small>{offer.stopsText} · {offer.durationText}</small>
        <a className="duffel-offer-btn" href={offer.deepLink || "https://www.aviasales.com"} target="_blank" rel="noreferrer">Teklifleri gör →</a>
        <span>{offer.bagsText}</span>
      </div>
    </article>
  );
}

function Leg({ leg }: { leg: FlightLeg }) {
  return (
    <div className="duffel-leg">
      <div className="duffel-time"><b>{leg.departTime}</b><span>{leg.from}</span></div>
      <div className="duffel-line"><small>{leg.durationText}</small><i /> <em>{leg.segments.length <= 1 ? "Aktarmasız" : `${leg.segments.length - 1} aktarma`}</em></div>
      <div className="duffel-time"><b>{leg.arriveTime}</b><span>{leg.to}</span></div>
    </div>
  );
}

function Header() {
  return <header className="duffel-header"><div className="duffel-container duffel-header-inner"><a href="/" className="duffel-brand"><img src="/logo.png" alt="Letsgo2Travel" /></a><nav><a href="/">Ana sayfa</a><a href="/flights">Fırsatlar</a><a href="/fiyat-kontrolu">Fiyat Kontrolü</a><a href="/arama">Uçuş ara</a></nav><a href="/admin" className="duffel-admin">Admin Panel</a></div></header>;
}
