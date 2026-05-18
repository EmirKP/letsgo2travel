"use client";

import { useEffect, useMemo, useState } from "react";

type Rota = {
  id?: number;
  nereden: string;
  nereye: string;
  rota: string;
  fiyat: string;
  fiyatSayi?: number;
  etiket: string;
  aciklama: string;
  ikon: string;
  kalkisKodu?: string;
  varisKodu?: string;
  detaySlug?: string;
  gorselUrl?: string;
};

const demoRotalar: Rota[] = [
  {
    nereden: "İstanbul",
    nereye: "Roma",
    rota: "İstanbul → Roma",
    fiyat: "2.499 TL",
    fiyatSayi: 2499,
    etiket: "Avrupa",
    aciklama: "Kültür, tarih ve kısa şehir kaçamağı için güçlü rota.",
    ikon: "🇮🇹",
    kalkisKodu: "IST",
    varisKodu: "ROM",
  },
  {
    nereden: "İstanbul",
    nereye: "Saraybosna",
    rota: "İstanbul → Saraybosna",
    fiyat: "1.899 TL",
    fiyatSayi: 1899,
    etiket: "Vizesiz",
    aciklama: "Balkan atmosferi ve kolay seyahat planı isteyenler için.",
    ikon: "🇧🇦",
    kalkisKodu: "IST",
    varisKodu: "SJJ",
  },
  {
    nereden: "Ankara",
    nereye: "Bakü",
    rota: "Ankara → Bakü",
    fiyat: "2.199 TL",
    fiyatSayi: 2199,
    etiket: "Yakın rota",
    aciklama: "Kısa uçuş süresi ve dönemsel kampanya takibi için uygun.",
    ikon: "🇦🇿",
    kalkisKodu: "ESB",
    varisKodu: "GYD",
  },
];

function rotaGorselSinifi(value: string) {
  const metin = value.toLocaleLowerCase("tr-TR");
  if (metin.includes("roma") || metin.includes("italya")) return "roma";
  if (metin.includes("saraybosna") || metin.includes("bosna")) return "saraybosna";
  if (metin.includes("bakü") || metin.includes("baku") || metin.includes("azerbaycan")) return "baku";
  if (metin.includes("dubai")) return "dubai";
  if (metin.includes("paris") || metin.includes("fransa")) return "paris";
  return "default";
}

function rotaGorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.72)), url(${url})`,
  };
}

function aramaLinki(rota: Rota) {
  const params = new URLSearchParams({
    nereden: rota.kalkisKodu || rota.nereden,
    nereye: rota.varisKodu || rota.nereye,
    maksimumFiyat: "30000",
    siralama: "en-iyi",
    vize: "Tümü",
    kategori: "Tümü",
    aktarma: "Tümü",
    yolcu: "1",
  });

  return `/arama?${params.toString()}`;
}

export default function FlightsPage() {
  const [rotalar, setRotalar] = useState<Rota[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aktifKategori, setAktifKategori] = useState("Tümü");

  useEffect(() => {
    let aktif = true;

    async function yukle() {
      try {
        const response = await fetch("/api/one-cikan-rotalar", { cache: "no-store" });
        const data = await response.json();
        if (!aktif) return;
        setRotalar(Array.isArray(data.rotalar) ? data.rotalar : []);
      } catch {
        if (aktif) setRotalar([]);
      } finally {
        if (aktif) setYukleniyor(false);
      }
    }

    yukle();

    return () => {
      aktif = false;
    };
  }, []);

  const tumRotalar = rotalar.length > 0 ? rotalar : demoRotalar;
  const kategoriler = useMemo(() => ["Tümü", ...Array.from(new Set(tumRotalar.map((rota) => rota.etiket).filter(Boolean)))], [tumRotalar]);
  const filtreliRotalar = aktifKategori === "Tümü" ? tumRotalar : tumRotalar.filter((rota) => rota.etiket === aktifKategori);

  return (
    <main className="letsgo-page flights-page-v11">
      <header className="letsgo-header">
        <div className="letsgo-container letsgo-header-inner">
          <a href="/" className="letsgo-logo">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
            <span className="letsgo-logo-title">Letsgo 2 Travel</span>
          </a>

          <nav className="letsgo-nav">
            <a href="/">Ana Sayfa</a>
            <a href="/arama">Uçuş Ara</a>
            <a href="/flights">Fırsatlar</a>
            <a href="/admin">Admin</a>
          </nav>

          <a href="/arama" className="letsgo-header-cta">Uçuş Ara</a>
        </div>
      </header>

      <section className="letsgo-hero flights-hero-v11">
        <div className="letsgo-container">
          <div className="letsgo-hero-grid">
            <div>
              <p className="letsgo-hero-badge">🧭 Rota vitrini</p>
              <h1 className="letsgo-hero-title">Yayındaki fırsatları daha düzenli keşfet</h1>
              <p className="letsgo-hero-text">
                Admin panelde eklediğin aktif ve görselli rotalar burada vitrin sayfası olarak görünür.
                Kullanıcı buradan hızlıca arama veya detay sayfasına geçer.
              </p>
              <div className="letsgo-hero-actions">
                <a href="/arama" className="letsgo-yellow-button">Arama sayfasına git</a>
                <a href="/admin" className="letsgo-secondary-button">Admin panel</a>
              </div>
            </div>

            <div className="letsgo-plane-box flights-plane-v11">
              <div className="letsgo-hero-price">
                <p className="letsgo-hero-price-label">Vitrindeki rota</p>
                <p className="letsgo-hero-price-value">{tumRotalar.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div className="flights-toolbar-v11">
            <div>
              <p className="letsgo-eyebrow">Fırsat filtreleri</p>
              <h2 className="letsgo-section-title">Rota kartları</h2>
            </div>
            <div className="flights-chip-row-v11">
              {kategoriler.map((kategori) => (
                <button
                  key={kategori}
                  type="button"
                  onClick={() => setAktifKategori(kategori)}
                  className={kategori === aktifKategori ? "active" : ""}
                >
                  {kategori}
                </button>
              ))}
            </div>
          </div>

          {yukleniyor && <p className="letsgo-message">Fırsatlar yükleniyor...</p>}

          <div className="flights-grid-v11">
            {filtreliRotalar.map((rota) => {
              const sinif = rotaGorselSinifi(`${rota.nereye} ${rota.etiket}`);
              return (
                <article key={rota.detaySlug || rota.rota} className="flights-card-v11 letsgo-hover">
                  <div className={`flights-card-visual-v11 l2t-route-visual-${sinif}`} style={rotaGorselStyle(rota.gorselUrl)}>
                    <span>{rota.ikon}</span>
                    <strong>{rota.rota}</strong>
                  </div>
                  <div className="flights-card-body-v11">
                    <div className="flights-card-top-v11">
                      <span>{rota.etiket}</span>
                      <b>{rota.fiyat}</b>
                    </div>
                    <h3>{rota.rota}</h3>
                    <p>{rota.aciklama}</p>
                    <div className="flights-card-actions-v11">
                      <a href={aramaLinki(rota)}>Aramada aç</a>
                      {rota.detaySlug ? <a href={`/ucak-bileti/${rota.detaySlug}`}>Detay</a> : <a href="/arama">Detay</a>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
