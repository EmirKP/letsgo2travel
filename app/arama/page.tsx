"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AirportPicker from "@/app/components/AirportPicker";
import { getAirportByCode } from "@/lib/airports";

type Bilet = {
  id: number;
  nereden: string;
  nereye: string;
  ulke: string;
  fiyat: string;
  fiyatSayi: number;
  tarih: string;
  vize: string;
  ay: string;
  havayolu: string;
  sure: string;
  bagaj: string;
  etiket: string;
  link: string;
  aktif: boolean;
  oneCikan: boolean;
  kategori: string;
  aciklama: string;
  ulkeEmoji: string;
  sonKontrol: string;
  kampanyaBitis: string;
  tiklanma: number;
  kalkisKodu: string;
  varisKodu: string;
  aktarma: string;
  saglayici: string;
  aramaPuani: number;
  gidisTarihi: string | null;
  donusTarihi: string | null;
  detaySlug: string;
  gorselUrl: string;
};


const kategoriler = ["Tümü", "Genel", "Avrupa", "Balkan", "Vizesiz", "Hafta Sonu", "Yaz Tatili", "Kış Rotası", "En Ucuz", "Aile Rotası", "Premium"];

function bugun() { return new Date().toISOString().slice(0, 10); }
function gunEkle(value: string, days: number) { const d = value ? new Date(`${value}T12:00:00`) : new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function normalizeCode(value: string | null, fallback: string) {
  if (!value) return fallback;
  const direct = value.trim().toUpperCase();
  const match = value.match(/[A-Z]{2,4}/i);
  const code = match?.[0]?.toUpperCase() || direct;
  return getAirportByCode(code) ? code : fallback;
}
function rotaSinifi(value: string) {
  const metin = value.toLocaleLowerCase("tr-TR");
  if (metin.includes("roma") || metin.includes("italya")) return "roma";
  if (metin.includes("paris") || metin.includes("fransa")) return "paris";
  if (metin.includes("saraybosna") || metin.includes("bosna")) return "saraybosna";
  if (metin.includes("bakü") || metin.includes("baku") || metin.includes("azerbaycan")) return "baku";
  if (metin.includes("dubai")) return "dubai";
  if (metin.includes("antalya") || metin.includes("bodrum") || metin.includes("dalaman")) return "summer";
  return "generic";
}
function gorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return { backgroundImage: `linear-gradient(180deg, rgba(6, 23, 51, 0.04), rgba(6, 23, 51, 0.78)), url(${url})`, backgroundSize: "cover", backgroundPosition: "center" };
}

export default function AramaPage() {
  const [nereden, setNereden] = useState("IST");
  const [nereye, setNereye] = useState("ROM");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(gunEkle(bugun(), 7));
  const [yolcu, setYolcu] = useState("1");
  const [vize, setVize] = useState("Tümü");
  const [kategori, setKategori] = useState("Tümü");
  const [aktarma, setAktarma] = useState("Tümü");
  const [maksimumFiyat, setMaksimumFiyat] = useState("30000");
  const [siralama, setSiralama] = useState("en-iyi");
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [alarmEmail, setAlarmEmail] = useState("");
  const [alarmMaksimumFiyat, setAlarmMaksimumFiyat] = useState("5000");
  const [alarmMesaji, setAlarmMesaji] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const today = bugun();
    const urlGidis = sp.get("gidis") || today;
    const safeGidis = urlGidis < today ? today : urlGidis;
    const urlDonus = sp.get("donus") || gunEkle(safeGidis, 7);
    const safeDonus = urlDonus < safeGidis ? gunEkle(safeGidis, 7) : urlDonus;
    setNereden(normalizeCode(sp.get("nereden"), "IST"));
    setNereye(normalizeCode(sp.get("nereye"), "ROM"));
    setGidis(safeGidis);
    setDonus(safeDonus);
    setYolcu(sp.get("yolcu") || "1");
    setVize(sp.get("vize") || "Tümü");
    setKategori(sp.get("kategori") || "Tümü");
    setAktarma(sp.get("aktarma") || "Tümü");
    setMaksimumFiyat(sp.get("maksimumFiyat") || "30000");
    setSiralama(sp.get("siralama") || "en-iyi");
  }, []);

  useEffect(() => {
    const today = bugun();
    if (gidis < today) setGidis(today);
    if (donus < gidis) setDonus(gunEkle(gidis, 7));
  }, [gidis, donus]);

  const params = useMemo(() => new URLSearchParams({
    nereden, nereye, gidis, donus, yolcu, vize, kategori, aktarma, maksimumFiyat, siralama,
  }), [aktarma, donus, gidis, kategori, maksimumFiyat, nereden, nereye, siralama, vize, yolcu]);

  async function aramaYap(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setYukleniyor(true); setHata("");
    try {
      const response = await fetch(`/api/arama?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Arama yapılamadı.");
      setBiletler(Array.isArray(data.biletler) ? data.biletler : []);
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Bir hata oluştu.");
    } finally { setYukleniyor(false); }
  }

  useEffect(() => { setTimeout(() => aramaYap(), 0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function satinAl(bilet: Bilet) {
    try { await fetch(`/api/admin/biletler/${bilet.id}/click`, { method: "POST" }); } catch {}
    if (bilet.link) window.open(bilet.link, "_blank", "noopener,noreferrer");
  }

  async function alarmKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAlarmMesaji("");
    try {
      const response = await fetch("/api/fiyat-alarmi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: alarmEmail, nereden, nereye, maksimumFiyat: Number(alarmMaksimumFiyat), gidisTarihi: gidis, donusTarihi: donus, yolcu }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Alarm kaydedilemedi.");
      setAlarmMesaji("Fiyat alarmı kaydedildi. Admin panelden takip edebilirsin.");
      setAlarmEmail("");
    } catch (error) { setAlarmMesaji(error instanceof Error ? error.message : "Bir hata oluştu."); }
  }

  const enUcuz = biletler.length ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0] : null;

  return (
    <main className="v13-page light">
      <Header />

      <section className="v13-search-hero">
        <div className="v13-container">
          <span className="v13-pill">🔎 Uçuş arama</span>
          <h1>Rota fırsatlarını temiz filtrelerle bul.</h1>
          <p>Geçmiş tarih seçilemez. Havalimanlarını Skyscanner tarzı arama kutusuyla şehir, ülke veya IATA kodu yazarak seçebilirsin.</p>
        </div>
      </section>

      <section className="v13-section top-tight">
        <div className="v13-container v13-search-layout">
          <form onSubmit={aramaYap} className="v13-filter-panel">
            <h2>Arama bilgileri</h2>
            <AirportPicker label="Nereden" value={nereden} onChange={setNereden} />
            <AirportPicker label="Nereye" value={nereye} onChange={setNereye} />
            <div className="v13-two">
              <label className="v13-field"><span>Gidiş</span><input type="date" value={gidis} min={bugun()} onChange={(e) => setGidis(e.target.value)} /></label>
              <label className="v13-field"><span>Dönüş</span><input type="date" value={donus} min={gidis || bugun()} onChange={(e) => setDonus(e.target.value)} /></label>
            </div>
            <div className="v13-two">
              <label className="v13-field"><span>Yolcu</span><select value={yolcu} onChange={(e) => setYolcu(e.target.value)}><option value="1">1 yolcu</option><option value="2">2 yolcu</option><option value="3">3 yolcu</option><option value="4">4 yolcu</option></select></label>
              <label className="v13-field"><span>Maks. fiyat</span><input value={maksimumFiyat} onChange={(e) => setMaksimumFiyat(e.target.value.replace(/\D/g, ""))} /></label>
            </div>
            <label className="v13-field"><span>Kategori</span><select value={kategori} onChange={(e) => setKategori(e.target.value)}>{kategoriler.map((k) => <option key={k}>{k}</option>)}</select></label>
            <div className="v13-two"><label className="v13-field"><span>Vize</span><select value={vize} onChange={(e) => setVize(e.target.value)}><option>Tümü</option><option>Vizesiz</option><option>Vizeli</option></select></label><label className="v13-field"><span>Aktarma</span><select value={aktarma} onChange={(e) => setAktarma(e.target.value)}><option>Tümü</option><option>Aktarmasız</option><option>1 Aktarma</option></select></label></div>
            <label className="v13-field"><span>Sıralama</span><select value={siralama} onChange={(e) => setSiralama(e.target.value)}><option value="en-iyi">En iyi</option><option value="en-ucuz">En ucuz</option><option value="populer">Popüler</option><option value="en-hizli">En hızlı</option></select></label>
            <button className="v13-search-btn full">{yukleniyor ? "Aranıyor..." : "Fırsatları getir"}</button>
          </form>

          <div className="v13-results-area">
            <div className="v13-results-toolbar"><div><span className="v13-kicker">Sonuçlar</span><h2>{biletler.length} fırsat bulundu</h2></div><div className="v13-result-summary"><span>En ucuz: <b>{enUcuz?.fiyat || "—"}</b></span><a href="/flights">Vitrine dön →</a></div></div>
            {hata && <div className="v13-error">{hata}</div>}
            {yukleniyor && <div className="v13-loading">Sonuçlar yükleniyor...</div>}
            {!yukleniyor && biletler.length === 0 && <div className="v13-empty"><h3>Bu filtrelerle fırsat bulunamadı.</h3><p>Fiyat limitini artır veya kategori/vize filtresini “Tümü” yap.</p></div>}

            <div className="v13-result-list">
              {biletler.map((bilet) => {
                const sinif = rotaSinifi(`${bilet.nereye} ${bilet.ulke} ${bilet.kategori}`);
                const liveParams = new URLSearchParams({ nereden: bilet.kalkisKodu || nereden, nereye: bilet.varisKodu || nereye, gidis, donus, maksimumFiyat });
                return (
                  <article key={bilet.id} className="v13-result-card">
                    <a href={`/ucak-bileti/${bilet.detaySlug}`} className={`v13-result-img v12-route-${sinif}`} style={gorselStyle(bilet.gorselUrl)}><span>{bilet.ulkeEmoji || "✈️"}</span></a>
                    <div className="v13-result-main">
                      <div className="v13-result-top"><div><h3>{bilet.nereden} → {bilet.nereye}</h3><p>{bilet.aciklama || `${bilet.ulke} rotası için fırsat.`}</p></div><strong>{bilet.fiyat}</strong></div>
                      <div className="v13-meta"><span>{bilet.kategori}</span><span>{bilet.vize}</span><span>{bilet.havayolu}</span><span>{bilet.sure}</span><span>{bilet.sonKontrol}</span></div>
                      <div className="v13-card-actions"><button onClick={() => satinAl(bilet)}>Partner fiyatını aç</button><a href={`/fiyat-kontrolu?${liveParams.toString()}`}>Fiyat Kontrolü</a><a href={`/ucak-bileti/${bilet.detaySlug}`}>Detay</a></div>
                    </div>
                  </article>
                );
              })}
            </div>

            <form id="fiyat-alarmi" onSubmit={alarmKaydet} className="v13-alarm-box"><div><span className="v13-kicker">Fiyat alarmı</span><h2>Bu rota için hedef fiyat bırak</h2><p>Uygun fiyat yakalamak istediğin rotayı admin panelden takip edebilirsin.</p></div><input value={alarmEmail} onChange={(e) => setAlarmEmail(e.target.value)} placeholder="E-posta adresin" /><input value={alarmMaksimumFiyat} onChange={(e) => setAlarmMaksimumFiyat(e.target.value.replace(/\D/g, ""))} placeholder="Maksimum fiyat" /><button>Alarm oluştur</button>{alarmMesaji && <small>{alarmMesaji}</small>}</form>
          </div>
        </div>
      </section>
    </main>
  );
}

function Header() {
  return <header className="v13-header"><div className="v13-container v13-header-inner"><a className="v13-brand" href="/"><img src="/logo.png" alt="Letsgo 2 Travel" /></a><nav className="v13-nav"><a href="/">Ana sayfa</a><a href="/flights">Fırsatlar</a><a href="/fiyat-kontrolu">Fiyat Kontrolü</a><a href="/arama">Uçuş ara</a></nav><a className="v13-admin" href="/admin">Admin Panel</a></div></header>;
}
