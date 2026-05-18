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
  aramaPuani?: number;
  detaySlug?: string;
  gorselUrl?: string;
  oneCikan?: boolean;
};

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
    etiket: "Şehir kaçamağı",
    aciklama: "Roma, kısa Avrupa tatili planlayanlar için güçlü bir rota.",
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
    etiket: "Balkan rotası",
    aciklama: "Pasaportla kolay seyahat edilebilen ekonomik Balkan seçeneği.",
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
    kategori: "Yakın rota",
    vize: "Vizesiz",
    ay: "Temmuz",
    havayolu: "Partner",
    sure: "2 sa 20 dk",
    bagaj: "Kabin bagajı",
    etiket: "Kardeş ülke",
    aciklama: "Kısa uçuş ve kültürel yakınlıkla öne çıkan rota.",
    ulkeEmoji: "🇦🇿",
    sonKontrol: "Bugün",
    detaySlug: "ankara-baku",
    kalkisKodu: "ESB",
    varisKodu: "GYD",
  },
  {
    id: 4,
    nereden: "İstanbul",
    nereye: "Dubai",
    ulke: "BAE",
    fiyat: "4.999 TL",
    fiyatSayi: 4999,
    kategori: "Popüler",
    vize: "Vizeli",
    ay: "Eylül",
    havayolu: "Partner",
    sure: "4 sa 25 dk",
    bagaj: "Kabin bagajı",
    etiket: "Lüks şehir",
    aciklama: "Şehir tatili ve aktarmalı uçuş kombinasyonları için popüler.",
    ulkeEmoji: "🇦🇪",
    sonKontrol: "Bugün",
    detaySlug: "istanbul-dubai",
    kalkisKodu: "IST",
    varisKodu: "DXB",
  },
];

const havalimaniSecenekleri = [
  "İstanbul (IST) - İstanbul Havalimanı",
  "İstanbul (SAW) - Sabiha Gökçen Havalimanı",
  "Ankara (ESB) - Esenboğa Havalimanı",
  "İzmir (ADB) - Adnan Menderes Havalimanı",
  "Antalya (AYT) - Antalya Havalimanı",
  "Roma (ROM) - Tüm Havalimanları",
  "Paris (PAR) - Tüm Havalimanları",
  "Saraybosna (SJJ) - Sarajevo Havalimanı",
  "Bakü (GYD) - Haydar Aliyev Havalimanı",
  "Dubai (DXB) - Dubai Havalimanı",
  "Amsterdam (AMS) - Schiphol Havalimanı",
  "Berlin (BER) - Berlin Brandenburg Havalimanı",
  "Prag (PRG) - Václav Havel Havalimanı",
  "Viyana (VIE) - Vienna Havalimanı",
  "Barselona (BCN) - El Prat Havalimanı",
];

const rotaKategorileri = [
  { ikon: "🌍", baslik: "Avrupa kaçamakları", metin: "Roma, Paris, Prag ve Viyana gibi şehir tatilleri.", link: "/flights?kategori=Avrupa" },
  { ikon: "🛂", baslik: "Vizesiz rotalar", metin: "Balkanlar, Kafkasya ve pasaportla gidilebilen yakın rotalar.", link: "/flights?kategori=Vizesiz" },
  { ikon: "🏖️", baslik: "Yaz tatili", metin: "Deniz, güneş ve kısa tatil planları için sezonluk fırsatlar.", link: "/flights?kategori=Yaz Tatili" },
  { ikon: "💸", baslik: "En ucuz fırsatlar", metin: "Bütçe odaklı kullanıcılar için düşük fiyatlı uçuşlar.", link: "/flights?kategori=En Ucuz" },
];

function bugun() {
  return new Date().toISOString().slice(0, 10);
}

function ikiHaftaSonra() {
  const tarih = new Date();
  tarih.setDate(tarih.getDate() + 14);
  return tarih.toISOString().slice(0, 10);
}

function aramaDegeriTemizle(value: string) {
  const kod = value.match(/\(([A-Z]{3})\)/);
  if (kod?.[1]) return kod[1];
  return value.trim();
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
    backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0.74)), url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

function slugLink(firsat: Firsat) {
  return firsat.detaySlug ? `/ucak-bileti/${firsat.detaySlug}` : "/arama";
}

export default function HomePage() {
  const [nereden, setNereden] = useState("İstanbul (IST) - İstanbul Havalimanı");
  const [nereye, setNereye] = useState("Roma (ROM) - Tüm Havalimanları");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(ikiHaftaSonra());
  const [yolcu, setYolcu] = useState("1");
  const [firsatlar, setFirsatlar] = useState<Firsat[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let aktif = true;
    async function yukle() {
      try {
        const response = await fetch("/api/firsatlar", { cache: "no-store" });
        const data = await response.json();
        if (!aktif) return;
        setFirsatlar(Array.isArray(data.firsatlar) ? data.firsatlar : []);
      } catch {
        if (aktif) setFirsatlar([]);
      } finally {
        if (aktif) setYukleniyor(false);
      }
    }
    yukle();
    return () => {
      aktif = false;
    };
  }, []);

  const vitrindekiFirsatlar = firsatlar.length ? firsatlar.slice(0, 8) : fallbackFirsatlar;
  const enUcuz = [...vitrindekiFirsatlar].sort((a, b) => (a.fiyatSayi || 999999) - (b.fiyatSayi || 999999))[0];
  const vizesizSayisi = vitrindekiFirsatlar.filter((item) => item.vize === "Vizesiz" || item.kategori === "Vizesiz").length;

  const aramaLinki = useMemo(() => {
    const params = new URLSearchParams({
      nereden: aramaDegeriTemizle(nereden),
      nereye: aramaDegeriTemizle(nereye),
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
  }, [nereden, nereye, gidis, donus, yolcu]);

  function aramaYap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = aramaLinki;
  }

  function rotaAramaLinki(firsat: Firsat) {
    const params = new URLSearchParams({
      nereden: firsat.kalkisKodu || firsat.nereden,
      nereye: firsat.varisKodu || firsat.nereye,
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
  }

  return (
    <main className="l2t-v12-page">
      <header className="v12-header">
        <div className="v12-container v12-header-inner">
          <a href="/" className="v12-brand" aria-label="Letsgo 2 Travel ana sayfa">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
          </a>
          <nav className="v12-nav" aria-label="Ana menü">
            <a href="/arama">Uçuş Ara</a>
            <a href="/flights">Fırsatlar</a>
            <a href="#nasil-calisir">Nasıl çalışır?</a>
            <a href="#fiyat-alarmi">Fiyat alarmı</a>
          </nav>
          <div className="v12-header-actions">
            <span>🌐 TR</span>
            <a href="/admin" className="v12-admin-link">Admin Panel</a>
          </div>
        </div>
      </header>

      <section className="v12-hero">
        <div className="v12-container v12-hero-grid">
          <div className="v12-hero-copy">
            <div className="v12-pill">✈️ Uçuş fırsatı · rota vitrini · fiyat alarmı</div>
            <h1>Ucuz uçak bileti fırsatlarını tek ekranda yakala.</h1>
            <p>
              Letsgo 2 Travel; rota fırsatlarını, admin panelden eklenen kampanyaları ve
              partner fiyat kontrolünü daha düzenli gösteren seyahat fırsat platformudur.
            </p>
            <div className="v12-hero-actions">
              <a href={aramaLinki} className="v12-primary-btn">Hemen uçuş ara</a>
              <a href="/flights" className="v12-secondary-btn">Fırsat vitrinini aç</a>
            </div>
            <div className="v12-proof-row">
              <span><b>{vitrindekiFirsatlar.length}</b> yayındaki rota</span>
              <span><b>{vizesizSayisi}</b> vizesiz seçenek</span>
              <span><b>{enUcuz?.fiyat || "—"}</b> en düşük vitrin fiyatı</span>
            </div>
          </div>

          <div className="v12-hero-media">
            <div className="v12-plane-card">
              <div className="v12-floating-card top">
                <small>Bugünün odağı</small>
                <strong>{enUcuz?.nereden || "İstanbul"} → {enUcuz?.nereye || "Roma"}</strong>
              </div>
              <div className="v12-floating-card bottom">
                <small>Başlayan fiyatlarla</small>
                <strong>{enUcuz?.fiyat || "1.899 TL"}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="v12-container">
          <form onSubmit={aramaYap} className="v12-search-shell">
            <div className="v12-tabs">
              <button type="button" className="active">✈ Uçuş</button>
              <button type="button">🏨 Otel yakında</button>
              <button type="button">🚗 Araç yakında</button>
            </div>
            <div className="v12-search-grid">
              <label>
                <span>Nereden</span>
                <input value={nereden} onChange={(e) => setNereden(e.target.value)} list="from-airports" />
              </label>
              <button
                type="button"
                className="v12-swap-btn"
                onClick={() => {
                  setNereden(nereye);
                  setNereye(nereden);
                }}
                aria-label="Rota değiştir"
              >
                ⇄
              </button>
              <label>
                <span>Nereye</span>
                <input value={nereye} onChange={(e) => setNereye(e.target.value)} list="to-airports" />
              </label>
              <label>
                <span>Gidiş</span>
                <input value={gidis} onChange={(e) => setGidis(e.target.value)} type="date" />
              </label>
              <label>
                <span>Dönüş</span>
                <input value={donus} onChange={(e) => setDonus(e.target.value)} type="date" />
              </label>
              <label>
                <span>Yolcu</span>
                <select value={yolcu} onChange={(e) => setYolcu(e.target.value)}>
                  <option value="1">1 yolcu</option>
                  <option value="2">2 yolcu</option>
                  <option value="3">3 yolcu</option>
                  <option value="4">4 yolcu</option>
                </select>
              </label>
              <button type="submit" className="v12-search-btn">Fırsat ara →</button>
            </div>
            <div className="v12-search-note">
              <span>Son fiyatı partner sayfasında kontrol et.</span>
              <span>Fiyatlar anlık değişebilir.</span>
              <span>Admin panelden eklenen rotalar vitrinde görünür.</span>
            </div>
            <datalist id="from-airports">{havalimaniSecenekleri.map((item) => <option key={`from-${item}`} value={item} />)}</datalist>
            <datalist id="to-airports">{havalimaniSecenekleri.map((item) => <option key={`to-${item}`} value={item} />)}</datalist>
          </form>
        </div>
      </section>

      <section className="v12-section" id="firsatlar">
        <div className="v12-container">
          <div className="v12-section-head">
            <div>
              <span className="v12-kicker">Admin panelden gelen fırsatlar</span>
              <h2>Yayındaki rota kartları</h2>
              <p>{yukleniyor ? "Fırsatlar yükleniyor..." : firsatlar.length ? "Bu kartlar Supabase ve admin panelinden canlı gelir." : "Henüz canlı rota yok; örnek kartlar gösteriliyor."}</p>
            </div>
            <a href="/flights" className="v12-text-link">Tüm fırsatları gör →</a>
          </div>

          <div className="v12-deal-grid">
            {vitrindekiFirsatlar.map((firsat) => {
              const sinif = rotaSinifi(`${firsat.nereye} ${firsat.ulke} ${firsat.kategori}`);
              return (
                <article key={firsat.id || firsat.detaySlug || `${firsat.nereden}-${firsat.nereye}`} className="v12-deal-card">
                  <a href={slugLink(firsat)} className={`v12-deal-visual v12-route-${sinif}`} style={gorselStyle(firsat.gorselUrl)}>
                    <div className="v12-deal-badges">
                      <span>{firsat.ulkeEmoji || "✈️"} {firsat.kategori || firsat.vize || "Fırsat"}</span>
                      {firsat.oneCikan && <span>Öne çıkan</span>}
                    </div>
                    <strong>{firsat.nereden} → {firsat.nereye}</strong>
                  </a>
                  <div className="v12-deal-body">
                    <div className="v12-deal-price-row">
                      <small>Başlayan fiyatlarla</small>
                      <b>{firsat.fiyat}</b>
                    </div>
                    <p>{firsat.aciklama || `${firsat.ulke || firsat.nereye} rotası için güncel uçuş fırsatı.`}</p>
                    <div className="v12-deal-meta">
                      <span>{firsat.ay || "Sezon"}</span>
                      <span>{firsat.havayolu || "Partner"}</span>
                      <span>{firsat.sonKontrol || "Bugün"}</span>
                    </div>
                    <div className="v12-deal-actions">
                      <a href={rotaAramaLinki(firsat)}>Aramada aç</a>
                      <a href={slugLink(firsat)}>Detay</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="v12-section v12-dark-band">
        <div className="v12-container v12-band-grid">
          <div>
            <span className="v12-kicker light">Kategori vitrini</span>
            <h2>Site sadece bilet göstermesin; rota fikri de versin.</h2>
            <p>
              Kullanıcı ana sayfada hızlı karar verebilsin diye fırsatları kategoriye,
              vize durumuna ve tatil amacına göre gruplayalım.
            </p>
          </div>
          <div className="v12-category-grid">
            {rotaKategorileri.map((item) => (
              <a href={item.link} key={item.baslik} className="v12-category-card">
                <span>{item.ikon}</span>
                <strong>{item.baslik}</strong>
                <small>{item.metin}</small>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="v12-section" id="nasil-calisir">
        <div className="v12-container">
          <div className="v12-section-head centered">
            <span className="v12-kicker">Nasıl çalışır?</span>
            <h2>3 adımda doğru fırsata yönlen</h2>
            <p>Letsgo 2 Travel bilet satmaz; fırsatı gösterir, kullanıcıyı doğru kontrol sayfasına yönlendirir.</p>
          </div>
          <div className="v12-steps">
            <div><b>1</b><strong>Rota seç</strong><p>Şehir veya havalimanı seçerek arama başlat.</p></div>
            <div><b>2</b><strong>Fırsatı incele</strong><p>Admin panelden eklenen kampanya ve rota kartlarını karşılaştır.</p></div>
            <div><b>3</b><strong>Son fiyatı kontrol et</strong><p>Satın alma öncesi partner/havayolu sayfasındaki güncel fiyatı doğrula.</p></div>
          </div>
        </div>
      </section>

      <section className="v12-section" id="fiyat-alarmi">
        <div className="v12-container v12-alert-cta">
          <div>
            <span className="v12-kicker">Fiyat alarmı</span>
            <h2>İstediğin rota için hedef fiyat bırak.</h2>
            <p>Arama sayfasından fiyat alarmı oluşturan kullanıcıları admin panelde takip edebilirsin.</p>
          </div>
          <a href="/arama#fiyat-alarmi" className="v12-primary-btn">Alarm oluştur →</a>
        </div>
      </section>

      <footer className="v12-footer">
        <div className="v12-container v12-footer-grid">
          <div>
            <img src="/logo.png" alt="Letsgo 2 Travel" />
            <p>Ucuz uçuş fikirleri, rota kartları, fiyat alarmı ve partner yönlendirme platformu.</p>
          </div>
          <div>
            <h4>Site</h4>
            <a href="/arama">Uçuş ara</a>
            <a href="/flights">Fırsatlar</a>
            <a href="/canli-ucus">Canlı kontrol</a>
          </div>
          <div>
            <h4>Popüler</h4>
            <a href="/flights?kategori=Avrupa">Avrupa</a>
            <a href="/flights?kategori=Vizesiz">Vizesiz</a>
            <a href="/flights?kategori=En Ucuz">En ucuz</a>
          </div>
          <div>
            <h4>Not</h4>
            <p>Fiyatlar değişebilir. Son fiyat satın alma/partner sayfasında kontrol edilmelidir.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
