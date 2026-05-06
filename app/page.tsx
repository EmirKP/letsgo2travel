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
  heroRozet: "Ucuz uçuş fırsatları",
  heroBaslik: "Ucuz uçuşları kolayca bul",
  heroAciklama:
    "Şehir veya havalimanı seç, fırsatları karşılaştır, partner arama kutusuyla güncel fiyatı kontrol et.",
  instagramTr: "https://www.instagram.com/letsgo2travel_tr/",
  instagramEn: "https://www.instagram.com/letsgo2travel_en/",
  whatsappLink: "",
  anaRenk: "#071A33",
  yanRenk1: "#2563EB",
  yanRenk2: "#FACC15",
  yanRenk3: "#10B981",
  koyuRenk: "#031126",
  arkaPlan: "#F4F7FB",
  kartRenk: "#FFFFFF",
  yaziRenk: "#071A33",
  butonYaziRenk: "#071A33",
  gununFirsatiGoster: true,
  kategorilerGoster: true,
  rehberlerGoster: true,
  fiyatAlarmGoster: true,
  sosyalMedyaGoster: true,
  sssGoster: true,
  footerMetni:
    "Letsgo 2 Travel, ucuz uçuş fırsatlarını ve partner fiyatlarını tek yerde takip etmene yardımcı olur.",
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

  if (kod?.[1]) {
    return kod[1];
  }

  return value.trim();
}

function fiyatYaz(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`;
}

export default function Home() {
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [ayarlar, setAyarlar] = useState<Required<SiteAyarlari>>(varsayilanAyarlar);
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

  function aramaYap(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const params = new URLSearchParams();

    if (nereden.trim()) {
      params.set("nereden", aramaDegeriTemizle(nereden));
    }

    if (nereye.trim()) {
      params.set("nereye", aramaDegeriTemizle(nereye));
    }

    if (gidisTarihi) {
      params.set("gidis", gidisTarihi);
    }

    if (donusTarihi) {
      params.set("donus", donusTarihi);
    }

    if (yolcu) {
      params.set("yolcu", yolcu);
    }

    window.location.href = `/arama?${params.toString()}`;
  }

  function populerRotaAra(kalkis: string, varis: string) {
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
      // Tıklanma kaydı başarısız olsa bile yönlendirme devam eder.
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

  const aktifBiletler = useMemo(() => {
    return biletler.filter((bilet) => bilet.aktif !== false);
  }, [biletler]);

  const gununFirsati = useMemo(() => {
    const oneCikan = aktifBiletler.find((bilet) => bilet.oneCikan);

    if (oneCikan) return oneCikan;

    return aktifBiletler.length
      ? [...aktifBiletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;
  }, [aktifBiletler]);

  const enUcuzlar = useMemo(() => {
    return [...aktifBiletler]
      .sort((a, b) => a.fiyatSayi - b.fiyatSayi)
      .slice(0, 6);
  }, [aktifBiletler]);

  const vizesizler = useMemo(() => {
    return aktifBiletler.filter((bilet) => bilet.vize === "Vizesiz").slice(0, 3);
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

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundColor: ayarlar.arkaPlan,
        color: ayarlar.yaziRenk,
      }}
    >
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel"
              className="h-12 w-auto"
            />

            <div>
              <h1 className="text-xl font-black tracking-tight">
                {ayarlar.siteBaslik}
              </h1>
              <p className="hidden text-sm font-semibold text-slate-500 sm:block">
                {ayarlar.siteAltBaslik}
              </p>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-black md:flex">
            <a href="/arama" className="hover:opacity-70">
              Uçuş Ara
            </a>
            <a href="#firsatlar" className="hover:opacity-70">
              Fırsatlar
            </a>
            <a href="#fiyat-alarmi" className="hover:opacity-70">
              Fiyat Alarmı
            </a>
            <a href="/admin/dashboard" className="hover:opacity-70">
              Admin
            </a>
          </nav>

          <a
            href="/arama"
            className="rounded-2xl px-5 py-3 text-sm font-black shadow-sm transition hover:scale-[1.02]"
            style={{
              backgroundColor: ayarlar.anaRenk,
              color: "#FFFFFF",
            }}
          >
            Ara
          </a>
        </div>
      </header>

      <section
        className="relative overflow-hidden px-5 py-12 text-white md:py-20"
        style={{
          background: `linear-gradient(135deg, ${ayarlar.anaRenk}, ${ayarlar.koyuRenk})`,
        }}
      >
        <div
          className="absolute -right-20 top-10 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: `${ayarlar.yanRenk1}44` }}
        />
        <div
          className="absolute -bottom-24 left-10 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: `${ayarlar.yanRenk2}33` }}
        />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <p
                className="inline-flex rounded-full px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor: ayarlar.yanRenk2,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                ✈️ {ayarlar.heroRozet}
              </p>

              <h2 className="mt-6 max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-7xl">
                {ayarlar.heroBaslik}
              </h2>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                {ayarlar.heroAciklama}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="/arama"
                  className="rounded-2xl px-6 py-4 font-black shadow-lg transition hover:scale-[1.02]"
                  style={{
                    backgroundColor: ayarlar.yanRenk2,
                    color: ayarlar.butonYaziRenk,
                  }}
                >
                  Uçuş Ara
                </a>

                <a
                  href="#firsatlar"
                  className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 font-black text-white backdrop-blur transition hover:bg-white hover:text-slate-950"
                >
                  Fırsatları Gör
                </a>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[1.5rem] bg-white p-6 text-slate-950">
                <p className="text-sm font-black text-slate-500">
                  Bugünün en iyi başlangıç fiyatı
                </p>

                <p className="mt-2 text-5xl font-black">
                  {istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
                </p>

                <p className="mt-3 text-sm font-bold text-slate-500">
                  {istatistik.enUcuz
                    ? `${istatistik.enUcuz.nereden} → ${istatistik.enUcuz.nereye}`
                    : "Fırsat eklenince burada görünür."}
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <HeroStat label="Fırsat" value={String(istatistik.toplam)} />
                  <HeroStat label="Vizesiz" value={String(istatistik.vizesiz)} />
                  <HeroStat label="Ülke" value={String(istatistik.ulkeSayisi)} />
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={aramaYap}
            className="relative z-10 mt-10 rounded-[2rem] bg-white p-4 text-slate-950 shadow-2xl md:p-5"
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className="rounded-2xl px-4 py-2 text-sm font-black text-white"
                style={{ backgroundColor: ayarlar.anaRenk }}
              >
                ✈️ Uçuş
              </span>

              <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">
                Otel yakında
              </span>

              <span className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-500">
                Araç yakında
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_170px_170px_130px]">
              <SearchInput
                label="Nereden"
                value={nereden}
                onChange={setNereden}
                placeholder="Şehir veya havalimanı"
                listId="anasayfa-nereden"
              />

              <SearchInput
                label="Nereye"
                value={nereye}
                onChange={setNereye}
                placeholder="Şehir veya havalimanı"
                listId="anasayfa-nereye"
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

              <div className="rounded-2xl border bg-slate-50 p-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Yolcu
                </label>

                <select
                  value={yolcu}
                  onChange={(e) => setYolcu(e.target.value)}
                  className="mt-1 w-full bg-transparent text-lg font-black outline-none"
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </div>
            </div>

            <datalist id="anasayfa-nereden">
              {havalimaniSecenekleri.map((secenek) => (
                <option key={`from-${secenek}`} value={secenek} />
              ))}
            </datalist>

            <datalist id="anasayfa-nereye">
              {havalimaniSecenekleri.map((secenek) => (
                <option key={`to-${secenek}`} value={secenek} />
              ))}
            </datalist>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {populerRotalar.map((rota) => (
                  <button
                    key={`${rota.nereden}-${rota.nereye}`}
                    type="button"
                    onClick={() => populerRotaAra(rota.nereden, rota.nereye)}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-950 hover:text-white"
                  >
                    {aramaDegeriTemizle(rota.nereden)} →{" "}
                    {aramaDegeriTemizle(rota.nereye)}
                  </button>
                ))}
              </div>

              <button
                className="rounded-2xl px-8 py-4 text-lg font-black shadow-lg transition hover:scale-[1.02]"
                style={{
                  backgroundColor: ayarlar.yanRenk2,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                Ucuz Bilet Ara
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard title="Aktif fırsat" value={yukleniyor ? "..." : String(istatistik.toplam)} />
          <MetricCard title="En ucuz" value={istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"} />
          <MetricCard title="Vizesiz rota" value={String(istatistik.vizesiz)} />
          <MetricCard title="Ülke sayısı" value={String(istatistik.ulkeSayisi)} />
        </div>
      </section>

      {ayarlar.gununFirsatiGoster && gununFirsati && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <div
            className="overflow-hidden rounded-[2rem] shadow-xl"
            style={{ backgroundColor: ayarlar.anaRenk }}
          >
            <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
              <div className="p-8 text-white md:p-10">
                <p
                  className="inline-block rounded-full px-4 py-2 text-sm font-black"
                  style={{
                    backgroundColor: ayarlar.yanRenk2,
                    color: ayarlar.butonYaziRenk,
                  }}
                >
                  🔥 Günün Fırsatı
                </p>

                <h2 className="mt-6 text-4xl font-black md:text-5xl">
                  {gununFirsati.nereden} → {gununFirsati.nereye}
                </h2>

                <p className="mt-3 text-lg text-slate-300">
                  {gununFirsati.ulkeEmoji} {gununFirsati.ulke} ·{" "}
                  {gununFirsati.tarih} · {gununFirsati.vize}
                </p>

                {gununFirsati.aciklama && (
                  <p className="mt-5 max-w-2xl leading-8 text-slate-300">
                    {gununFirsati.aciklama}
                  </p>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    onClick={() => satinAl(gununFirsati)}
                    className="rounded-2xl px-6 py-4 font-black transition hover:scale-[1.02]"
                    style={{
                      backgroundColor: ayarlar.yanRenk2,
                      color: ayarlar.butonYaziRenk,
                    }}
                  >
                    Satın Al
                  </button>

                  <a
                    href={`/ucak-bileti/${gununFirsati.detaySlug}`}
                    className="rounded-2xl border border-white/20 px-6 py-4 font-black text-white hover:bg-white hover:text-slate-950"
                  >
                    Detayları Gör
                  </a>
                </div>
              </div>

              <aside className="bg-white p-8">
                <p className="text-sm font-black text-slate-500">
                  Başlayan fiyat
                </p>

                <p className="mt-2 text-6xl font-black">
                  {gununFirsati.fiyat}
                </p>

                <div className="mt-6 grid gap-3 text-sm">
                  <InfoLine label="Havayolu" value={gununFirsati.havayolu} />
                  <InfoLine label="Süre" value={gununFirsati.sure} />
                  <InfoLine label="Bagaj" value={gununFirsati.bagaj} />
                  <InfoLine label="Son kontrol" value={gununFirsati.sonKontrol} />
                </div>
              </aside>
            </div>
          </div>
        </section>
      )}

      <section id="firsatlar" className="mx-auto max-w-7xl px-5 py-8">
        <SectionTitle
          eyebrow="Fırsatlar"
          title="Öne çıkan ucuz uçuşlar"
          link="/arama"
        />

        {enUcuzlar.length === 0 ? (
          <EmptyCard text="Henüz aktif fırsat yok." />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {enUcuzlar.map((bilet) => (
              <BiletKarti
                key={bilet.id}
                bilet={bilet}
                ayarlar={ayarlar}
                onSatinAl={satinAl}
              />
            ))}
          </div>
        )}
      </section>

      {vizesizler.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <SectionTitle
            eyebrow="Vizesiz"
            title="Vizesiz uçuş fırsatları"
            link="/arama?vize=Vizesiz"
          />

          <div className="grid gap-5 md:grid-cols-3">
            {vizesizler.map((bilet) => (
              <BiletKarti
                key={bilet.id}
                bilet={bilet}
                ayarlar={ayarlar}
                onSatinAl={satinAl}
              />
            ))}
          </div>
        </section>
      )}

      {ayarlar.fiyatAlarmGoster && (
        <section id="fiyat-alarmi" className="mx-auto max-w-7xl px-5 py-10">
          <div className="grid gap-6 overflow-hidden rounded-[2rem] bg-white p-8 shadow-xl lg:grid-cols-[1fr_380px] lg:items-center">
            <div>
              <p className="font-black" style={{ color: ayarlar.yanRenk3 }}>
                Fiyat Alarmı
              </p>

              <h2 className="mt-2 text-3xl font-black">
                Fiyat düşünce fırsatı kaçırma
              </h2>

              <p className="mt-3 max-w-3xl leading-8 text-slate-600">
                Nereden ve nereye alanlarını doldur, hedef fiyatını yaz.
                Talebin admin paneline düşer.
              </p>
            </div>

            <form
              onSubmit={fiyatAlarmiKur}
              className="rounded-3xl bg-slate-100 p-5"
            >
              <label className="text-sm font-black text-slate-500">
                E-posta adresin
              </label>

              <input
                value={alarmEmail}
                onChange={(e) => setAlarmEmail(e.target.value)}
                type="email"
                placeholder="ornek@mail.com"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
              />

              <label className="mt-4 block text-sm font-black text-slate-500">
                Maksimum fiyat
              </label>

              <input
                value={alarmMaksimumFiyat}
                onChange={(e) => setAlarmMaksimumFiyat(e.target.value)}
                type="number"
                placeholder="3000"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-blue-500"
              />

              <button
                disabled={alarmYukleniyor}
                className="mt-4 w-full rounded-xl px-4 py-3 font-black text-white disabled:opacity-60"
                style={{
                  backgroundColor: ayarlar.yanRenk3,
                }}
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
            icon="🔍"
            title="Kolay arama"
            text="Şehir veya havalimanı seçerek hızlıca rota oluştur."
          />
          <FeatureCard
            icon="💸"
            title="Fiyat karşılaştır"
            text="Letsgo fırsatları ve canlı partner fiyatlarını birlikte kontrol et."
          />
          <FeatureCard
            icon="🔔"
            title="Fiyat alarmı"
            text="Hedef fiyatını belirle, fırsat düşünce takip et."
          />
        </div>
      </section>

      <footer
        className="mt-10 px-5 py-10 text-white"
        style={{ backgroundColor: ayarlar.anaRenk }}
      >
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_280px]">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Letsgo 2 Travel"
                className="h-14 w-auto"
              />

              <div>
                <h2 className="text-xl font-black">{ayarlar.siteBaslik}</h2>
                <p className="text-sm text-slate-400">
                  {ayarlar.siteAltBaslik}
                </p>
              </div>
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">
              {ayarlar.footerMetni}
            </p>

            <p className="mt-3 text-xs text-slate-500">
              Bilet fiyatları değişebilir. Satın almadan önce son fiyatı,
              bagaj şartlarını ve müsaitliği kontrol edin.
            </p>
          </div>

          <div>
            <p className="font-black">Hızlı Bağlantılar</p>

            <div className="mt-4 grid gap-3 text-sm font-bold text-slate-300">
              <a href="/arama">Uçuş Ara</a>
              <a href="/admin/dashboard">Admin Dashboard</a>
              <a href="/admin">Bilet Admin</a>
              <a href="/admin/ayarlar">Site Ayarları</a>
              <a href="/admin/fiyat-alarmlari">Fiyat Alarmları</a>
            </div>
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
    <div className="rounded-2xl border bg-slate-50 p-3">
      <label className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
    <div className="rounded-2xl border bg-slate-50 p-3">
      <label className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="date"
        className="mt-1 w-full bg-transparent text-base font-black outline-none"
      />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-4 text-center">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/70 bg-white p-6 shadow-sm">
      <p className="text-sm font-black text-slate-500">{title}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-black">{label}:</span> {value}
    </p>
  );
}

function SectionTitle({
  eyebrow,
  title,
  link,
}: {
  eyebrow: string;
  title: string;
  link?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="font-black text-blue-600">{eyebrow}</p>
        <h2 className="text-3xl font-black tracking-tight">{title}</h2>
      </div>

      {link && (
        <a href={link} className="hidden font-black text-slate-600 md:block">
          Tümünü gör →
        </a>
      )}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-white p-10 text-center shadow">
      <p className="font-black">{text}</p>
    </div>
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
    <div className="rounded-[1.5rem] border border-slate-200/70 bg-white p-6 shadow-sm">
      <p className="text-3xl">{icon}</p>
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="mt-2 leading-7 text-slate-500">{text}</p>
    </div>
  );
}

function BiletKarti({
  bilet,
  ayarlar,
  onSatinAl,
}: {
  bilet: Bilet;
  ayarlar: Required<SiteAyarlari>;
  onSatinAl: (bilet: Bilet) => void;
}) {
  return (
    <article
      className="group overflow-hidden rounded-[1.7rem] border border-slate-200/70 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{ backgroundColor: ayarlar.kartRenk }}
    >
      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-black"
            style={{
              backgroundColor: `${ayarlar.yanRenk2}33`,
              color: ayarlar.yaziRenk,
            }}
          >
            {bilet.ulkeEmoji} {bilet.kategori}
          </span>

          <span
            className="rounded-full px-3 py-1 text-xs font-black text-white"
            style={{
              backgroundColor:
                bilet.vize === "Vizesiz" ? ayarlar.yanRenk3 : ayarlar.yanRenk1,
            }}
          >
            {bilet.vize}
          </span>

          {bilet.oneCikan && (
            <span
              className="rounded-full px-3 py-1 text-xs font-black text-white"
              style={{ backgroundColor: ayarlar.anaRenk }}
            >
              Öne çıkan
            </span>
          )}
        </div>

        <h3 className="mt-5 text-2xl font-black tracking-tight">
          {bilet.nereden} → {bilet.nereye}
        </h3>

        <p className="mt-1 text-sm font-semibold text-slate-500">
          {bilet.ulke} · {bilet.tarih}
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            Başlayan fiyat
          </p>

          <p className="mt-1 text-4xl font-black">{bilet.fiyat}</p>
        </div>

        <div className="mt-5 grid gap-2 text-sm">
          <InfoLine label="Havayolu" value={bilet.havayolu} />
          <InfoLine label="Süre" value={bilet.sure} />
          <InfoLine label="Bagaj" value={bilet.bagaj} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => onSatinAl(bilet)}
            className="rounded-2xl px-4 py-3 font-black transition hover:scale-[1.02]"
            style={{
              backgroundColor: ayarlar.yanRenk2,
              color: ayarlar.butonYaziRenk,
            }}
          >
            Satın Al
          </button>

          <a
            href={`/ucak-bileti/${bilet.detaySlug}`}
            className="rounded-2xl border px-4 py-3 text-center font-black transition hover:bg-slate-950 hover:text-white"
            style={{
              borderColor: `${ayarlar.anaRenk}33`,
              color: ayarlar.anaRenk,
            }}
          >
            Detay
          </a>
        </div>
      </div>
    </article>
  );
}