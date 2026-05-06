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
};

type SiteAyarlari = {
  siteBaslik?: string;
  siteAltBaslik?: string;
  heroRozet?: string;
  heroBaslik?: string;
  heroAciklama?: string;
  instagramTr?: string;
  instagramEn?: string;
  whatsappLink?: string;
  anaRenk?: string;
  yanRenk1?: string;
  yanRenk2?: string;
  yanRenk3?: string;
  koyuRenk?: string;
  arkaPlan?: string;
  kartRenk?: string;
  yaziRenk?: string;
  butonYaziRenk?: string;
  gununFirsatiGoster?: boolean;
  kategorilerGoster?: boolean;
  rehberlerGoster?: boolean;
  fiyatAlarmGoster?: boolean;
  sosyalMedyaGoster?: boolean;
  sssGoster?: boolean;
  footerMetni?: string;
};

const varsayilanAyarlar: Required<SiteAyarlari> = {
  siteBaslik: "Letsgo 2 Travel",
  siteAltBaslik: "Ucuz uçak bileti fırsatları",
  heroRozet: "Canlı fiyatlarla güvenli arama",
  heroBaslik: "Ucuz uçuşları kolayca bul",
  heroAciklama:
    "Şehir veya havalimanı seç, uygun uçuşları karşılaştır, partner fiyatlarını kontrol et.",
  instagramTr: "https://www.instagram.com/letsgo2travel_tr/",
  instagramEn: "https://www.instagram.com/letsgo2travel_en/",
  whatsappLink: "",
  anaRenk: "#061733",
  yanRenk1: "#1473E6",
  yanRenk2: "#FFD21F",
  yanRenk3: "#10B981",
  koyuRenk: "#031126",
  arkaPlan: "#F3F7FC",
  kartRenk: "#FFFFFF",
  yaziRenk: "#061733",
  butonYaziRenk: "#061733",
  gununFirsatiGoster: true,
  kategorilerGoster: true,
  rehberlerGoster: true,
  fiyatAlarmGoster: true,
  sosyalMedyaGoster: true,
  sssGoster: true,
  footerMetni:
    "Letsgo 2 Travel, uygun uçuş fırsatlarını ve partner fiyatlarını tek yerde takip etmene yardımcı olur.",
};

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
  "Roma (FCO) - Fiumicino Havalimanı",
  "Paris (PAR) - Tüm Havalimanları",
  "Paris (CDG) - Charles de Gaulle Havalimanı",
  "Bakü (BAK) - Tüm Havalimanları",
  "Bakü (GYD) - Haydar Aliyev Havalimanı",
  "Saraybosna (SJJ) - Sarajevo Havalimanı",
  "Londra (LON) - Tüm Havalimanları",
  "Amsterdam (AMS) - Schiphol Havalimanı",
  "Berlin (BER) - Berlin Brandenburg Havalimanı",
  "Madrid (MAD) - Madrid Barajas Havalimanı",
  "Barcelona (BCN) - El Prat Havalimanı",
  "Milano (MIL) - Tüm Havalimanları",
  "Viyana (VIE) - Vienna Havalimanı",
  "Prag (PRG) - Václav Havel Havalimanı",
  "Dubai (DXB) - Dubai Havalimanı",
];

const populerRotalar = [
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Roma (ROM) - Tüm Havalimanları",
    aciklama: "Avrupa fırsatı",
  },
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Saraybosna (SJJ) - Sarajevo Havalimanı",
    aciklama: "Vizesiz rota",
  },
  {
    nereden: "Ankara (ESB) - Esenboğa Havalimanı",
    nereye: "Bakü (GYD) - Haydar Aliyev Havalimanı",
    aciklama: "Yakın rota",
  },
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Paris (PAR) - Tüm Havalimanları",
    aciklama: "Popüler rota",
  },
];

function aramaDegeriTemizle(value: string) {
  const kod = value.match(/\(([A-Z]{3})\)/);
  if (kod?.[1]) return kod[1];
  return value.trim();
}

export default function Home() {
  const [ayarlar, setAyarlar] =
    useState<Required<SiteAyarlari>>(varsayilanAyarlar);
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [nereden, setNereden] = useState("");
  const [nereye, setNereye] = useState("");
  const [gidisTarihi, setGidisTarihi] = useState("");
  const [donusTarihi, setDonusTarihi] = useState("");
  const [yolcu, setYolcu] = useState("1");

  const [alarmEmail, setAlarmEmail] = useState("");
  const [alarmMaksimumFiyat, setAlarmMaksimumFiyat] = useState("5000");
  const [alarmMesaji, setAlarmMesaji] = useState("");
  const [alarmYukleniyor, setAlarmYukleniyor] = useState(false);

  useEffect(() => {
    async function yukle() {
      setYukleniyor(true);

      try {
        const biletResponse = await fetch("/api/biletler", {
          cache: "no-store",
        });
        const biletData = await biletResponse.json();

        if (Array.isArray(biletData.biletler)) {
          setBiletler(biletData.biletler);
        }
      } catch {
        setBiletler([]);
      }

      try {
        const ayarResponse = await fetch("/api/site-ayarlari", {
          cache: "no-store",
        });

        if (ayarResponse.ok) {
          const ayarData = await ayarResponse.json();

          if (ayarData.ayarlar) {
            setAyarlar({
              ...varsayilanAyarlar,
              ...ayarData.ayarlar,
            });
          }
        }
      } catch {
        setAyarlar(varsayilanAyarlar);
      } finally {
        setYukleniyor(false);
      }
    }

    yukle();
  }, []);

  const aktifBiletler = useMemo(() => {
    return biletler.filter((bilet) => bilet.aktif !== false);
  }, [biletler]);

  const bugununFirsatlari = useMemo(() => {
    return [...aktifBiletler]
      .sort((a, b) => {
        if (a.oneCikan && !b.oneCikan) return -1;
        if (!a.oneCikan && b.oneCikan) return 1;
        return a.fiyatSayi - b.fiyatSayi;
      })
      .slice(0, 4);
  }, [aktifBiletler]);

  const populerFirsatlar = useMemo(() => {
    return [...aktifBiletler]
      .sort((a, b) => (b.tiklanma || 0) - (a.tiklanma || 0))
      .slice(0, 5);
  }, [aktifBiletler]);

  const istatistik = useMemo(() => {
    const enUcuz = aktifBiletler.length
      ? [...aktifBiletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    return {
      toplam: aktifBiletler.length,
      enUcuz,
      vizesiz: aktifBiletler.filter((bilet) => bilet.vize === "Vizesiz").length,
      ulkeSayisi: new Set(aktifBiletler.map((bilet) => bilet.ulke)).size,
    };
  }, [aktifBiletler]);

  function aramaYap(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const params = new URLSearchParams();

    if (nereden.trim()) params.set("nereden", aramaDegeriTemizle(nereden));
    if (nereye.trim()) params.set("nereye", aramaDegeriTemizle(nereye));
    if (gidisTarihi) params.set("gidis", gidisTarihi);
    if (donusTarihi) params.set("donus", donusTarihi);
    if (yolcu) params.set("yolcu", yolcu);

    window.location.href = `/arama?${params.toString()}`;
  }

  function rotaAra(kalkis: string, varis: string) {
    const params = new URLSearchParams({
      nereden: aramaDegeriTemizle(kalkis),
      nereye: aramaDegeriTemizle(varis),
    });

    window.location.href = `/arama?${params.toString()}`;
  }

  async function satinAl(bilet: Bilet) {
    try {
      await fetch(`/api/biletler/${bilet.id}/click`, {
        method: "POST",
      });
    } catch {
      // Tıklanma kaydı hata verse bile kullanıcı yönlenir.
    }

    window.open(bilet.link, "_blank", "noopener,noreferrer");
  }

  async function fiyatAlarmiKur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setAlarmMesaji("");

    if (!alarmEmail.trim()) {
      setAlarmMesaji("Lütfen e-posta adresini yaz.");
      return;
    }

    if (!nereden.trim() || !nereye.trim()) {
      setAlarmMesaji(
        "Fiyat alarmı için önce nereden ve nereye alanlarını doldur."
      );
      return;
    }

    if (!alarmMaksimumFiyat || Number(alarmMaksimumFiyat) < 1) {
      setAlarmMesaji("Maksimum fiyat yazmalısın.");
      return;
    }

    setAlarmYukleniyor(true);

    try {
      const response = await fetch("/api/fiyat-alarmi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: alarmEmail,
          nereden: aramaDegeriTemizle(nereden),
          nereye: aramaDegeriTemizle(nereye),
          maksimumFiyat: Number(alarmMaksimumFiyat),
          gidisTarihi,
          donusTarihi,
          yolcu,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Fiyat alarmı kurulamadı.");
      }

      setAlarmEmail("");
      setAlarmMesaji("Fiyat alarmı kaydedildi. Talep admin panelde görünecek.");
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setAlarmMesaji(mesaj);
    } finally {
      setAlarmYukleniyor(false);
    }
  }

  return (
    <main className="letsgo-page">
      <header className="letsgo-header">
        <div className="letsgo-container letsgo-header-inner">
          <a href="/" className="letsgo-logo">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
            <span className="letsgo-logo-title">{ayarlar.siteBaslik}</span>
          </a>

          <nav className="letsgo-nav">
            <a href="/arama">Uçuşlar</a>
            <a href="#firsatlar">Fırsatlar</a>
            <a href="#populer-rotalar">Rotalar</a>
            <a href="#fiyat-alarmi">Fiyat Alarmı</a>
            <a href="/admin/dashboard">Admin</a>
          </nav>

          <a href="/arama" className="letsgo-header-cta">
            Uçuş Ara
          </a>
        </div>
      </header>

      <section className="letsgo-hero">
        <div className="letsgo-container">
          <div className="letsgo-hero-grid">
            <div>
              <p className="letsgo-hero-badge">{ayarlar.heroRozet}</p>

              <h1 className="letsgo-hero-title">{ayarlar.heroBaslik}</h1>

              <p className="letsgo-hero-text">{ayarlar.heroAciklama}</p>

              <div className="letsgo-hero-actions">
                <a href="/arama" className="letsgo-primary-button">
                  Uçuş Ara
                </a>

                <a href="#firsatlar" className="letsgo-secondary-button">
                  Fırsatları Gör
                </a>
              </div>
            </div>

            <div className="letsgo-plane-box">
              <div className="letsgo-hero-price">
                <p className="letsgo-hero-price-label">En ucuz başlangıç</p>
                <p className="letsgo-hero-price-value">
                  {istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={aramaYap} className="letsgo-search-card">
            <div className="letsgo-tabs">
              <span className="letsgo-tab-active">✈️ Uçuş</span>
              <span className="letsgo-tab-muted">🏨 Otel yakında</span>
              <span className="letsgo-tab-muted">🚗 Araç yakında</span>
            </div>

            <div className="letsgo-search-grid">
              <SearchInput
                label="Nereden"
                value={nereden}
                onChange={setNereden}
                placeholder="Şehir veya havalimanı"
                listId="home-from-airports"
              />

              <SearchInput
                label="Nereye"
                value={nereye}
                onChange={setNereye}
                placeholder="Şehir veya havalimanı"
                listId="home-to-airports"
              />

              <DateInput
                label="Gidiş"
                value={gidisTarihi}
                onChange={setGidisTarihi}
              />

              <DateInput
                label="Dönüş"
                value={donusTarihi}
                onChange={setDonusTarihi}
              />

              <div className="letsgo-field">
                <label>Yolcu</label>
                <select
                  value={yolcu}
                  onChange={(event) => setYolcu(event.target.value)}
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </div>
            </div>

            <datalist id="home-from-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`from-${item}`} value={item} />
              ))}
            </datalist>

            <datalist id="home-to-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`to-${item}`} value={item} />
              ))}
            </datalist>

            <div className="letsgo-search-bottom">
              <label className="letsgo-checkbox-label">
                <input type="checkbox" defaultChecked />
                Havalimanlarını dahil et
              </label>

              <button className="letsgo-primary-button">Uçuş ara →</button>
            </div>
          </form>
        </div>
      </section>

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div className="letsgo-stats-grid">
            <StatCard
              title="Aktif fırsat"
              value={yukleniyor ? "..." : String(istatistik.toplam)}
            />
            <StatCard
              title="En ucuz fiyat"
              value={istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
            />
            <StatCard title="Vizesiz rota" value={String(istatistik.vizesiz)} />
            <StatCard title="Ülke sayısı" value={String(istatistik.ulkeSayisi)} />
          </div>
        </div>
      </section>

      <section id="firsatlar" className="letsgo-section">
        <div className="letsgo-container">
          <SectionHeader
            eyebrow="Bugünün fırsatları"
            title="Sınırlı süreli ucuz uçuşlar"
            href="/arama"
          />

          {bugununFirsatlari.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="letsgo-deal-grid">
              {bugununFirsatlari.map((bilet) => (
                <DealCard
                  key={bilet.id}
                  bilet={bilet}
                  onSatinAl={() => satinAl(bilet)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="populer-rotalar" className="letsgo-section">
        <div className="letsgo-container">
          <SectionHeader
            eyebrow="Popüler rotalar"
            title="En çok aranan uçuş rotaları"
          />

          <div className="letsgo-route-grid">
            {populerRotalar.map((rota) => (
              <button
                key={`${rota.nereden}-${rota.nereye}`}
                onClick={() => rotaAra(rota.nereden, rota.nereye)}
                className="letsgo-route-card letsgo-hover"
              >
                <p className="letsgo-route-title">
                  {aramaDegeriTemizle(rota.nereden)} →{" "}
                  {aramaDegeriTemizle(rota.nereye)}
                </p>
                <p className="letsgo-route-desc">{rota.aciklama}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {populerFirsatlar.length > 0 && (
        <section className="letsgo-section">
          <div className="letsgo-container">
            <SectionHeader
              eyebrow="Öne çıkan"
              title="Kullanıcıların ilgilendiği fırsatlar"
              href="/arama"
            />

            <div className="letsgo-popular-grid">
              {populerFirsatlar.map((bilet) => (
                <button
                  key={bilet.id}
                  onClick={() => satinAl(bilet)}
                  className="letsgo-simple-card letsgo-hover"
                >
                  <p className="letsgo-simple-card-title">
                    {bilet.nereden} → {bilet.nereye}
                  </p>
                  <p className="letsgo-simple-card-text">{bilet.ulke}</p>
                  <p className="letsgo-simple-card-price">{bilet.fiyat}</p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {ayarlar.fiyatAlarmGoster && (
        <section id="fiyat-alarmi" className="letsgo-section">
          <div className="letsgo-container">
            <div className="letsgo-alert-box">
              <div>
                <p className="letsgo-alert-eyebrow">Fiyat Alarmı</p>

                <h2 className="letsgo-alert-title">
                  Fiyat düşünce fırsatı kaçırma
                </h2>

                <p className="letsgo-alert-text">
                  Nereden ve nereye alanlarını doldur, hedef fiyatını yaz. Talep
                  admin paneline düşer.
                </p>
              </div>

              <form onSubmit={fiyatAlarmiKur} className="letsgo-alert-form">
                <label>E-posta adresin</label>
                <input
                  value={alarmEmail}
                  onChange={(event) => setAlarmEmail(event.target.value)}
                  type="email"
                  placeholder="ornek@mail.com"
                />

                <label>Maksimum fiyat</label>
                <input
                  value={alarmMaksimumFiyat}
                  onChange={(event) =>
                    setAlarmMaksimumFiyat(event.target.value)
                  }
                  type="number"
                  placeholder="3000"
                />

                <button disabled={alarmYukleniyor}>
                  {alarmYukleniyor ? "Kaydediliyor..." : "Fiyat Alarmı Kur"}
                </button>

                {alarmMesaji && <p className="letsgo-message">{alarmMesaji}</p>}
              </form>
            </div>
          </div>
        </section>
      )}

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div className="letsgo-feature-grid">
            <FeatureCard
              icon="🔎"
              title="Canlı fiyat verisi"
              text="Partner ve havayolu kaynaklarından gelen fiyatları tek yerde kontrol et."
            />

            <FeatureCard
              icon="⚡"
              title="Hızlı karşılaştırma"
              text="En uygun rotayı, fiyatı ve fırsatı daha hızlı bul."
            />

            <FeatureCard
              icon="🔔"
              title="Fiyat alarmı"
              text="İstediğin rota için hedef fiyat belirle, fırsatı takip et."
            />
          </div>
        </div>
      </section>

      <footer className="letsgo-footer">
        <div className="letsgo-container">
          <div className="letsgo-footer-grid">
            <div>
              <div className="letsgo-footer-logo">
                <img src="/logo.png" alt="Letsgo 2 Travel" />
                <h2 className="letsgo-footer-title">{ayarlar.siteBaslik}</h2>
              </div>

              <p className="letsgo-footer-text">{ayarlar.footerMetni}</p>
            </div>

            <FooterLinks
              title="Keşfet"
              links={[
                ["Uçuşlar", "/arama"],
                ["Fırsatlar", "#firsatlar"],
                ["Rotalar", "#populer-rotalar"],
                ["Fiyat Alarmı", "#fiyat-alarmi"],
              ]}
            />

            <FooterLinks
              title="Yönetim"
              links={[
                ["Dashboard", "/admin/dashboard"],
                ["Bilet Admin", "/admin"],
                ["Site Ayarları", "/admin/ayarlar"],
                ["Fiyat Alarmları", "/admin/fiyat-alarmlari"],
              ]}
            />

            <div>
              <p className="letsgo-footer-heading">Bilgilendirme</p>
              <p className="letsgo-footer-text">
                Bilet fiyatları değişebilir. Satın almadan önce son fiyatı, bagaj
                şartlarını ve müsaitliği partner sitede kontrol edin.
              </p>

              <div className="letsgo-footer-pills">
                <span className="letsgo-footer-pill">Güvenli bağlantı</span>
                <span className="letsgo-footer-pill">Partner fiyatları</span>
                <span className="letsgo-footer-pill">Fiyat alarmı</span>
              </div>
            </div>
          </div>

          <div className="letsgo-footer-bottom">
            © 2026 Letsgo 2 Travel. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>
    </main>
  );
}

function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  listId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  listId: string;
}) {
  return (
    <div className="letsgo-field">
      <label>{label}</label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        list={listId}
      />
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="letsgo-field">
      <label>{label}</label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="date"
      />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="letsgo-stat-card">
      <p className="letsgo-stat-label">{title}</p>
      <p className="letsgo-stat-value">{value}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  href,
}: {
  eyebrow: string;
  title: string;
  href?: string;
}) {
  return (
    <div className="letsgo-section-header">
      <div>
        <p className="letsgo-eyebrow">{eyebrow}</p>
        <h2 className="letsgo-section-title">{title}</h2>
      </div>

      {href && (
        <a href={href} className="letsgo-section-link">
          Tümünü gör →
        </a>
      )}
    </div>
  );
}

function DealCard({
  bilet,
  onSatinAl,
}: {
  bilet: Bilet;
  onSatinAl: () => void;
}) {
  return (
    <article className="letsgo-card letsgo-hover">
      <div className="letsgo-deal-image">
        <div className="letsgo-deal-image-inner">
          <span className="letsgo-badge">
            {bilet.ulkeEmoji} {bilet.ulke}
          </span>

          <span className="letsgo-badge">{bilet.vize}</span>
        </div>
      </div>

      <div className="letsgo-deal-body">
        <div className="letsgo-deal-top">
          <div>
            <h3 className="letsgo-deal-title">
              {bilet.nereden} → {bilet.nereye}
            </h3>

            <p className="letsgo-deal-date">{bilet.tarih}</p>
          </div>

          <p className="letsgo-deal-price">{bilet.fiyat}</p>
        </div>

        <div className="letsgo-deal-info">
          <p>
            <span>Havayolu:</span> {bilet.havayolu}
          </p>
          <p>
            <span>Süre:</span> {bilet.sure}
          </p>
        </div>

        <div className="letsgo-deal-actions">
          <button onClick={onSatinAl} className="letsgo-card-button-yellow">
            Satın Al
          </button>

          <a
            href={`/ucak-bileti/${bilet.detaySlug}`}
            className="letsgo-card-button-dark"
          >
            Detay
          </a>
        </div>
      </div>
    </article>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="letsgo-feature-card">
      <div className="letsgo-feature-icon">{icon}</div>
      <h3 className="letsgo-feature-title">{title}</h3>
      <p className="letsgo-feature-text">{text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="letsgo-empty">
      <h3 className="letsgo-empty-title">Henüz fırsat yok</h3>
      <p className="letsgo-empty-text">
        Admin panelden bilet ekleyince burada görünecek.
      </p>
    </div>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="letsgo-footer-heading">{title}</p>

      <div className="letsgo-footer-links">
        {links.map(([label, href]) => (
          <a key={label} href={href}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}