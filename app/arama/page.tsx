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

const kategoriler = [
  "Tümü",
  "Genel",
  "Avrupa",
  "Balkan",
  "Vizesiz",
  "Hafta Sonu",
  "Yaz Tatili",
  "Kış Rotası",
  "En Ucuz",
  "Aile Rotası",
];

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

const populerAramalar = [
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Roma (ROM) - Tüm Havalimanları",
    etiket: "Avrupa",
  },
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Saraybosna (SJJ) - Sarajevo Havalimanı",
    etiket: "Vizesiz",
  },
  {
    nereden: "Ankara (ESB) - Esenboğa Havalimanı",
    nereye: "Bakü (GYD) - Haydar Aliyev Havalimanı",
    etiket: "Yakın rota",
  },
  {
    nereden: "İstanbul (IST) - İstanbul Havalimanı",
    nereye: "Paris (PAR) - Tüm Havalimanları",
    etiket: "Popüler",
  },
];

function aramaDegeriTemizle(value: string) {
  const kod = value.match(/\(([A-Z]{3})\)/);
  if (kod?.[1]) return kod[1];
  return value.trim();
}

function fiyatYaz(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`;
}

export default function AramaPage() {
  const [nereden, setNereden] = useState("");
  const [nereye, setNereye] = useState("");
  const [gidisTarihi, setGidisTarihi] = useState("");
  const [donusTarihi, setDonusTarihi] = useState("");
  const [yolcu, setYolcu] = useState("1");

  const [vize, setVize] = useState("Tümü");
  const [kategori, setKategori] = useState("Tümü");
  const [aktarma, setAktarma] = useState("Tümü");
  const [maksimumFiyat, setMaksimumFiyat] = useState("30000");
  const [siralama, setSiralama] = useState("en-iyi");

  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [canliUcuslar, setCanliUcuslar] = useState<CanliUcus[]>([]);
  const [canliKaynak, setCanliKaynak] = useState("");

  const [yukleniyor, setYukleniyor] = useState(false);
  const [canliYukleniyor, setCanliYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [canliHata, setCanliHata] = useState("");

  const [alarmEmail, setAlarmEmail] = useState("");
  const [alarmMaksimumFiyat, setAlarmMaksimumFiyat] = useState("5000");
  const [alarmMesaji, setAlarmMesaji] = useState("");
  const [alarmYukleniyor, setAlarmYukleniyor] = useState(false);

  async function aramaYap(
    e?: FormEvent<HTMLFormElement>,
    ozelDegerler?: {
      nereden?: string;
      nereye?: string;
      gidisTarihi?: string;
      donusTarihi?: string;
      yolcu?: string;
      vize?: string;
      kategori?: string;
      aktarma?: string;
      maksimumFiyat?: string;
      siralama?: string;
    }
  ) {
    e?.preventDefault();

    const aktifNereden = ozelDegerler?.nereden ?? nereden;
    const aktifNereye = ozelDegerler?.nereye ?? nereye;
    const aktifGidis = ozelDegerler?.gidisTarihi ?? gidisTarihi;
    const aktifDonus = ozelDegerler?.donusTarihi ?? donusTarihi;
    const aktifYolcu = ozelDegerler?.yolcu ?? yolcu;
    const aktifVize = ozelDegerler?.vize ?? vize;
    const aktifKategori = ozelDegerler?.kategori ?? kategori;
    const aktifAktarma = ozelDegerler?.aktarma ?? aktarma;
    const aktifMaksimumFiyat = ozelDegerler?.maksimumFiyat ?? maksimumFiyat;
    const aktifSiralama = ozelDegerler?.siralama ?? siralama;

    setYukleniyor(true);
    setCanliYukleniyor(true);
    setHata("");
    setCanliHata("");
    setCanliUcuslar([]);

    const params = new URLSearchParams({
      nereden: aramaDegeriTemizle(aktifNereden),
      nereye: aramaDegeriTemizle(aktifNereye),
      gidis: aktifGidis,
      donus: aktifDonus,
      yolcu: aktifYolcu,
      vize: aktifVize,
      kategori: aktifKategori,
      aktarma: aktifAktarma,
      maksimumFiyat: aktifMaksimumFiyat,
      siralama: aktifSiralama,
    });

    try {
      const response = await fetch(`/api/arama?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Arama yapılamadı.");
      }

      setBiletler(data.biletler || []);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }

    if (aktifNereden && aktifNereye) {
      try {
        const canliResponse = await fetch(
          `/api/canli-ucuslar?${params.toString()}`,
          { cache: "no-store" }
        );

        const canliData = await canliResponse.json();

        if (!canliResponse.ok) {
          throw new Error(
            canliData.message || "Canlı uçuş verisi alınamadı."
          );
        }

        setCanliUcuslar(canliData.ucuslar || []);
        setCanliKaynak(canliData.kaynak || "Travelpayouts / Aviasales");
      } catch (error) {
        const mesaj =
          error instanceof Error
            ? error.message
            : "Canlı uçuş verisi alınamadı.";
        setCanliHata(mesaj);
      } finally {
        setCanliYukleniyor(false);
      }
    } else {
      setCanliYukleniyor(false);
      setCanliUcuslar([]);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const ilkNereden = params.get("nereden") || "";
    const ilkNereye = params.get("nereye") || "";
    const ilkGidis = params.get("gidis") || "";
    const ilkDonus = params.get("donus") || "";
    const ilkYolcu = params.get("yolcu") || "1";
    const ilkVize = params.get("vize") || "Tümü";
    const ilkKategori = params.get("kategori") || "Tümü";
    const ilkAktarma = params.get("aktarma") || "Tümü";
    const ilkMaksimumFiyat = params.get("maksimumFiyat") || "30000";
    const ilkSiralama = params.get("siralama") || "en-iyi";

    setNereden(ilkNereden);
    setNereye(ilkNereye);
    setGidisTarihi(ilkGidis);
    setDonusTarihi(ilkDonus);
    setYolcu(ilkYolcu);
    setVize(ilkVize);
    setKategori(ilkKategori);
    setAktarma(ilkAktarma);
    setMaksimumFiyat(ilkMaksimumFiyat);
    setSiralama(ilkSiralama);

    aramaYap(undefined, {
      nereden: ilkNereden,
      nereye: ilkNereye,
      gidisTarihi: ilkGidis,
      donusTarihi: ilkDonus,
      yolcu: ilkYolcu,
      vize: ilkVize,
      kategori: ilkKategori,
      aktarma: ilkAktarma,
      maksimumFiyat: ilkMaksimumFiyat,
      siralama: ilkSiralama,
    });
  }, []);

  async function satinAl(bilet: Bilet) {
    try {
      await fetch(`/api/biletler/${bilet.id}/click`, {
        method: "POST",
      });
    } catch {
      // Kullanıcı yönlendirmesi devam eder.
    }

    window.open(bilet.link, "_blank", "noopener,noreferrer");
  }

  function canliUcusAc(ucus: CanliUcus) {
    window.location.href = ucus.link;
  }

  async function fiyatAlarmiKur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setAlarmMesaji("");
    setHata("");

    if (!alarmEmail.trim()) {
      setAlarmMesaji("Lütfen e-posta adresini yaz.");
      return;
    }

    if (!nereden.trim() || !nereye.trim()) {
      setAlarmMesaji("Fiyat alarmı için nereden ve nereye alanlarını doldur.");
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

  function populerAramaYap(yeniNereden: string, yeniNereye: string) {
    setNereden(yeniNereden);
    setNereye(yeniNereye);

    aramaYap(undefined, {
      nereden: yeniNereden,
      nereye: yeniNereye,
    });
  }

  function temizle() {
    setNereden("");
    setNereye("");
    setGidisTarihi("");
    setDonusTarihi("");
    setYolcu("1");
    setVize("Tümü");
    setKategori("Tümü");
    setAktarma("Tümü");
    setMaksimumFiyat("30000");
    setSiralama("en-iyi");

    aramaYap(undefined, {
      nereden: "",
      nereye: "",
      gidisTarihi: "",
      donusTarihi: "",
      yolcu: "1",
      vize: "Tümü",
      kategori: "Tümü",
      aktarma: "Tümü",
      maksimumFiyat: "30000",
      siralama: "en-iyi",
    });
  }

  const istatistik = useMemo(() => {
    const enUcuz = biletler.length
      ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    const canliEnUcuz = canliUcuslar.length
      ? [...canliUcuslar].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    const vizesiz = biletler.filter((bilet) => bilet.vize === "Vizesiz").length;

    return {
      toplam: biletler.length,
      canliToplam: canliUcuslar.length,
      enUcuz,
      canliEnUcuz,
      vizesiz,
    };
  }, [biletler, canliUcuslar]);

  return (
    <main className="letsgo-page">
      <header className="letsgo-header">
        <div className="letsgo-container letsgo-header-inner">
          <a href="/" className="letsgo-logo">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
            <span className="letsgo-logo-title">Letsgo 2 Travel</span>
          </a>

          <nav className="letsgo-nav">
            <a href="/">Ana Sayfa</a>
            <a href="/arama">Uçuşlar</a>
            <a href="/admin/dashboard">Dashboard</a>
            <a href="/admin">Admin</a>
          </nav>

          <a href="#sonuclar" className="letsgo-header-cta">
            Sonuçlar
          </a>
        </div>
      </header>

      <section className="letsgo-hero">
        <div className="letsgo-container">
          <div className="letsgo-hero-grid">
            <div>
              <p className="letsgo-hero-badge">
                ✈️ Profesyonel uçuş arama
              </p>

              <h1 className="letsgo-hero-title">
                Ucuz uçuşları karşılaştır
              </h1>

              <p className="letsgo-hero-text">
                Şehir veya havalimanı seç, Letsgo fırsatlarını ve canlı partner
                fiyatlarını aynı ekranda gör.
              </p>
            </div>

            <div className="letsgo-plane-box">
              <div className="letsgo-hero-price">
                <p className="letsgo-hero-price-label">Canlı en ucuz</p>
                <p className="letsgo-hero-price-value">
                  {istatistik.canliEnUcuz ? istatistik.canliEnUcuz.fiyat : "—"}
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
                listId="arama-from-airports"
              />

              <SearchInput
                label="Nereye"
                value={nereye}
                onChange={setNereye}
                placeholder="Şehir veya havalimanı"
                listId="arama-to-airports"
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

            <datalist id="arama-from-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`from-${item}`} value={item} />
              ))}
            </datalist>

            <datalist id="arama-to-airports">
              {havalimaniSecenekleri.map((item) => (
                <option key={`to-${item}`} value={item} />
              ))}
            </datalist>

            <div className="letsgo-search-grid" style={{ marginTop: 12 }}>
              <div className="letsgo-field">
                <label>Vize</label>
                <select value={vize} onChange={(e) => setVize(e.target.value)}>
                  <option>Tümü</option>
                  <option>Vizesiz</option>
                  <option>Vizeli</option>
                </select>
              </div>

              <div className="letsgo-field">
                <label>Kategori</label>
                <select
                  value={kategori}
                  onChange={(e) => setKategori(e.target.value)}
                >
                  {kategoriler.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="letsgo-field">
                <label>Aktarma</label>
                <select
                  value={aktarma}
                  onChange={(e) => setAktarma(e.target.value)}
                >
                  <option>Tümü</option>
                  <option>Aktarmasız</option>
                  <option>1 Aktarma</option>
                  <option>Farketmez</option>
                </select>
              </div>

              <div className="letsgo-field">
                <label>Sıralama</label>
                <select
                  value={siralama}
                  onChange={(e) => setSiralama(e.target.value)}
                >
                  <option value="en-iyi">En iyi</option>
                  <option value="en-ucuz">En ucuz</option>
                  <option value="en-hizli">En hızlı</option>
                  <option value="populer">Popüler</option>
                </select>
              </div>

              <div className="letsgo-field">
                <label>Maksimum</label>
                <select
                  value={maksimumFiyat}
                  onChange={(e) => setMaksimumFiyat(e.target.value)}
                >
                  <option value="5000">5.000 TL</option>
                  <option value="10000">10.000 TL</option>
                  <option value="30000">30.000 TL</option>
                  <option value="50000">50.000 TL</option>
                  <option value="100000">100.000 TL</option>
                </select>
              </div>
            </div>

            <div className="letsgo-search-bottom">
              <label className="letsgo-checkbox-label">
                <input type="checkbox" defaultChecked />
                Havalimanlarını dahil et
              </label>

              <button
                disabled={yukleniyor || canliYukleniyor}
                className="letsgo-primary-button"
              >
                {yukleniyor || canliYukleniyor
                  ? "Aranıyor..."
                  : "Ucuz bilet ara →"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {populerAramalar.map((arama) => (
              <button
                key={`${arama.nereden}-${arama.nereye}`}
                onClick={() => populerAramaYap(arama.nereden, arama.nereye)}
                className="letsgo-secondary-button"
                style={{ padding: "10px 14px", fontSize: 13 }}
              >
                {aramaDegeriTemizle(arama.nereden)} →{" "}
                {aramaDegeriTemizle(arama.nereye)} · {arama.etiket}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div className="letsgo-stats-grid">
            <StatCard title="Letsgo sonuç" value={String(istatistik.toplam)} />
            <StatCard
              title="Canlı sonuç"
              value={String(istatistik.canliToplam)}
            />
            <StatCard
              title="Canlı en ucuz"
              value={istatistik.canliEnUcuz ? istatistik.canliEnUcuz.fiyat : "—"}
            />
            <StatCard
              title="Letsgo en ucuz"
              value={istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
            />
          </div>

          {hata && <p className="letsgo-message">{hata}</p>}
          {canliHata && <p className="letsgo-message">Canlı fiyat: {canliHata}</p>}
        </div>
      </section>

      <section id="sonuclar" className="letsgo-section">
        <div className="letsgo-container">
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 28 }}>
            <aside className="letsgo-card" style={{ padding: 22, height: "fit-content" }}>
              <h3 style={{ fontSize: 22, fontWeight: 950 }}>Filtre Özeti</h3>

              <div style={{ marginTop: 18, display: "grid", gap: 12, fontSize: 14 }}>
                <p><b>Nereden:</b> {nereden || "Tümü"}</p>
                <p><b>Nereye:</b> {nereye || "Tümü"}</p>
                <p><b>Gidiş:</b> {gidisTarihi || "Seçilmedi"}</p>
                <p><b>Dönüş:</b> {donusTarihi || "Seçilmedi"}</p>
                <p><b>Vize:</b> {vize}</p>
                <p><b>Kategori:</b> {kategori}</p>
                <p><b>Aktarma:</b> {aktarma}</p>
                <p><b>Yolcu:</b> {yolcu}</p>
              </div>

              <button
                onClick={temizle}
                className="letsgo-primary-button"
                style={{ width: "100%", marginTop: 20 }}
              >
                Temizle
              </button>

              <form onSubmit={fiyatAlarmiKur} className="letsgo-alert-form" style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 950, marginBottom: 10 }}>
                  Fiyat Alarmı
                </h3>

                <label>E-posta</label>
                <input
                  value={alarmEmail}
                  onChange={(e) => setAlarmEmail(e.target.value)}
                  type="email"
                  placeholder="ornek@mail.com"
                />

                <label>Maksimum fiyat</label>
                <input
                  value={alarmMaksimumFiyat}
                  onChange={(e) => setAlarmMaksimumFiyat(e.target.value)}
                  type="number"
                  placeholder="5000"
                />

                <button disabled={alarmYukleniyor}>
                  {alarmYukleniyor ? "Kaydediliyor..." : "Alarm Kur"}
                </button>

                {alarmMesaji && <p className="letsgo-message">{alarmMesaji}</p>}
              </form>
            </aside>

            <div style={{ display: "grid", gap: 44 }}>
              <section>
                <SectionHeader
                  eyebrow="Travelpayouts / Aviasales"
                  title="Canlı Uçuş Fiyatları"
                />

                <p style={{ marginBottom: 18, color: "#64748b", fontWeight: 700 }}>
                  {canliKaynak ||
                    "Canlı sonuçlar için nereden ve nereye alanlarını doldur."}
                </p>

                {canliYukleniyor ? (
                  <EmptyState title="Canlı fiyatlar aranıyor..." />
                ) : canliUcuslar.length === 0 ? (
                  <EmptyState title="Canlı uçuş sonucu bulunamadı" />
                ) : (
                  <div style={{ display: "grid", gap: 18 }}>
                    {canliUcuslar.map((ucus) => (
                      <CanliUcusCard
                        key={ucus.id}
                        ucus={ucus}
                        onOpen={() => canliUcusAc(ucus)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionHeader
                  eyebrow="Letsgo özel"
                  title="Letsgo Uçuş Fırsatları"
                />

                {yukleniyor ? (
                  <EmptyState title="Fırsatlar aranıyor..." />
                ) : biletler.length === 0 ? (
                  <EmptyState title="Sonuç bulunamadı" />
                ) : (
                  <div style={{ display: "grid", gap: 18 }}>
                    {biletler.map((bilet) => (
                      <BiletCard
                        key={bilet.id}
                        bilet={bilet}
                        onBuy={() => satinAl(bilet)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </section>
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
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="letsgo-section-header">
      <div>
        <p className="letsgo-eyebrow">{eyebrow}</p>
        <h2 className="letsgo-section-title">{title}</h2>
      </div>
    </div>
  );
}

function EmptyState({ title }: { title?: string }) {
  return (
    <div className="letsgo-empty">
      <h3 className="letsgo-empty-title">{title || "Henüz sonuç yok"}</h3>
      <p className="letsgo-empty-text">
        Farklı rota, tarih veya daha yüksek maksimum fiyat deneyebilirsin.
      </p>
    </div>
  );
}

function CanliUcusCard({
  ucus,
  onOpen,
}: {
  ucus: CanliUcus;
  onOpen: () => void;
}) {
  return (
    <article className="letsgo-card letsgo-hover">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px" }}>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="letsgo-badge">Canlı fiyat</span>
            <span className="letsgo-badge">{ucus.sinif}</span>
            <span className="letsgo-badge">{ucus.aktarma}</span>
          </div>

          <h3 style={{ marginTop: 16, fontSize: 26, fontWeight: 950 }}>
            {ucus.kalkisKodu} → {ucus.varisKodu}
          </h3>

          <p style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
            Gidiş: {ucus.gidisTarihi || "Tarih yok"}
            {ucus.donusTarihi ? ` · Dönüş: ${ucus.donusTarihi}` : ""}
          </p>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <MiniInfo label="Havayolu" value={ucus.havayolu} />
            <MiniInfo label="Aktarma" value={ucus.aktarma} />
            <MiniInfo label="Mesafe" value={ucus.mesafe} />
            <MiniInfo label="Kaynak" value="Aviasales" />
          </div>
        </div>

        <aside
          style={{
            background: "#061733",
            color: "white",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ color: "#cbd5e1", fontWeight: 800 }}>Canlı fiyat</p>
            <p style={{ marginTop: 6, fontSize: 36, fontWeight: 950 }}>
              {ucus.fiyat}
            </p>
          </div>

          <button onClick={onOpen} className="letsgo-yellow-button">
            Detayı Gör
          </button>
        </aside>
      </div>
    </article>
  );
}

function BiletCard({ bilet, onBuy }: { bilet: Bilet; onBuy: () => void }) {
  return (
    <article className="letsgo-card letsgo-hover">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px" }}>
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="letsgo-badge">
              {bilet.ulkeEmoji} {bilet.kategori}
            </span>
            <span className="letsgo-badge">{bilet.vize}</span>
            {bilet.oneCikan && <span className="letsgo-badge">Öne çıkan</span>}
          </div>

          <h3 style={{ marginTop: 16, fontSize: 26, fontWeight: 950 }}>
            {bilet.nereden} → {bilet.nereye}
          </h3>

          <p style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
            {bilet.ulke} · {bilet.tarih}
          </p>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <MiniInfo label="Havayolu" value={bilet.havayolu} />
            <MiniInfo label="Süre" value={bilet.sure} />
            <MiniInfo label="Aktarma" value={bilet.aktarma} />
            <MiniInfo label="Sağlayıcı" value={bilet.saglayici} />
          </div>
        </div>

        <aside
          style={{
            background: "#061733",
            color: "white",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ color: "#cbd5e1", fontWeight: 800 }}>Başlayan fiyat</p>
            <p style={{ marginTop: 6, fontSize: 36, fontWeight: 950 }}>
              {bilet.fiyat}
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={onBuy} className="letsgo-yellow-button">
              Satın Al
            </button>

            <a
              href={`/ucak-bileti/${bilet.detaySlug}`}
              className="letsgo-secondary-button"
            >
              Detay
            </a>
          </div>
        </aside>
      </div>
    </article>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 18, background: "#f1f5f9", padding: 14 }}>
      <p style={{ color: "#64748b", fontSize: 12, fontWeight: 950 }}>{label}</p>
      <p style={{ marginTop: 4, fontWeight: 900 }}>{value}</p>
    </div>
  );
}