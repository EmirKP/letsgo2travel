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
  siteBaslik: string;
  siteAltBaslik: string;

  heroRozet: string;
  heroBaslik: string;
  heroAciklama: string;

  instagramTr: string;
  instagramEn: string;
  whatsappLink: string;

  temaAdi: string;

  anaRenk: string;
  yanRenk1: string;
  yanRenk2: string;
  yanRenk3: string;

  koyuRenk: string;
  arkaPlan: string;
  kartRenk: string;
  yaziRenk: string;
  butonYaziRenk: string;

  gununFirsatiGoster: boolean;
  kategorilerGoster: boolean;
  rehberlerGoster: boolean;
  fiyatAlarmGoster: boolean;
  sosyalMedyaGoster: boolean;
  sssGoster: boolean;

  footerMetni: string;
};

const varsayilanAyarlar: SiteAyarlari = {
  siteBaslik: "Letsgo 2 Travel",
  siteAltBaslik: "Ucuz uçak bileti fırsatları",

  heroRozet: "Güncel uçuş fırsatları",
  heroBaslik: "Ucuz uçak bileti fırsatlarını tek yerde keşfet",
  heroAciklama:
    "Yurt içi ve yurt dışı uygun fiyatlı uçuşları takip et. Fırsatı gör, karşılaştır ve satın alma sayfasına yönlen.",

  instagramTr: "https://www.instagram.com/letsgo2travel_tr/",
  instagramEn: "https://www.instagram.com/letsgo2travel_en/",
  whatsappLink: "",

  temaAdi: "Profesyonel Uçuş",

  anaRenk: "#0B1F3A",
  yanRenk1: "#2563EB",
  yanRenk2: "#FACC15",
  yanRenk3: "#10B981",

  koyuRenk: "#07182E",
  arkaPlan: "#F4F7FB",
  kartRenk: "#FFFFFF",
  yaziRenk: "#0B1F3A",
  butonYaziRenk: "#0B1F3A",

  gununFirsatiGoster: true,
  kategorilerGoster: true,
  rehberlerGoster: true,
  fiyatAlarmGoster: true,
  sosyalMedyaGoster: true,
  sssGoster: true,

  footerMetni:
    "Ucuz uçak bileti fırsatlarını paylaşan bağımsız fırsat platformu.",
};

const populerRotalar = [
  { nereden: "İstanbul", nereye: "Roma", etiket: "Avrupa" },
  { nereden: "İstanbul", nereye: "Saraybosna", etiket: "Vizesiz" },
  { nereden: "Ankara", nereye: "Bakü", etiket: "Yakın rota" },
  { nereden: "İstanbul", nereye: "Paris", etiket: "Popüler" },
];

const kategoriSirasi = [
  "Vizesiz",
  "Avrupa",
  "Balkan",
  "Hafta Sonu",
  "Yaz Tatili",
  "En Ucuz",
  "Genel",
];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat || 0)} TL`;
}

export default function Home() {
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [ayarlar, setAyarlar] = useState<SiteAyarlari>(varsayilanAyarlar);
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

        if (biletData.biletler) {
          setBiletler(biletData.biletler);
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
        }
      } catch {
        setBiletler([]);
      } finally {
        setYukleniyor(false);
      }
    }

    yukle();
  }, []);

  function aramaYap(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    const params = new URLSearchParams();

    if (nereden) params.set("nereden", nereden);
    if (nereye) params.set("nereye", nereye);
    if (gidisTarihi) params.set("gidis", gidisTarihi);
    if (donusTarihi) params.set("donus", donusTarihi);
    if (yolcu) params.set("yolcu", yolcu);

    window.location.href = `/arama?${params.toString()}`;
  }

  function populerRotaAra(kalkis: string, varis: string) {
    const params = new URLSearchParams({
      nereden: kalkis,
      nereye: varis,
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
          nereden,
          nereye,
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

  const gununFirsati = useMemo(() => {
    const oneCikan = biletler.find((bilet) => bilet.oneCikan);

    if (oneCikan) return oneCikan;

    return biletler.length
      ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;
  }, [biletler]);

  const enUcuzlar = useMemo(() => {
    return [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi).slice(0, 6);
  }, [biletler]);

  const vizesizler = useMemo(() => {
    return biletler.filter((bilet) => bilet.vize === "Vizesiz").slice(0, 6);
  }, [biletler]);

  const kategoriGruplari = useMemo(() => {
    return kategoriSirasi
      .map((kategori) => ({
        kategori,
        biletler: biletler
          .filter((bilet) => bilet.kategori === kategori)
          .slice(0, 4),
      }))
      .filter((grup) => grup.biletler.length > 0);
  }, [biletler]);

  const istatistik = useMemo(() => {
    const enUcuz = biletler.length
      ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    return {
      toplam: biletler.length,
      enUcuz,
      vizesiz: biletler.filter((bilet) => bilet.vize === "Vizesiz").length,
      ulkeSayisi: new Set(biletler.map((bilet) => bilet.ulke)).size,
    };
  }, [biletler]);

  function BiletKarti({ bilet }: { bilet: Bilet }) {
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
                className="rounded-full px-3 py-1 text-xs font-black"
                style={{
                  backgroundColor: ayarlar.anaRenk,
                  color: "#ffffff",
                }}
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
              onClick={() => satinAl(bilet)}
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

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundColor: ayarlar.arkaPlan,
        color: ayarlar.yaziRenk,
      }}
    >
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-950/5 p-2">
              <img
                src="/logo.png"
                alt="Letsgo 2 Travel Logo"
                className="h-12 w-auto"
              />
            </div>

            <div>
              <h1 className="text-xl font-black tracking-tight">
                {ayarlar.siteBaslik}
              </h1>
              <p className="text-sm font-semibold text-slate-500">
                {ayarlar.siteAltBaslik}
              </p>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-black md:flex">
            <a href="/" style={{ color: ayarlar.anaRenk }}>
              Ana Sayfa
            </a>
            <a href="/arama" className="hover:opacity-70">
              Uçuş Ara
            </a>
            <a href={ayarlar.instagramTr} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a
              href="/admin/dashboard"
              className="rounded-full bg-slate-950 px-4 py-2 text-white"
            >
              Admin
            </a>
          </nav>
        </div>
      </header>

      <section
        className="relative overflow-hidden px-5 pb-16 pt-12 text-white md:pb-24 md:pt-20"
        style={{
          background: `radial-gradient(circle at top left, ${ayarlar.yanRenk1}55, transparent 35%), linear-gradient(135deg, ${ayarlar.anaRenk}, ${ayarlar.koyuRenk})`,
        }}
      >
        <div className="absolute -right-24 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 left-20 h-72 w-72 rounded-full bg-yellow-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <p
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black shadow-lg"
                style={{
                  backgroundColor: ayarlar.yanRenk2,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                <span>✈️</span>
                {ayarlar.heroRozet}
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
              <img
                src="/logo.png"
                alt="Letsgo 2 Travel"
                className="mx-auto h-36 w-auto"
              />

              <div className="mt-6 rounded-[1.5rem] bg-slate-950/70 p-5">
                <p className="font-black" style={{ color: ayarlar.yanRenk2 }}>
                  Aracı uçuş fırsat platformu
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Senin özel fırsatların, canlı cache fiyatlar ve partner arama
                  kutusu tek deneyimde birleşir.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <MiniPill label="Ara" color={ayarlar.yanRenk1} />
                  <MiniPill label="Fırsat" color={ayarlar.yanRenk2} dark />
                  <MiniPill label="Alarm" color={ayarlar.yanRenk3} />
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={aramaYap}
            className="relative z-10 mt-10 rounded-[2rem] border border-white/10 bg-white p-4 text-slate-950 shadow-2xl md:p-5"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_170px_170px_120px]">
              <SearchInput
                label="Nereden?"
                value={nereden}
                onChange={setNereden}
                placeholder="İstanbul, Ankara..."
              />

              <SearchInput
                label="Nereye?"
                value={nereye}
                onChange={setNereye}
                placeholder="Roma, Paris, Bakü..."
              />

              <DateInput label="Gidiş" value={gidisTarihi} onChange={setGidisTarihi} />
              <DateInput label="Dönüş" value={donusTarihi} onChange={setDonusTarihi} />

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

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {populerRotalar.map((rota) => (
                  <button
                    key={`${rota.nereden}-${rota.nereye}`}
                    type="button"
                    onClick={() => populerRotaAra(rota.nereden, rota.nereye)}
                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-950 hover:text-white"
                  >
                    {rota.nereden} → {rota.nereye}
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
          <MetricCard title="En ucuz fiyat" value={istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"} />
          <MetricCard title="Vizesiz rota" value={String(istatistik.vizesiz)} color={ayarlar.yanRenk3} />
          <MetricCard title="Ülke sayısı" value={String(istatistik.ulkeSayisi)} color={ayarlar.yanRenk1} />
        </div>
      </section>

      {ayarlar.gununFirsatiGoster && gununFirsati && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <div
            className="overflow-hidden rounded-[2rem] shadow-2xl"
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
          eyebrow="En ucuzlar"
          title="Öne çıkan ucuz uçuşlar"
          link="/arama"
          color={ayarlar.yanRenk1}
        />

        {enUcuzlar.length === 0 ? (
          <EmptyCard text="Henüz aktif fırsat yok." />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {enUcuzlar.map((bilet) => (
              <BiletKarti key={bilet.id} bilet={bilet} />
            ))}
          </div>
        )}
      </section>

      {vizesizler.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-8">
          <SectionTitle
            eyebrow="Vizesiz"
            title="Vizesiz uçuş fırsatları"
            color={ayarlar.yanRenk3}
          />

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {vizesizler.map((bilet) => (
              <BiletKarti key={bilet.id} bilet={bilet} />
            ))}
          </div>
        </section>
      )}

      {ayarlar.kategorilerGoster &&
        kategoriGruplari.map((grup) => (
          <section key={grup.kategori} className="mx-auto max-w-7xl px-5 py-8">
            <SectionTitle
              eyebrow="Kategori"
              title={`${grup.kategori} fırsatları`}
              link={`/arama?kategori=${encodeURIComponent(grup.kategori)}`}
              color={ayarlar.yanRenk1}
            />

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {grup.biletler.map((bilet) => (
                <BiletKarti key={bilet.id} bilet={bilet} />
              ))}
            </div>
          </section>
        ))}

      {ayarlar.fiyatAlarmGoster && (
        <section className="mx-auto max-w-7xl px-5 py-10">
          <div className="grid gap-6 overflow-hidden rounded-[2rem] bg-white p-8 shadow-xl lg:grid-cols-[1fr_380px] lg:items-center">
            <div>
              <p className="font-black" style={{ color: ayarlar.yanRenk3 }}>
                Fiyat Alarmı
              </p>
              <h2 className="mt-2 text-3xl font-black">
                Uçuş fiyatı düşünce takip etmek için alarm kur
              </h2>
              <p className="mt-3 max-w-3xl leading-8 text-slate-600">
                Nereden ve nereye alanlarını üstte doldur, hedef fiyatını yaz.
                Talep admin paneline düşer.
              </p>
            </div>

            <form onSubmit={fiyatAlarmiKur} className="rounded-3xl bg-slate-100 p-5">
              <label className="text-sm font-black text-slate-500">
                E-posta adresin
              </label>
              <input
                value={alarmEmail}
                onChange={(e) => setAlarmEmail(e.target.value)}
                type="email"
                placeholder="ornek@mail.com"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
              />

              <label className="mt-4 block text-sm font-black text-slate-500">
                Maksimum fiyat
              </label>
              <input
                value={alarmMaksimumFiyat}
                onChange={(e) => setAlarmMaksimumFiyat(e.target.value)}
                type="number"
                placeholder="3000"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none"
              />

              <button
                disabled={alarmYukleniyor}
                className="mt-4 w-full rounded-xl px-4 py-3 font-black disabled:opacity-60"
                style={{
                  backgroundColor: ayarlar.yanRenk3,
                  color: "#ffffff",
                }}
              >
                {alarmYukleniyor ? "Kaydediliyor..." : "Fiyat Alarmı Kur"}
              </button>

              {alarmMesaji && (
                <p
                  className="mt-3 rounded-xl p-3 text-sm font-bold text-white"
                  style={{ backgroundColor: ayarlar.yanRenk3 }}
                >
                  {alarmMesaji}
                </p>
              )}
            </form>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="grid gap-5 md:grid-cols-3">
          <FeatureCard icon="🔍" title="Ara" text="Nereden, nereye ve tarih bilgilerini girerek fırsatları keşfet." />
          <FeatureCard icon="💸" title="Karşılaştır" text="En ucuz, en iyi ve popüler fırsatları tek ekranda gör." />
          <FeatureCard icon="✈️" title="Yönlen" text="Fırsatı seç, detayları kontrol et ve partner tarafında aramaya devam et." />
        </div>
      </section>

      <footer
        className="mt-10 px-5 py-10 text-white"
        style={{ backgroundColor: ayarlar.anaRenk }}
      >
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_300px]">
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
              Bilet fiyatları değişebilir. Satın almadan önce son fiyatı ve
              bagaj şartlarını kontrol edin.
            </p>
          </div>

          <div>
            <p className="font-black">Bağlantılar</p>

            <div className="mt-4 grid gap-3 text-sm font-bold text-slate-300">
              <a href="/arama">Uçuş Ara</a>
              <a href={ayarlar.instagramTr} target="_blank" rel="noreferrer">
                Instagram TR
              </a>
              <a href={ayarlar.instagramEn} target="_blank" rel="noreferrer">
                Instagram EN
              </a>
              <a href="/admin/dashboard">Admin Dashboard</a>
              <a href="/admin">Bilet Admin</a>
              <a href="/admin/fiyat-alarmlari">Fiyat Alarmları</a>
              <a href="/admin/ayarlar">Site Ayarları</a>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
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

function MetricCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/70 bg-white p-6 shadow-sm">
      <p className="text-sm font-black text-slate-500">{title}</p>
      <p className="mt-2 text-4xl font-black" style={{ color }}>
        {value}
      </p>
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

function MiniPill({
  label,
  color,
  dark,
}: {
  label: string;
  color: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 text-center text-sm font-black ${
        dark ? "text-slate-950" : "text-white"
      }`}
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  link,
  color,
}: {
  eyebrow: string;
  title: string;
  link?: string;
  color: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between">
      <div>
        <p className="font-black" style={{ color }}>
          {eyebrow}
        </p>
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
      <p className="mt-2 text-slate-500">{text}</p>
    </div>
  );
}