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

function formatFiyat(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`;
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
    } catch {}

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
      setAlarmMesaji("Fiyat alarmı için önce nereden ve nereye alanlarını doldur.");
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
    <main
      className="min-h-screen"
      style={{
        backgroundColor: ayarlar.arkaPlan,
        color: ayarlar.yaziRenk,
      }}
    >
      <header
        className="sticky top-0 z-50 border-b border-white/10 text-white"
        style={{ backgroundColor: ayarlar.anaRenk }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Letsgo 2 Travel" className="h-12 w-auto" />
            <span className="text-xl font-black tracking-tight">
              {ayarlar.siteBaslik}
            </span>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-black md:flex">
            <a href="/arama" className="text-white/90 hover:text-white">
              Uçuşlar
            </a>
            <a href="#firsatlar" className="text-white/90 hover:text-white">
              Fırsatlar
            </a>
            <a href="#populer-rotalar" className="text-white/90 hover:text-white">
              Rotalar
            </a>
            <a href="#fiyat-alarmi" className="text-white/90 hover:text-white">
              Fiyat Alarmı
            </a>
            <a href="/admin/dashboard" className="text-white/90 hover:text-white">
              Admin
            </a>
          </nav>

          <a
            href="/arama"
            className="rounded-xl px-5 py-3 text-sm font-black shadow-lg transition hover:scale-[1.02]"
            style={{
              backgroundColor: ayarlar.yanRenk1,
              color: "#FFFFFF",
            }}
          >
            Uçuş Ara
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-sky-100 via-white to-white px-5 pb-16 pt-12">
        <div className="absolute right-0 top-0 hidden h-[360px] w-[55%] rounded-bl-[5rem] bg-gradient-to-br from-sky-200 via-blue-100 to-white lg:block" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_520px] lg:items-center">
            <div className="pt-4">
              <p
                className="inline-flex rounded-full px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor: `${ayarlar.yanRenk1}18`,
                  color: ayarlar.yanRenk1,
                }}
              >
                {ayarlar.heroRozet}
              </p>

              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
                {ayarlar.heroBaslik}
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                {ayarlar.heroAciklama}
              </p>
            </div>

            <div className="relative hidden min-h-[260px] lg:block">
              <div className="absolute inset-0 rounded-[2rem] bg-white/40 backdrop-blur" />

              <div className="absolute right-8 top-10 text-[180px] leading-none drop-shadow-2xl">
                ✈️
              </div>

              <div className="absolute bottom-8 right-8 rounded-3xl bg-white/90 p-5 shadow-xl backdrop-blur">
                <p className="text-sm font-black text-slate-500">
                  En ucuz başlangıç
                </p>
                <p className="mt-1 text-4xl font-black">
                  {istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={aramaYap}
            className="relative z-10 mt-10 rounded-[2rem] bg-white p-5 shadow-2xl ring-1 ring-slate-200"
          >
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span
                className="rounded-xl px-5 py-3 text-sm font-black text-white"
                style={{ backgroundColor: ayarlar.anaRenk }}
              >
                ✈️ Uçuş
              </span>

              <span className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-500">
                🏨 Otel
              </span>

              <span className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-500">
                🚗 Araç
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_170px_170px_130px]">
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

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Yolcu
                </label>

                <select
                  value={yolcu}
                  onChange={(event) => setYolcu(event.target.value)}
                  className="mt-1 w-full bg-transparent text-lg font-black outline-none"
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

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <input type="checkbox" defaultChecked className="h-4 w-4" />
                Havalimanlarını dahil et
              </label>

              <button
                className="rounded-2xl px-8 py-4 text-lg font-black shadow-lg transition hover:scale-[1.02]"
                style={{
                  backgroundColor: ayarlar.anaRenk,
                  color: "#FFFFFF",
                }}
              >
                Uçuş ara →
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Aktif fırsat" value={yukleniyor ? "..." : String(istatistik.toplam)} />
          <StatCard title="En ucuz fiyat" value={istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"} />
          <StatCard title="Vizesiz rota" value={String(istatistik.vizesiz)} />
          <StatCard title="Ülke sayısı" value={String(istatistik.ulkeSayisi)} />
        </div>
      </section>

      <section id="firsatlar" className="mx-auto max-w-7xl px-5 py-8">
        <SectionHeader
          eyebrow="Bugünün fırsatları"
          title="Sınırlı süreli ucuz uçuşlar"
          href="/arama"
        />

        {bugununFirsatlari.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {bugununFirsatlari.map((bilet) => (
              <DealCard
                key={bilet.id}
                bilet={bilet}
                onSatinAl={() => satinAl(bilet)}
              />
            ))}
          </div>
        )}
      </section>

      <section id="populer-rotalar" className="mx-auto max-w-7xl px-5 py-8">
        <SectionHeader eyebrow="Popüler rotalar" title="En çok aranan uçuş rotaları" />

        <div className="grid gap-3 md:grid-cols-4">
          {populerRotalar.map((rota) => (
            <button
              key={`${rota.nereden}-${rota.nereye}`}
              onClick={() => rotaAra(rota.nereden, rota.nereye)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <p className="font-black">
                {aramaDegeriTemizle(rota.nereden)} → {aramaDegeriTemizle(rota.nereye)}
              </p>
              <p className="mt-1 text-sm text-slate-500">{rota.aciklama}</p>
            </button>
          ))}
        </div>
      </section>

      {populerFirsatlar.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <SectionHeader
            eyebrow="Öne çıkan"
            title="Kullanıcıların ilgilendiği fırsatlar"
            href="/arama"
          />

          <div className="grid gap-4 md:grid-cols-5">
            {populerFirsatlar.map((bilet) => (
              <button
                key={bilet.id}
                onClick={() => satinAl(bilet)}
                className="rounded-2xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <p className="font-black">
                  {bilet.nereden} → {bilet.nereye}
                </p>
                <p className="mt-1 text-sm text-slate-500">{bilet.ulke}</p>
                <p className="mt-3 text-2xl font-black">{bilet.fiyat}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {ayarlar.fiyatAlarmGoster && (
        <section id="fiyat-alarmi" className="mx-auto max-w-7xl px-5 py-10">
          <div className="grid gap-6 rounded-[2rem] bg-white p-8 shadow-xl lg:grid-cols-[1fr_380px] lg:items-center">
            <div>
              <p className="font-black" style={{ color: ayarlar.yanRenk3 }}>
                Fiyat Alarmı
              </p>

              <h2 className="mt-2 text-3xl font-black">
                Fiyat düşünce fırsatı kaçırma
              </h2>

              <p className="mt-3 max-w-3xl leading-8 text-slate-600">
                Nereden ve nereye alanlarını doldur, hedef fiyatını yaz. Talep
                admin paneline düşer.
              </p>
            </div>

            <form onSubmit={fiyatAlarmiKur} className="rounded-3xl bg-slate-100 p-5">
              <label className="text-sm font-black text-slate-500">
                E-posta adresin
              </label>

              <input
                value={alarmEmail}
                onChange={(event) => setAlarmEmail(event.target.value)}
                type="email"
                placeholder="ornek@mail.com"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
              />

              <label className="mt-4 block text-sm font-black text-slate-500">
                Maksimum fiyat
              </label>

              <input
                value={alarmMaksimumFiyat}
                onChange={(event) => setAlarmMaksimumFiyat(event.target.value)}
                type="number"
                placeholder="3000"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
              />

              <button
                disabled={alarmYukleniyor}
                className="mt-4 w-full rounded-xl px-4 py-3 font-black text-white disabled:opacity-60"
                style={{ backgroundColor: ayarlar.yanRenk3 }}
              >
                {alarmYukleniyor ? "Kaydediliyor..." : "Fiyat Alarmı Kur"}
              </button>

              {alarmMesaji && (
                <p className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-slate-700">
                  {alarmMesaji}
                </p>
              )}
            </form>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="grid gap-5 md:grid-cols-3">
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
      </section>

      <footer className="mt-10 px-5 py-12 text-white" style={{ backgroundColor: ayarlar.anaRenk }}>
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1fr_220px_220px_320px]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Letsgo 2 Travel" className="h-14 w-auto" />
              <h2 className="text-xl font-black">{ayarlar.siteBaslik}</h2>
            </div>

            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              {ayarlar.footerMetni}
            </p>
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
            <p className="font-black">Bilgilendirme</p>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              Bilet fiyatları değişebilir. Satın almadan önce son fiyatı, bagaj
              şartlarını ve müsaitliği partner sitede kontrol edin.
            </p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-slate-300">
              <span className="rounded-full bg-white/10 px-3 py-2">
                Güvenli bağlantı
              </span>
              <span className="rounded-full bg-white/10 px-3 py-2">
                Partner fiyatları
              </span>
              <span className="rounded-full bg-white/10 px-3 py-2">
                Fiyat alarmı
              </span>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-sm text-slate-500">
          © 2026 Letsgo 2 Travel. Tüm hakları saklıdır.
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <label className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        list={listId}
        className="mt-1 w-full bg-transparent text-lg font-black outline-none placeholder:text-slate-300"
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <label className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        className="mt-1 w-full bg-transparent text-base font-black outline-none"
      />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-black text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
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
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="font-black text-blue-600">{eyebrow}</p>
        <h2 className="text-3xl font-black tracking-tight">{title}</h2>
      </div>

      {href && (
        <a href={href} className="hidden font-black text-blue-600 md:block">
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
    <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
      <div className="h-32 bg-gradient-to-br from-sky-100 via-white to-blue-100 p-4">
        <div className="flex h-full items-end justify-between">
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-700 shadow">
            {bilet.ulkeEmoji} {bilet.ulke}
          </span>

          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-700 shadow">
            {bilet.vize}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">
              {bilet.nereden} → {bilet.nereye}
            </h3>

            <p className="mt-1 text-sm font-semibold text-slate-500">
              {bilet.tarih}
            </p>
          </div>

          <p className="text-right text-2xl font-black">{bilet.fiyat}</p>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-600">
          <p>
            <span className="font-black">Havayolu:</span> {bilet.havayolu}
          </p>
          <p>
            <span className="font-black">Süre:</span> {bilet.sure}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onSatinAl}
            className="rounded-xl bg-yellow-400 px-4 py-3 font-black text-slate-950 hover:bg-yellow-300"
          >
            Satın Al
          </button>

          <a
            href={`/ucak-bileti/${bilet.detaySlug}`}
            className="rounded-xl border border-slate-200 px-4 py-3 text-center font-black hover:bg-slate-950 hover:text-white"
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
    <div className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
        {icon}
      </div>

      <h3 className="mt-5 text-xl font-black">{title}</h3>
      <p className="mt-2 leading-7 text-slate-500">{text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
      <h3 className="text-2xl font-black">Henüz fırsat yok</h3>
      <p className="mt-2 text-slate-500">
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
      <p className="font-black">{title}</p>

      <div className="mt-4 grid gap-3 text-sm font-bold text-slate-400">
        {links.map(([label, href]) => (
          <a key={label} href={href} className="hover:text-white">
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}