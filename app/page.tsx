"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Firsat = {
  id?: number;
  nereden: string;
  nereye: string;
  ulke?: string;
  fiyat: string;
  fiyatSayi?: number;
  tarih?: string;
  vize?: string;
  ay?: string;
  havayolu?: string;
  sure?: string;
  bagaj?: string;
  etiket?: string;
  kategori?: string;
  aciklama?: string;
  ulkeEmoji?: string;
  sonKontrol?: string;
  kampanyaBitis?: string;
  tiklanma?: number;
  kalkisKodu?: string;
  varisKodu?: string;
  aktarma?: string;
  saglayici?: string;
  detaySlug?: string;
  gorselUrl?: string;
  oneCikan?: boolean;
};

type Airport = {
  code: string;
  city: string;
  name: string;
  country: string;
};

const airports: Airport[] = [
  { code: "IST", city: "İstanbul", name: "İstanbul Havalimanı", country: "Türkiye" },
  { code: "SAW", city: "İstanbul", name: "Sabiha Gökçen", country: "Türkiye" },
  { code: "ESB", city: "Ankara", name: "Esenboğa", country: "Türkiye" },
  { code: "ADB", city: "İzmir", name: "Adnan Menderes", country: "Türkiye" },
  { code: "AYT", city: "Antalya", name: "Antalya Havalimanı", country: "Türkiye" },
  { code: "ROM", city: "Roma", name: "Tüm Havalimanları", country: "İtalya" },
  { code: "PAR", city: "Paris", name: "Tüm Havalimanları", country: "Fransa" },
  { code: "SJJ", city: "Saraybosna", name: "Sarajevo", country: "Bosna Hersek" },
  { code: "GYD", city: "Bakü", name: "Haydar Aliyev", country: "Azerbaycan" },
  { code: "DXB", city: "Dubai", name: "Dubai Havalimanı", country: "BAE" },
  { code: "AMS", city: "Amsterdam", name: "Schiphol", country: "Hollanda" },
  { code: "BER", city: "Berlin", name: "Brandenburg", country: "Almanya" },
  { code: "PRG", city: "Prag", name: "Václav Havel", country: "Çekya" },
  { code: "VIE", city: "Viyana", name: "Vienna Intl.", country: "Avusturya" },
  { code: "BCN", city: "Barselona", name: "El Prat", country: "İspanya" },
];

const fallbackFirsatlar: Firsat[] = [
  {
    id: 1,
    nereden: "İstanbul",
    nereye: "Roma",
    ulke: "İtalya",
    fiyat: "2.499 TL",
    fiyatSayi: 2499,
    kategori: "Avrupa",
    vize: "Vizeli",
    ay: "Haziran",
    havayolu: "Partner",
    sure: "2 sa 35 dk",
    bagaj: "Kabin bagajı",
    aciklama: "Kısa Avrupa tatili planlayanlar için şehir kaçamağı fırsatı.",
    ulkeEmoji: "🇮🇹",
    sonKontrol: "Bugün",
    detaySlug: "istanbul-roma",
    kalkisKodu: "IST",
    varisKodu: "ROM",
    oneCikan: true,
  },
  {
    id: 2,
    nereden: "İstanbul",
    nereye: "Saraybosna",
    ulke: "Bosna Hersek",
    fiyat: "1.899 TL",
    fiyatSayi: 1899,
    kategori: "Vizesiz",
    vize: "Vizesiz",
    ay: "Haziran",
    havayolu: "Partner",
    sure: "1 sa 55 dk",
    bagaj: "Kabin bagajı",
    aciklama: "Pasaportla kolay seyahat edilebilen ekonomik Balkan rotası.",
    ulkeEmoji: "🇧🇦",
    sonKontrol: "Bugün",
    detaySlug: "istanbul-saraybosna",
    kalkisKodu: "IST",
    varisKodu: "SJJ",
    oneCikan: true,
  },
  {
    id: 3,
    nereden: "Ankara",
    nereye: "Bakü",
    ulke: "Azerbaycan",
    fiyat: "2.199 TL",
    fiyatSayi: 2199,
    kategori: "Vizesiz",
    vize: "Vizesiz",
    ay: "Temmuz",
    havayolu: "Partner",
    sure: "2 sa 20 dk",
    bagaj: "Kabin bagajı",
    aciklama: "Kısa uçuş ve kültürel yakınlıkla öne çıkan rota.",
    ulkeEmoji: "🇦🇿",
    sonKontrol: "Bugün",
    detaySlug: "ankara-baku",
    kalkisKodu: "ESB",
    varisKodu: "GYD",
  },
];

const kategoriKartlari = [
  { baslik: "Avrupa kaçamakları", metin: "Roma, Paris, Prag ve Viyana gibi kısa şehir tatilleri.", ikon: "🌍", link: "/flights?kategori=Avrupa" },
  { baslik: "Vizesiz rotalar", metin: "Balkanlar ve Kafkasya için pasaportla kolay seyahat.", ikon: "🛂", link: "/flights?kategori=Vizesiz" },
  { baslik: "Hafta sonu", metin: "2-3 günlük hızlı kaçamaklar için kompakt rota fikirleri.", ikon: "🧳", link: "/flights?kategori=Hafta Sonu" },
  { baslik: "Canlı kontrol", metin: "Rota gir, Travelpayouts/Aviasales cache fiyatını sorgula.", ikon: "📡", link: "/canli-ucus" },
];

function bugun() {
  return new Date().toISOString().slice(0, 10);
}

function gunEkle(value: string, days: number) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function airportLabel(code: string) {
  const item = airports.find((airport) => airport.code === code);
  return item ? `${item.city} (${item.code})` : code;
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
  return {
    backgroundImage: `linear-gradient(180deg, rgba(6, 23, 51, 0.06), rgba(6, 23, 51, 0.76)), url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

function detayLink(firsat: Firsat) {
  return firsat.detaySlug ? `/ucak-bileti/${firsat.detaySlug}` : "/flights";
}

function rotaAramaLinki(firsat: Firsat) {
  const params = new URLSearchParams({
    nereden: firsat.kalkisKodu || "IST",
    nereye: firsat.varisKodu || "ROM",
    gidis: bugun(),
    donus: gunEkle(bugun(), 7),
    yolcu: "1",
    maksimumFiyat: "30000",
    siralama: "en-iyi",
    vize: "Tümü",
    kategori: "Tümü",
    aktarma: "Tümü",
  });
  return `/arama?${params.toString()}`;
}

export default function HomePage() {
  const [from, setFrom] = useState("IST");
  const [to, setTo] = useState("ROM");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(gunEkle(bugun(), 14));
  const [yolcu, setYolcu] = useState("1");
  const [firsatlar, setFirsatlar] = useState<Firsat[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let aktif = true;
    async function yukle() {
      try {
        const response = await fetch("/api/firsatlar", { cache: "no-store" });
        const data = await response.json();
        if (aktif) setFirsatlar(Array.isArray(data.firsatlar) ? data.firsatlar : []);
      } catch {
        if (aktif) setFirsatlar([]);
      } finally {
        if (aktif) setYukleniyor(false);
      }
    }
    yukle();
    return () => { aktif = false; };
  }, []);

  useEffect(() => {
    const today = bugun();
    if (gidis < today) setGidis(today);
    if (donus < gidis) setDonus(gunEkle(gidis, 7));
  }, [gidis, donus]);

  const vitrindekiFirsatlar = firsatlar.length ? firsatlar.slice(0, 6) : fallbackFirsatlar;
  const enUcuz = [...vitrindekiFirsatlar].sort((a, b) => (a.fiyatSayi || 999999) - (b.fiyatSayi || 999999))[0];

  const aramaLinki = useMemo(() => {
    const params = new URLSearchParams({
      nereden: from,
      nereye: to,
      gidis,
      donus,
      yolcu,
      maksimumFiyat: "30000",
      siralama: "en-iyi",
      vize: "Tümü",
      kategori: "Tümü",
      aktarma: "Tümü",
    });
    return `/arama?${params.toString()}`;
  }, [from, to, gidis, donus, yolcu]);

  function aramaYap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = aramaLinki;
  }

  return (
    <main className="v13-page">
      <Header />

      <section className="v13-hero">
        <div className="v13-container v13-hero-grid">
          <div className="v13-hero-copy">
            <span className="v13-pill">✈️ Uçuş fırsat platformu</span>
            <h1>Ucuz uçak bileti fırsatlarını daha akıllı keşfet.</h1>
            <p>
              Letsgo 2 Travel; rota fırsatlarını, fiyat alarmını ve canlı partner kontrolünü tek ekranda toparlayan seyahat fırsat platformudur.
            </p>
            <div className="v13-hero-actions">
              <a href="#arama" className="v13-btn yellow">Hemen uçuş ara</a>
              <a href="/canli-ucus" className="v13-btn ghost">Canlı fiyat kontrolü</a>
            </div>
          </div>

          <div className="v13-hero-card">
            <div className="v13-plane-visual">
              <div className="v13-floating-card top"><small>Bugünün odağı</small><strong>{enUcuz?.nereden || "İstanbul"} → {enUcuz?.nereye || "Roma"}</strong></div>
              <div className="v13-floating-card bottom"><small>Başlayan fiyat</small><strong>{enUcuz?.fiyat || "2.499 TL"}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section id="arama" className="v13-search-shell">
        <div className="v13-container">
          <form className="v13-search-box" onSubmit={aramaYap}>
            <AirportSelect label="Nereden" value={from} onChange={setFrom} />
            <AirportSelect label="Nereye" value={to} onChange={setTo} />
            <label className="v13-field compact">
              <span>Gidiş</span>
              <input type="date" value={gidis} min={bugun()} onChange={(e) => setGidis(e.target.value)} />
            </label>
            <label className="v13-field compact">
              <span>Dönüş</span>
              <input type="date" value={donus} min={gidis || bugun()} onChange={(e) => setDonus(e.target.value)} />
            </label>
            <label className="v13-field compact">
              <span>Yolcu</span>
              <select value={yolcu} onChange={(e) => setYolcu(e.target.value)}>
                <option value="1">1 yolcu</option>
                <option value="2">2 yolcu</option>
                <option value="3">3 yolcu</option>
                <option value="4">4 yolcu</option>
              </select>
            </label>
            <button className="v13-search-btn">Fırsat ara →</button>
          </form>
        </div>
      </section>

      <section className="v13-section">
        <div className="v13-container v13-stats-grid">
          <Stat title="Yayındaki fırsat" value={yukleniyor ? "—" : String(vitrindekiFirsatlar.length)} />
          <Stat title="En düşük fiyat" value={enUcuz?.fiyat || "—"} />
          <Stat title="Canlı kontrol" value="API + partner" />
          <Stat title="Fiyat alarmı" value="Takip sistemi" />
        </div>
      </section>

      <section className="v13-section" id="firsatlar">
        <div className="v13-container">
          <div className="v13-section-head">
            <div>
              <span className="v13-kicker">Vitrin</span>
              <h2>Öne çıkan uçuş fırsatları</h2>
              <p>{yukleniyor ? "Fırsatlar yükleniyor..." : "Admin panelden eklenen aktif rotalar burada daha temiz kartlarla görünür."}</p>
            </div>
            <a href="/flights" className="v13-link">Tüm fırsatları gör →</a>
          </div>

          <div className="v13-deal-grid">
            {vitrindekiFirsatlar.map((firsat) => {
              const sinif = rotaSinifi(`${firsat.nereye} ${firsat.ulke} ${firsat.kategori}`);
              return (
                <article className="v13-deal-card" key={firsat.id || `${firsat.nereden}-${firsat.nereye}`}>
                  <a href={detayLink(firsat)} className={`v13-deal-image v12-route-${sinif}`} style={gorselStyle(firsat.gorselUrl)}>
                    <span>{firsat.ulkeEmoji || "✈️"} {firsat.kategori || "Fırsat"}</span>
                    {firsat.oneCikan && <em>Öne çıkan</em>}
                  </a>
                  <div className="v13-deal-content">
                    <div className="v13-deal-title"><h3>{firsat.nereden} → {firsat.nereye}</h3><b>{firsat.fiyat}</b></div>
                    <p>{firsat.aciklama || `${firsat.ulke || firsat.nereye} rotası için güncel uçuş fırsatı.`}</p>
                    <div className="v13-meta"><span>{firsat.ay || "Sezon"}</span><span>{firsat.vize || "Vize durumu"}</span><span>{firsat.sonKontrol || "Bugün"}</span></div>
                    <div className="v13-card-actions"><a href={rotaAramaLinki(firsat)}>Aramada aç</a><a href={`/canli-ucus?nereden=${firsat.kalkisKodu || "IST"}&nereye=${firsat.varisKodu || "ROM"}&gidis=${bugun()}&donus=${gunEkle(bugun(), 7)}&maksimumFiyat=30000`}>Canlı kontrol</a></div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="v13-section soft">
        <div className="v13-container">
          <div className="v13-section-head centered">
            <span className="v13-kicker">Keşfet</span>
            <h2>Rota bulmayı kolaylaştıran alanlar</h2>
            <p>Site sadece liste göstermesin; kullanıcıya ne arayacağını da anlatsın.</p>
          </div>
          <div className="v13-category-grid">
            {kategoriKartlari.map((item) => (
              <a href={item.link} className="v13-category-card" key={item.baslik}>
                <span>{item.ikon}</span>
                <strong>{item.baslik}</strong>
                <small>{item.metin}</small>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="v13-section">
        <div className="v13-container v13-info-band">
          <div>
            <span className="v13-kicker">Güven notu</span>
            <h2>Bilet satışı partner/havayolu tarafında tamamlanır.</h2>
            <p>Letsgo 2 Travel fiyatları ve rotaları bilgilendirme amacıyla listeler. Satın almadan önce son fiyatı, bagajı ve müsaitliği partner sayfasında kontrol etmek gerekir.</p>
          </div>
          <a href="/arama" className="v13-btn dark">Fırsat ara →</a>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="v13-header">
      <div className="v13-container v13-header-inner">
        <a className="v13-brand" href="/"><img src="/logo.png" alt="Letsgo 2 Travel" /></a>
        <nav className="v13-nav">
          <a href="/">Ana sayfa</a>
          <a href="/flights">Fırsatlar</a>
          <a href="/canli-ucus">Canlı uçuşlar</a>
          <a href="/arama">Uçuş ara</a>
        </nav>
        <a className="v13-admin" href="/admin">Admin Panel</a>
      </div>
    </header>
  );
}

function AirportSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const selected = airports.find((item) => item.code === value);
  return (
    <label className="v13-field airport">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {airports.map((airport) => (
          <option key={airport.code} value={airport.code}>{airport.city} ({airport.code}) - {airport.name}</option>
        ))}
      </select>
      <small>{selected ? `${selected.name} · ${selected.country}` : airportLabel(value)}</small>
    </label>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return <div className="v13-stat-card"><span>{title}</span><strong>{value}</strong></div>;
}

function Footer() {
  return (
    <footer className="v13-footer">
      <div className="v13-container v13-footer-grid">
        <div><img src="/logo.png" alt="Letsgo 2 Travel" /><p>Ucuz uçuş fırsatları, rota kartları, fiyat alarmı ve canlı partner kontrolü.</p></div>
        <div><h4>Site</h4><a href="/arama">Uçuş ara</a><a href="/flights">Fırsatlar</a><a href="/canli-ucus">Canlı uçuşlar</a></div>
        <div><h4>Popüler</h4><a href="/flights?kategori=Avrupa">Avrupa</a><a href="/flights?kategori=Vizesiz">Vizesiz</a><a href="/flights?kategori=En Ucuz">En ucuz</a></div>
        <div><h4>Not</h4><p>Fiyatlar değişebilir. Son fiyat satın alma sayfasında kontrol edilmelidir.</p></div>
      </div>
    </footer>
  );
}
