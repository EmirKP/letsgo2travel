"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

const havalimaniSecenekleri = ["İstanbul (IST)", "İstanbul (SAW)", "Ankara (ESB)", "İzmir (ADB)", "Antalya (AYT)", "Roma (ROM)", "Paris (PAR)", "Saraybosna (SJJ)", "Bakü (GYD)", "Dubai (DXB)", "Amsterdam (AMS)", "Berlin (BER)"];
const kategoriler = ["Tümü", "Genel", "Avrupa", "Balkan", "Vizesiz", "Hafta Sonu", "Yaz Tatili", "Kış Rotası", "En Ucuz", "Aile Rotası", "Premium"];

function bugun() { return new Date().toISOString().slice(0, 10); }
function birHaftaSonra() { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
function aramaDegeriTemizle(value: string) { const kod = value.match(/\(([A-Z]{3})\)/); return kod?.[1] || value.trim(); }
function rotaSinifi(value: string) {
  const metin = value.toLocaleLowerCase("tr-TR");
  if (metin.includes("roma") || metin.includes("italya")) return "roma";
  if (metin.includes("paris") || metin.includes("fransa")) return "paris";
  if (metin.includes("saraybosna") || metin.includes("bosna")) return "saraybosna";
  if (metin.includes("bakü") || metin.includes("baku") || metin.includes("azerbaycan")) return "baku";
  if (metin.includes("dubai")) return "dubai";
  return "generic";
}
function gorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return { backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.78)), url(${url})`, backgroundSize: "cover", backgroundPosition: "center" };
}
function fiyatYaz(value: number) { return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`; }

export default function AramaPage() {
  const [nereden, setNereden] = useState("İstanbul (IST)");
  const [nereye, setNereye] = useState("Roma (ROM)");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(birHaftaSonra());
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

  const params = useMemo(() => new URLSearchParams({
    nereden: aramaDegeriTemizle(nereden), nereye: aramaDegeriTemizle(nereye), gidis, donus, yolcu, vize, kategori, aktarma, maksimumFiyat, siralama,
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

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setNereden(sp.get("nereden") || "İstanbul (IST)");
    setNereye(sp.get("nereye") || "Roma (ROM)");
    setGidis(sp.get("gidis") || bugun());
    setDonus(sp.get("donus") || birHaftaSonra());
    setYolcu(sp.get("yolcu") || "1");
    setVize(sp.get("vize") || "Tümü");
    setKategori(sp.get("kategori") || "Tümü");
    setAktarma(sp.get("aktarma") || "Tümü");
    setMaksimumFiyat(sp.get("maksimumFiyat") || "30000");
    setSiralama(sp.get("siralama") || "en-iyi");
    setTimeout(() => aramaYap(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function satinAl(bilet: Bilet) {
    try { await fetch(`/api/admin/biletler/${bilet.id}/click`, { method: "POST" }); } catch {}
    window.open(bilet.link, "_blank", "noopener,noreferrer");
  }

  async function alarmKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAlarmMesaji("");
    try {
      const response = await fetch("/api/fiyat-alarmi", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: alarmEmail, nereden: aramaDegeriTemizle(nereden), nereye: aramaDegeriTemizle(nereye), maksimumFiyat: Number(alarmMaksimumFiyat), gidisTarihi: gidis, donusTarihi: donus, yolcu }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Alarm kaydedilemedi.");
      setAlarmMesaji("Fiyat alarmı kaydedildi. Admin panelden takip edebilirsin.");
      setAlarmEmail("");
    } catch (error) { setAlarmMesaji(error instanceof Error ? error.message : "Bir hata oluştu."); }
  }

  const enUcuz = biletler.length ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0] : null;

  return (
    <main className="l2t-v12-page">
      <header className="v12-header"><div className="v12-container v12-header-inner"><a href="/" className="v12-brand"><img src="/logo.png" alt="Letsgo 2 Travel" /></a><nav className="v12-nav"><a href="/">Ana sayfa</a><a href="/flights">Fırsatlar</a><a href="/admin">Admin</a></nav><span>🌐 TR</span></div></header>

      <section className="v12-subhero search"><div className="v12-container v12-subhero-grid"><div><span className="v12-pill">🔎 Akıllı rota arama</span><h1>Uçuş fırsatlarını filtrele, karşılaştır ve kontrol et.</h1><p>Admin panelde eklenen aktif fırsatlar, arama kriterlerine göre burada listelenir.</p><div className="v12-proof-row"><span><b>{biletler.length}</b> sonuç</span><span><b>{enUcuz?.fiyat || "—"}</b> en ucuz</span><span><b>{maksimumFiyat} TL</b> üst limit</span></div></div><div className="v12-subhero-card"><strong>Güven notu</strong><span>Letsgo 2 Travel bilgilendirme ve yönlendirme platformudur. Son fiyatı partner sayfasında doğrula.</span></div></div></section>

      <section className="v12-section"><div className="v12-container v12-search-page-grid">
        <form onSubmit={aramaYap} className="v12-filter-panel">
          <h2>Arama bilgileri</h2>
          <label><span>Nereden</span><input value={nereden} onChange={(e) => setNereden(e.target.value)} list="airports" /></label>
          <label><span>Nereye</span><input value={nereye} onChange={(e) => setNereye(e.target.value)} list="airports" /></label>
          <div className="v12-two"><label><span>Gidiş</span><input type="date" value={gidis} onChange={(e) => setGidis(e.target.value)} /></label><label><span>Dönüş</span><input type="date" value={donus} onChange={(e) => setDonus(e.target.value)} /></label></div>
          <div className="v12-two"><label><span>Yolcu</span><select value={yolcu} onChange={(e) => setYolcu(e.target.value)}><option value="1">1 yolcu</option><option value="2">2 yolcu</option><option value="3">3 yolcu</option></select></label><label><span>Maks. fiyat</span><input value={maksimumFiyat} onChange={(e) => setMaksimumFiyat(e.target.value)} /></label></div>
          <label><span>Kategori</span><select value={kategori} onChange={(e) => setKategori(e.target.value)}>{kategoriler.map((k) => <option key={k}>{k}</option>)}</select></label>
          <div className="v12-two"><label><span>Vize</span><select value={vize} onChange={(e) => setVize(e.target.value)}><option>Tümü</option><option>Vizesiz</option><option>Vizeli</option></select></label><label><span>Aktarma</span><select value={aktarma} onChange={(e) => setAktarma(e.target.value)}><option>Tümü</option><option>Aktarmasız</option><option>1 Aktarma</option></select></label></div>
          <label><span>Sıralama</span><select value={siralama} onChange={(e) => setSiralama(e.target.value)}><option value="en-iyi">En iyi</option><option value="en-ucuz">En ucuz</option><option value="populer">Popüler</option><option value="en-hizli">En hızlı</option></select></label>
          <button>{yukleniyor ? "Aranıyor..." : "Fırsatları getir"}</button>
          <datalist id="airports">{havalimaniSecenekleri.map((item) => <option key={item} value={item} />)}</datalist>
        </form>

        <div className="v12-results-area">
          {hata && <div className="v12-error">{hata}</div>}
          <div className="v12-results-head"><div><span className="v12-kicker">Arama sonuçları</span><h2>{biletler.length} fırsat bulundu</h2></div><a href="/flights" className="v12-text-link">Vitrine dön →</a></div>
          {yukleniyor && <div className="v12-loading">Sonuçlar yükleniyor...</div>}
          <div className="v12-result-list">
            {biletler.map((bilet) => {
              const sinif = rotaSinifi(`${bilet.nereye} ${bilet.ulke} ${bilet.kategori}`);
              return <article key={bilet.id} className="v12-result-card"><a href={`/ucak-bileti/${bilet.detaySlug}`} className={`v12-result-img v12-route-${sinif}`} style={gorselStyle(bilet.gorselUrl)}><span>{bilet.ulkeEmoji}</span></a><div className="v12-result-body"><div className="v12-result-title"><h3>{bilet.nereden} → {bilet.nereye}</h3><b>{bilet.fiyat}</b></div><p>{bilet.aciklama || `${bilet.ulke} rotası için fırsat.`}</p><div className="v12-deal-meta"><span>{bilet.kategori}</span><span>{bilet.vize}</span><span>{bilet.havayolu}</span><span>{bilet.sure}</span><span>{bilet.sonKontrol}</span></div><div className="v12-deal-actions"><button onClick={() => satinAl(bilet)}>Son fiyatı kontrol et</button><a href={`/ucak-bileti/${bilet.detaySlug}`}>Detay sayfası</a></div></div></article>;
            })}
          </div>

          <form id="fiyat-alarmi" onSubmit={alarmKaydet} className="v12-alarm-box"><div><span className="v12-kicker">Fiyat alarmı</span><h2>Bu rota için hedef fiyat bırak</h2><p>Uygun fiyat yakalamak istediğin rotayı admin panelden takip edebilirsin.</p></div><input value={alarmEmail} onChange={(e) => setAlarmEmail(e.target.value)} placeholder="E-posta adresin" /><input value={alarmMaksimumFiyat} onChange={(e) => setAlarmMaksimumFiyat(e.target.value)} placeholder="Maksimum fiyat" /><button>Alarm oluştur</button>{alarmMesaji && <small>{alarmMesaji}</small>}</form>
        </div>
      </div></section>
    </main>
  );
}
