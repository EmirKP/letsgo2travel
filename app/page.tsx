"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const demoRotalar = [
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Roma (ROM) - Tüm Havalimanları",
    rota: "İstanbul → Roma",
    fiyat: "2.499 TL",
    etiket: "Avrupa",
    aciklama: "Hafta sonu kaçamakları ve kültür rotaları için güçlü seçenek.",
    gorselSinifi: "roma",
    ikon: "🇮🇹",
  },
  {
    nereden: "İstanbul (SAW) - Sabiha Gökçen Havalimanı",
    nereye: "Saraybosna (SJJ) - Sarajevo Havalimanı",
    rota: "İstanbul → Saraybosna",
    fiyat: "1.899 TL",
    etiket: "Vizesiz",
    aciklama: "Pasaportla kolay seyahat edilebilecek Balkan rotası.",
    gorselSinifi: "saraybosna",
    ikon: "🇧🇦",
  },
  {
    nereden: "Ankara (ESB) - Esenboğa Havalimanı",
    nereye: "Bakü (GYD) - Haydar Aliyev Havalimanı",
    rota: "Ankara → Bakü",
    fiyat: "2.199 TL",
    etiket: "Yakın rota",
    aciklama: "Kısa uçuş süresi ve dönemsel kampanyalarla öne çıkar.",
    gorselSinifi: "baku",
    ikon: "🇦🇿",
  },
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Dubai (DXB) - Dubai Havalimanı",
    rota: "İstanbul → Dubai",
    fiyat: "4.999 TL",
    etiket: "Popüler",
    aciklama: "Alışveriş, şehir tatili ve aktarmalı seyahatler için tercih edilir.",
    gorselSinifi: "dubai",
    ikon: "🇦🇪",
  },
];

type AnasayfaRotasi = {
  id?: number;
  nereden: string;
  nereye: string;
  rota: string;
  fiyat: string;
  etiket: string;
  aciklama: string;
  gorselSinifi?: string;
  gorselUrl?: string;
  ikon: string;
  detaySlug?: string;
  kalkisKodu?: string;
  varisKodu?: string;
};

function rotaGorselSinifi(metin: string) {
  const temiz = metin.toLocaleLowerCase("tr-TR");
  if (temiz.includes("roma") || temiz.includes("italya")) return "roma";
  if (temiz.includes("saraybosna") || temiz.includes("bosna")) return "saraybosna";
  if (temiz.includes("bakü") || temiz.includes("baku") || temiz.includes("azerbaycan")) return "baku";
  if (temiz.includes("dubai")) return "dubai";
  return "default";
}

function rotaGorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.06), rgba(2, 6, 23, 0.66)), url(${url})`,
  };
}

const havalimaniSecenekleri = [
  "İstanbul (IST) - İstanbul Havalimanı",
  "İstanbul (SAW) - Sabiha Gökçen Havalimanı",
  "Ankara (ANK) - Tüm Havalimanları",
  "Ankara (ESB) - Esenboğa Havalimanı",
  "İzmir (IZM) - Tüm Havalimanları",
  "İzmir (ADB) - Adnan Menderes Havalimanı",
  "Antalya (AYT) - Antalya Havalimanı",
  "Bodrum (BJV) - Milas Bodrum Havalimanı",
  "Dalaman (DLM) - Dalaman Havalimanı",
  "Adana (ADA) - Şakirpaşa Havalimanı",
  "Trabzon (TZX) - Trabzon Havalimanı",
  "Roma (ROM) - Tüm Havalimanları",
  "Paris (PAR) - Tüm Havalimanları",
  "Bakü (GYD) - Haydar Aliyev Havalimanı",
  "Saraybosna (SJJ) - Sarajevo Havalimanı",
  "Londra (LON) - Tüm Havalimanları",
  "Amsterdam (AMS) - Schiphol Havalimanı",
  "Berlin (BER) - Berlin Brandenburg Havalimanı",
  "Madrid (MAD) - Madrid Barajas Havalimanı",
  "Barcelona (BCN) - El Prat Havalimanı",
  "Viyana (VIE) - Vienna Havalimanı",
  "Prag (PRG) - Václav Havel Havalimanı",
  "Dubai (DXB) - Dubai Havalimanı",
];

const avantajlar = [
  {
    ikon: "⚡",
    baslik: "Hızlı karşılaştırma",
    metin: "Letsgo fırsatlarını ve canlı partner fiyatlarını tek ekranda gör.",
  },
  {
    ikon: "🔔",
    baslik: "Fiyat alarmı",
    metin: "İstediğin rota için hedef fiyat bırak, admin panelden talepleri takip et.",
  },
  {
    ikon: "🧭",
    baslik: "Rota odaklı içerik",
    metin: "Vizesiz, Avrupa, Balkan ve yaz rotalarını daha düzenli sun.",
  },
];

const vitrinKategorileri = [
  { ikon: "🌍", baslik: "Avrupa kaçamakları", metin: "Roma, Paris, Viyana ve Prag gibi şehir rotalarını öne çıkar." },
  { ikon: "🛂", baslik: "Vizesiz rotalar", metin: "Balkanlar, Kafkasya ve yakın coğrafya fırsatlarını ayrı vitrine taşı." },
  { ikon: "🏖️", baslik: "Yaz tatili", metin: "Antalya, Bodrum, Dalaman ve Akdeniz uçuşlarını sezonluk göster." },
  { ikon: "💸", baslik: "En ucuz fırsatlar", metin: "Kullanıcıyı hızlıca düşük fiyatlı kampanya kartlarına yönlendir." },
];

const editoryalKartlar = [
  {
    etiket: "Rota rehberi",
    baslik: "Hafta sonu için kısa Avrupa rotaları",
    metin: "2-3 günlük kaçamak planlayan kullanıcılar için hızlı karar kartları.",
    link: "/flights",
  },
  {
    etiket: "Fiyat takibi",
    baslik: "Uygun fiyat yakalama mantığı",
    metin: "Arama sayfası ve fiyat alarmı ile kullanıcıyı sitede daha uzun tut.",
    link: "/arama",
  },
  {
    etiket: "Canlı kontrol",
    baslik: "Son fiyatı partner sayfasında doğrula",
    metin: "Satın alma öncesi son fiyat kontrolünü net şekilde anlatan güven alanı.",
    link: "/canli-ucus?nereden=IST&nereye=ROM&gidis=2026-06-12&donus=2026-06-18&fiyat=2499&aktarma=Aktarmasız&havayolu=Partner&kaynak=Travelpayouts",
  },
];

const guvenSinyalleri = [
  "Fiyatlar değişebilir uyarısı",
  "Partner yönlendirme mantığı",
  "Admin panelden canlı içerik",
  "Görselli rota kartları",
];

function aramaDegeriTemizle(value: string) {
  const kod = value.match(/\(([A-Z]{3})\)/);
  if (kod?.[1]) return kod[1];
  return value.trim();
}

function bugun() {
  return new Date().toISOString().slice(0, 10);
}

function birHaftaSonra() {
  const tarih = new Date();
  tarih.setDate(tarih.getDate() + 7);
  return tarih.toISOString().slice(0, 10);
}

export default function HomePage() {
  const [nereden, setNereden] = useState("İstanbul (IST) - İstanbul Havalimanı");
  const [nereye, setNereye] = useState("Roma (ROM) - Tüm Havalimanları");
  const [gidis, setGidis] = useState(bugun());
  const [donus, setDonus] = useState(birHaftaSonra());
  const [yolcu, setYolcu] = useState("1");
  const [adminRotalari, setAdminRotalari] = useState<AnasayfaRotasi[]>([]);
  const [rotalarYukleniyor, setRotalarYukleniyor] = useState(true);

  useEffect(() => {
    let aktif = true;

    async function rotalariYukle() {
      try {
        const response = await fetch("/api/one-cikan-rotalar", { cache: "no-store" });
        const data = await response.json();
        if (!aktif) return;
        setAdminRotalari(Array.isArray(data.rotalar) ? data.rotalar : []);
      } catch {
        if (aktif) setAdminRotalari([]);
      } finally {
        if (aktif) setRotalarYukleniyor(false);
      }
    }

    rotalariYukle();

    return () => {
      aktif = false;
    };
  }, []);

  const gosterilecekRotalar: AnasayfaRotasi[] = adminRotalari.length > 0 ? adminRotalari : demoRotalar;

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

  function hizliRotaAc(rota: AnasayfaRotasi) {
    const params = new URLSearchParams({
      nereden: aramaDegeriTemizle(rota.nereden),
      nereye: aramaDegeriTemizle(rota.nereye),
      gidis,
      donus,
      yolcu,
      maksimumFiyat: "30000",
      siralama: "en-iyi",
      vize: "Tümü",
      kategori: "Tümü",
      aktarma: "Tümü",
    });

    window.location.href = `/arama?${params.toString()}`;
  }

  return (
    <main className="l2t-page">
      <header className="l2t-header">
        <div className="l2t-container l2t-header-inner">
          <a href="/" className="l2t-logo" aria-label="Letsgo 2 Travel ana sayfa">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
          </a>

          <nav className="l2t-nav" aria-label="Ana menü">
            <a href="/arama">Uçuş Ara</a>
            <a href="#firsatlar">Fırsatlar</a>
            <a href="#nasil-calisir">Nasıl çalışır?</a>
            <a href="/admin/dashboard">Dashboard</a>
          </nav>

          <div className="l2t-header-right">
            <span className="l2t-lang">🌐 TR</span>
            <a href="/admin" className="l2t-login-btn">
              Admin Panel
            </a>
          </div>
        </div>
      </header>

      <section className="l2t-hero l2t-hero-v6">
        <div className="l2t-container">
          <div className="l2t-badge">✈️ Letsgo 2 Travel · Uçuş fırsat platformu</div>

          <div className="l2t-hero-grid">
            <div className="l2t-hero-left">
              <h1 className="l2t-hero-title">
                Ucuz uçak bileti fırsatlarını tek ekranda keşfet
              </h1>
              <p className="l2t-hero-text">
                Rota seç, Letsgo fırsatlarını gör, canlı partner fiyatlarını karşılaştır
                ve uygun bilet sayfasına hızlıca yönlen.
              </p>

              <div className="l2t-hero-actions">
                <a href={aramaLinki} className="l2t-hero-primary">
                  Hemen uçuş ara
                </a>
                <a href="#firsatlar" className="l2t-hero-secondary">
                  Popüler rotaları gör
                </a>
              </div>

              <div className="l2t-trust-row">
                <span>Canlı fiyat</span>
                <span>Fiyat alarmı</span>
                <span>Admin yönetimi</span>
              </div>
            </div>

            <div className="l2t-hero-visual">
              <div className="l2t-floating-card top">
                <small>Bugünün odağı</small>
                <strong>Avrupa & vizesiz rotalar</strong>
              </div>
              <div className="l2t-floating-card bottom">
                <small>Başlayan fiyatlarla</small>
                <strong>1.899 TL</strong>
              </div>
            </div>
          </div>

          <form onSubmit={aramaYap} className="l2t-search-card l2t-search-card-v6">
            <div className="l2t-tabs">
              <button type="button" className="l2t-tab active">✈ Uçuş</button>
              <button type="button" className="l2t-tab">🏨 Otel yakında</button>
              <button type="button" className="l2t-tab">🚗 Araç yakında</button>
            </div>

            <div className="l2t-search-grid">
              <div className="l2t-field">
                <label>Nereden</label>
                <input
                  value={nereden}
                  onChange={(event) => setNereden(event.target.value)}
                  list="from-airports"
                  placeholder="Şehir veya havalimanı"
                />
                <small>Örn. İstanbul, SAW, Ankara</small>
              </div>

              <div className="l2t-switch-wrap">
                <button
                  type="button"
                  className="l2t-switch-btn"
                  onClick={() => {
                    setNereden(nereye);
                    setNereye(nereden);
                  }}
                  aria-label="Kalkış ve varış yerini değiştir"
                >
                  ⇄
                </button>
              </div>

              <div className="l2t-field">
                <label>Nereye</label>
                <input
                  value={nereye}
                  onChange={(event) => setNereye(event.target.value)}
                  list="to-airports"
                  placeholder="Şehir veya havalimanı"
                />
                <small>Örn. Roma, Dubai, Saraybosna</small>
              </div>

              <div className="l2t-field small">
                <label>Gidiş</label>
                <input value={gidis} onChange={(event) => setGidis(event.target.value)} type="date" />
              </div>

              <div className="l2t-field small">
                <label>Dönüş</label>
                <input value={donus} onChange={(event) => setDonus(event.target.value)} type="date" />
              </div>

              <div className="l2t-field small">
                <label>Yolcu</label>
                <select value={yolcu} onChange={(event) => setYolcu(event.target.value)}>
                  <option value="1">1 yolcu</option>
                  <option value="2">2 yolcu</option>
                  <option value="3">3 yolcu</option>
                  <option value="4">4 yolcu</option>
                </select>
                <small>Ekonomi</small>
              </div>

              <button type="submit" className="l2t-search-btn">Uçuş ara →</button>
            </div>

            <datalist id="from-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`from-${item}`} value={item} />
              ))}
            </datalist>

            <datalist id="to-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`to-${item}`} value={item} />
              ))}
            </datalist>

            <div className="l2t-search-note">
              <span>Rota seç, arama sayfasında fırsatları karşılaştır.</span>
              <span>Son fiyatı partner sayfasında güvenli şekilde kontrol et.</span>
            </div>
          </form>
        </div>
      </section>

      <section id="firsatlar" className="l2t-section l2t-section-v6">
        <div className="l2t-container">
          <div className="l2t-section-head">
            <div>
              <p className="l2t-mini-kicker">Admin panelden gelen rota kartları</p>
              <h2 className="l2t-section-title">Yayındaki uçuş fırsatları</h2>
              <p className="l2t-section-subtitle">
                Admin panelde eklediğin görsel ve rota bilgileri burada otomatik görünür.
              </p>
            </div>
            <a href="/arama" className="l2t-link">Tüm arama sayfası →</a>
          </div>

          <div className="l2t-home-admin-note">
            {rotalarYukleniyor ? "Rotalar yükleniyor..." : adminRotalari.length > 0 ? "Bu kartlar admin paneldeki aktif fırsatlardan gelir." : "Henüz admin rotası yok; örnek kartlar gösteriliyor."}
          </div>

          <div className="l2t-deals-grid l2t-deals-grid-v6">
            {gosterilecekRotalar.map((rota) => (
              <button
                type="button"
                key={rota.detaySlug || rota.rota}
                onClick={() => hizliRotaAc(rota)}
                className="l2t-deal-card l2t-deal-card-v6"
              >
                <div
                  className={`l2t-deal-image l2t-route-visual-${rota.gorselSinifi || rotaGorselSinifi(`${rota.nereye} ${rota.etiket}`)}`}
                  style={rotaGorselStyle(rota.gorselUrl)}
                >
                  <span>{rota.ikon}</span>
                  <strong>{rota.rota}</strong>
                </div>
                <div className="l2t-deal-body">
                  <div className="l2t-deal-route-row">
                    <strong>{rota.rota}</strong>
                    <span>{rota.etiket}</span>
                  </div>
                  <p className="l2t-route-description">{rota.aciklama}</p>
                  <div className="l2t-deal-meta-row">
                    <small>Başlayan fiyatlarla</small>
                    <div className="l2t-deal-price-box">
                      <strong>{rota.fiyat}</strong>
                      <small>Kontrol et</small>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="l2t-section l2t-showcase-section">
        <div className="l2t-container">
          <div className="l2t-showcase-grid">
            <div className="l2t-showcase-panel dark">
              <p className="l2t-mini-kicker light">Seyahat vitrini</p>
              <h2>Fırsatları kategoriye göre daha profesyonel sun</h2>
              <p>
                Kullanıcı sadece bilet görmesin; vizesiz, Avrupa, yaz tatili ve en ucuz gibi
                net başlıklarla sitede daha kolay yön bulsun.
              </p>
              <div className="l2t-showcase-tags">
                {guvenSinyalleri.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="l2t-category-grid">
              {vitrinKategorileri.map((item) => (
                <a href="/flights" className="l2t-category-card" key={item.baslik}>
                  <span>{item.ikon}</span>
                  <strong>{item.baslik}</strong>
                  <small>{item.metin}</small>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="l2t-section">
        <div className="l2t-container">
          <div className="l2t-editorial-head">
            <div>
              <p className="l2t-mini-kicker">Yan sayfa deneyimi</p>
              <h2 className="l2t-section-title">Kullanıcıyı sadece ana sayfada bırakma</h2>
              <p className="l2t-section-subtitle">
                Rota vitrini, arama sayfası ve canlı kontrol sayfası artık aynı marka diliyle çalışır.
              </p>
            </div>
            <a href="/flights" className="l2t-link">Fırsat vitrinini aç →</a>
          </div>

          <div className="l2t-editorial-grid">
            {editoryalKartlar.map((item) => (
              <a href={item.link} className="l2t-editorial-card" key={item.baslik}>
                <span>{item.etiket}</span>
                <strong>{item.baslik}</strong>
                <p>{item.metin}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="nasil-calisir" className="l2t-section">
        <div className="l2t-container">
          <div className="l2t-feature-strip">
            {avantajlar.map((item) => (
              <div className="l2t-feature-item" key={item.baslik}>
                <div className="l2t-feature-icon">{item.ikon}</div>
                <div>
                  <h3>{item.baslik}</h3>
                  <p>{item.metin}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="l2t-section">
        <div className="l2t-container">
          <div className="l2t-partner-box l2t-partner-box-v6">
            <div className="l2t-partner-left">
              <div className="l2t-mini-kicker">Gelir modeli</div>
              <h2>Partner yönlendirmesi hazır</h2>
              <p>
                Kullanıcı önce senin sitende rota seçer; sonra uygun fiyatı görmek için
                partner arama veya bilet detay bağlantısına yönlenir.
              </p>
            </div>

            <div className="l2t-partner-right">
              <div className="l2t-partner-top">
                <h3>Aviasales / Travelpayouts</h3>
                <span>Affiliate uyumlu yapı</span>
              </div>
              <div className="l2t-partner-bottom-grid">
                <div className="l2t-field">
                  <label>Arama</label>
                  <input value="Canlı fiyat + Letsgo fırsatı" readOnly />
                </div>
                <div className="l2t-field">
                  <label>Yönetim</label>
                  <input value="Admin panel" readOnly />
                </div>
                <div className="l2t-field">
                  <label>Gelir</label>
                  <input value="Partner link" readOnly />
                </div>
                <a href="/arama" className="l2t-partner-btn l2t-partner-link">Aramayı aç</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="l2t-footer">
        <div className="l2t-container l2t-footer-grid">
          <div>
            <img src="/logo.png" alt="Letsgo 2 Travel" className="l2t-footer-logo" />
            <p className="l2t-footer-text">
              Letsgo 2 Travel; ucuz uçuş fikirlerini, rota kartlarını ve partner
              yönlendirmelerini tek çatı altında sunan seyahat fırsat platformudur.
            </p>
            <small className="l2t-copy">© 2026 Letsgo 2 Travel.</small>
          </div>
          <div>
            <h4>Site</h4>
            <ul>
              <li><a href="/arama">Uçuş ara</a></li>
              <li><a href="/flights">Uçuşlar</a></li>
              <li><a href="/canli-ucus">Canlı uçuş</a></li>
            </ul>
          </div>
          <div>
            <h4>Yönetim</h4>
            <ul>
              <li><a href="/admin">Bilet admin</a></li>
              <li><a href="/admin/dashboard">Dashboard</a></li>
              <li><a href="/admin/ayarlar">Site ayarları</a></li>
            </ul>
          </div>
          <div>
            <h4>Not</h4>
            <p className="l2t-footer-text small">
              Fiyatlar değişebilir. Son fiyat satın alma veya partner yönlendirme
              sayfasında kontrol edilmelidir.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
