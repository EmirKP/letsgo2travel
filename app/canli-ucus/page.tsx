"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AirportPicker from "@/app/components/AirportPicker";
import { getAirportByCode } from "@/lib/airports";

type CanliUcus = {
  id: string;
  nereden: string;
  nereye: string;
  kalkisKodu: string;
  varisKodu: string;
  gidisTarihi: string;
  donusTarihi: string;
  fiyat: string;
  fiyatSayi: number;
  aktarma: string;
  havayolu: string;
  sinif: string;
  mesafe: string;
  sonKontrol: string;
  link: string;
  kaynak: string;
};


function bugun() { return new Date().toISOString().slice(0, 10); }
function gunEkle(value: string, days: number) { const d = value ? new Date(`${value}T12:00:00`) : new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function normalizeCode(value: string | null, fallback: string) { const match = value?.match(/[A-Z]{2,4}/i); const code = match?.[0]?.toUpperCase(); return code && getAirportByCode(code) ? code : fallback; }
function fiyatFormat(value: number) { return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`; }

export default function CanliUcusPage() {
  const [nereden, setNereden] = useState("IST");
  const [nereye, setNereye] = useState("ROM");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(gunEkle(bugun(), 7));
  const [maksimumFiyat, setMaksimumFiyat] = useState("30000");
  const [aktarma, setAktarma] = useState("Tümü");
  const [ucuslar, setUcuslar] = useState<CanliUcus[]>([]);
  const [kaynak, setKaynak] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const today = bugun();
    const urlGidis = sp.get("gidis") || today;
    const safeGidis = urlGidis < today ? today : urlGidis;
    const urlDonus = sp.get("donus") || gunEkle(safeGidis, 7);
    setNereden(normalizeCode(sp.get("nereden"), "IST"));
    setNereye(normalizeCode(sp.get("nereye"), "ROM"));
    setGidis(safeGidis);
    setDonus(urlDonus < safeGidis ? gunEkle(safeGidis, 7) : urlDonus);
    setMaksimumFiyat(sp.get("maksimumFiyat") || "30000");
    setAktarma(sp.get("aktarma") || "Tümü");
  }, []);

  useEffect(() => {
    const today = bugun();
    if (gidis < today) setGidis(today);
    if (donus < gidis) setDonus(gunEkle(gidis, 7));
  }, [gidis, donus]);

  const params = useMemo(() => new URLSearchParams({ nereden, nereye, gidis, donus, maksimumFiyat, aktarma }), [nereden, nereye, gidis, donus, maksimumFiyat, aktarma]);

  async function sorgula(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setYukleniyor(true); setHata(""); setKaynak("");
    try {
      const response = await fetch(`/api/canli-ucuslar?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Canlı uçuşlar alınamadı.");
      setUcuslar(Array.isArray(data.ucuslar) ? data.ucuslar : []);
      setKaynak(data.kaynak || "");
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Bir hata oluştu.");
      setUcuslar([]);
    } finally { setYukleniyor(false); }
  }

  useEffect(() => { setTimeout(() => sorgula(), 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const enUcuz = ucuslar.length ? [...ucuslar].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0] : null;

  return (
    <main className="v13-page light">
      <Header />
      <section className="v13-search-hero live">
        <div className="v13-container v13-live-hero-grid">
          <div>
            <span className="v13-pill">📡 Canlı uçuş kontrolü</span>
            <h1>Rota gir, partner cache fiyatlarını kontrol et.</h1>
            <p>Travelpayouts token bağlıysa gerçek cache sonuçları gelir. Token yoksa sayfa boş kalmaz; sistem örnek akışla arayüzü gösterir.</p>
          </div>
          <div className="v13-live-summary"><span>En düşük sonuç</span><strong>{enUcuz?.fiyat || "—"}</strong><small>{kaynak || "Sorgu hazır"}</small></div>
        </div>
      </section>

      <section className="v13-section top-tight">
        <div className="v13-container v13-live-layout">
          <form className="v13-filter-panel" onSubmit={sorgula}>
            <h2>Canlı sorgu</h2>
            <AirportPicker label="Nereden" value={nereden} onChange={setNereden} />
            <AirportPicker label="Nereye" value={nereye} onChange={setNereye} />
            <div className="v13-two"><label className="v13-field"><span>Gidiş</span><input type="date" min={bugun()} value={gidis} onChange={(e) => setGidis(e.target.value)} /></label><label className="v13-field"><span>Dönüş</span><input type="date" min={gidis || bugun()} value={donus} onChange={(e) => setDonus(e.target.value)} /></label></div>
            <label className="v13-field"><span>Maksimum fiyat</span><input value={maksimumFiyat} onChange={(e) => setMaksimumFiyat(e.target.value.replace(/\D/g, ""))} /></label>
            <label className="v13-field"><span>Aktarma</span><select value={aktarma} onChange={(e) => setAktarma(e.target.value)}><option>Tümü</option><option>Aktarmasız</option><option>1 Aktarma</option></select></label>
            <button className="v13-search-btn full">{yukleniyor ? "Kontrol ediliyor..." : "Canlı uçuşları getir"}</button>
            <p className="v13-panel-note">Fiyatlar cache veridir. Satın almadan önce partner sayfasında son kontrol yapılmalıdır.</p>
          </form>

          <div className="v13-results-area">
            <div className="v13-results-toolbar"><div><span className="v13-kicker">Canlı sonuçlar</span><h2>{ucuslar.length} uçuş bulundu</h2></div><a className="v13-link" href="/arama">Normal aramaya dön →</a></div>
            {hata && <div className="v13-error">{hata}</div>}
            {kaynak && <div className="v13-source-note">{kaynak}</div>}
            {yukleniyor && <div className="v13-loading">Canlı uçuşlar yükleniyor...</div>}
            {!yukleniyor && ucuslar.length === 0 && <div className="v13-empty"><h3>Sonuç çıkmadı.</h3><p>Rota kodlarını veya fiyat limitini değiştir. Travelpayouts token yoksa Vercel Environment Variables alanına ekle.</p></div>}

            <div className="v13-live-list">
              {ucuslar.map((ucus) => (
                <article className="v13-live-card" key={ucus.id}>
                  <div className="v13-live-route"><span>✈️</span><div><h3>{ucus.nereden} → {ucus.nereye}</h3><p>{ucus.gidisTarihi || gidis} {ucus.donusTarihi ? `· Dönüş ${ucus.donusTarihi}` : ""}</p></div></div>
                  <div className="v13-meta"><span>{ucus.aktarma}</span><span>{ucus.havayolu}</span><span>{ucus.sinif}</span><span>{ucus.sonKontrol}</span></div>
                  <div className="v13-live-price"><strong>{ucus.fiyat || fiyatFormat(ucus.fiyatSayi)}</strong><a href={ucus.link || `/arama?${params.toString()}`}>Detay / kontrol</a></div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Header() {
  return <header className="v13-header"><div className="v13-container v13-header-inner"><a className="v13-brand" href="/"><img src="/logo.png" alt="Letsgo 2 Travel" /></a><nav className="v13-nav"><a href="/">Ana sayfa</a><a href="/flights">Fırsatlar</a><a href="/canli-ucus">Canlı uçuşlar</a><a href="/arama">Uçuş ara</a></nav><a className="v13-admin" href="/admin">Admin Panel</a></div></header>;
}
