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
        className="rounded-3xl p-5 shadow transition hover:-translate-y-1 hover:shadow-2xl"
        style={{ backgroundColor: ayarlar.kartRenk }}
      >
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

        <h3 className="mt-4 text-2xl font-black">
          {bilet.nereden} → {bilet.nereye}
        </h3>

        <p className="mt-1 text-sm text-slate-500">
          {bilet.ulke} · {bilet.tarih}
        </p>

        <p className="mt-4 text-4xl font-black">{bilet.fiyat}</p>

        <div className="mt-5 grid gap-2 text-sm">
          <p>
            <span className="font-black">Havayolu:</span> {bilet.havayolu}
          </p>
          <p>
            <span className="font-black">Süre:</span> {bilet.sure}
          </p>
          <p>
            <span className="font-black">Bagaj:</span> {bilet.bagaj}
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => satinAl(bilet)}
            className="rounded-xl px-4 py-3 font-black"
            style={{
              backgroundColor: ayarlar.yanRenk2,
              color: ayarlar.butonYaziRenk,
            }}
          >
            Satın Al
          </button>

          <a
            href={`/ucak-bileti/${bilet.detaySlug}`}
            className="rounded-xl border px-4 py-3 text-center font-black"
            style={{
              borderColor: `${ayarlar.anaRenk}33`,
              color: ayarlar.anaRenk,
            }}
          >
            Detay
          </a>
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
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel Logo"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-xl font-black">{ayarlar.siteBaslik}</h1>
              <p className="text-sm text-slate-500">{ayarlar.siteAltBaslik}</p>
            </div>
          </a>

          <nav className="hidden gap-6 text-sm font-black md:flex">
            <a href="/" style={{ color: ayarlar.anaRenk }}>
              Ana Sayfa
            </a>
            <a href="/arama" className="hover:opacity-70">
              Uçuş Ara
            </a>
            <a href={ayarlar.instagramTr} target="_blank" rel="noreferrer">
              Instagram TR
            </a>
            <a href="/admin" className="hover:opacity-70">
              Admin
            </a>
            <a href="/admin/fiyat-alarmlari" className="hover:opacity-70">
              Alarmlar
            </a>
          </nav>
        </div>
      </header>

      <section
        className="px-5 py-12 text-white md:py-16"
        style={{
          background: `linear-gradient(135deg, ${ayarlar.anaRenk}, ${ayarlar.koyuRenk})`,
        }}
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <p
                className="inline-block rounded-full px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor: ayarlar.yanRenk2,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                {ayarlar.heroRozet}
              </p>

              <h2 className="mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
                {ayarlar.heroBaslik}
              </h2>

              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                {ayarlar.heroAciklama}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="/arama"
                  className="rounded-xl px-6 py-4 font-black"
                  style={{
                    backgroundColor: ayarlar.yanRenk2,
                    color: ayarlar.butonYaziRenk,
                  }}
                >
                  Uçuş Ara
                </a>

                <a
                  href="#firsatlar"
                  className="rounded-xl border border-white/20 px-6 py-4 font-black text-white hover:bg-white hover:text-slate-950"
                >
                  Fırsatları Gör
                </a>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
              <img
                src="/logo.png"
                alt="Letsgo 2 Travel"
                className="mx-auto h-40 w-auto"
              />

              <div className="mt-6 rounded-2xl bg-slate-950/70 p-5">
                <p className="font-black" style={{ color: ayarlar.yanRenk2 }}>
                  Profesyonel uçuş arama deneyimi
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Arama kutusu, fiyat alarmı ve senin seçtiğin ucuz uçuş
                  fırsatları aynı platformda.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div
                    className="rounded-xl p-3 text-center text-sm font-black"
                    style={{ backgroundColor: ayarlar.yanRenk1 }}
                  >
                    Ara
                  </div>
                  <div
                    className="rounded-xl p-3 text-center text-sm font-black text-slate-950"
                    style={{ backgroundColor: ayarlar.yanRenk2 }}
                  >
                    Fırsat
                  </div>
                  <div
                    className="rounded-xl p-3 text-center text-sm font-black"
                    style={{ backgroundColor: ayarlar.yanRenk3 }}
                  >
                    Alarm
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={aramaYap}
            className="mt-10 rounded-3xl bg-white p-4 text-slate-950 shadow-2xl md:p-6"
          >
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Nereden?
                </label>
                <input
                  value={nereden}
                  onChange={(e) => setNereden(e.target.value)}
                  placeholder="İstanbul, Ankara..."
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Nereye?
                </label>
                <input
                  value={nereye}
                  onChange={(e) => setNereye(e.target.value)}
                  placeholder="Roma, Paris, Bakü..."
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Gidiş
                </label>
                <input
                  value={gidisTarihi}
                  onChange={(e) => setGidisTarihi(e.target.value)}
                  type="date"
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Dönüş
                </label>
                <input
                  value={donusTarihi}
                  onChange={(e) => setDonusTarihi(e.target.value)}
                  type="date"
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Yolcu
                </label>
                <select
                  value={yolcu}
                  onChange={(e) => setYolcu(e.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none"
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </div>
            </div>

            <button
              className="mt-4 w-full rounded-2xl px-6 py-5 text-lg font-black md:w-auto"
              style={{
                backgroundColor: ayarlar.yanRenk2,
                color: ayarlar.butonYaziRenk,
              }}
            >
              Ucuz Bilet Ara
            </button>
          </form>

          <div className="mt-5 flex flex-wrap gap-3">
            {populerRotalar.map((rota) => (
              <button
                key={`${rota.nereden}-${rota.nereye}`}
                onClick={() => populerRotaAra(rota.nereden, rota.nereye)}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white hover:text-slate-950"
              >
                {rota.nereden} → {rota.nereye} · {rota.etiket}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Aktif fırsat</p>
            <p className="mt-2 text-4xl font-black">
              {yukleniyor ? "..." : istatistik.toplam}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">En ucuz fiyat</p>
            <p className="mt-2 text-4xl font-black">
              {istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Vizesiz rota</p>
            <p
              className="mt-2 text-4xl font-black"
              style={{ color: ayarlar.yanRenk3 }}
            >
              {istatistik.vizesiz}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Ülke sayısı</p>
            <p
              className="mt-2 text-4xl font-black"
              style={{ color: ayarlar.yanRenk1 }}
            >
              {istatistik.ulkeSayisi}
            </p>
          </div>
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
                    className="rounded-xl px-6 py-4 font-black"
                    style={{
                      backgroundColor: ayarlar.yanRenk2,
                      color: ayarlar.butonYaziRenk,
                    }}
                  >
                    Satın Al
                  </button>

                  <a
                    href={`/ucak-bileti/${gununFirsati.detaySlug}`}
                    className="rounded-xl border border-white/20 px-6 py-4 font-black text-white hover:bg-white hover:text-slate-950"
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
                  <p>
                    <span className="font-black">Havayolu:</span>{" "}
                    {gununFirsati.havayolu}
                  </p>
                  <p>
                    <span className="font-black">Süre:</span>{" "}
                    {gununFirsati.sure}
                  </p>
                  <p>
                    <span className="font-black">Bagaj:</span>{" "}
                    {gununFirsati.bagaj}
                  </p>
                  <p>
                    <span className="font-black">Son kontrol:</span>{" "}
                    {gununFirsati.sonKontrol}
                  </p>
                </div>
              </aside>
            </div>
          </div>
        </section>
      )}

      <section id="firsatlar" className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="font-black" style={{ color: ayarlar.yanRenk1 }}>
              En ucuzlar
            </p>
            <h2 className="text-3xl font-black">Öne çıkan ucuz uçuşlar</h2>
          </div>

          <a href="/arama" className="hidden font-black text-slate-600 md:block">
            Tümünü gör →
          </a>
        </div>

        {enUcuzlar.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow">
            <p className="font-black">Henüz aktif fırsat yok.</p>
          </div>
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
          <div className="mb-6">
            <p className="font-black" style={{ color: ayarlar.yanRenk3 }}>
              Vizesiz
            </p>
            <h2 className="text-3xl font-black">Vizesiz uçuş fırsatları</h2>
          </div>

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
            <div className="mb-6 flex items-end justify-between">
              <div>
                <p className="font-black" style={{ color: ayarlar.yanRenk1 }}>
                  Kategori
                </p>
                <h2 className="text-3xl font-black">
                  {grup.kategori} fırsatları
                </h2>
              </div>

              <a
                href={`/arama?kategori=${encodeURIComponent(grup.kategori)}`}
                className="hidden font-black text-slate-600 md:block"
              >
                Kategoriyi gör →
              </a>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {grup.biletler.map((bilet) => (
                <BiletKarti key={bilet.id} bilet={bilet} />
              ))}
            </div>
          </section>
        ))}

      {ayarlar.fiyatAlarmGoster && (
        <section className="mx-auto max-w-7xl px-5 py-10">
          <div className="grid gap-6 rounded-[2rem] bg-white p-8 shadow lg:grid-cols-[1fr_380px] lg:items-center">
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
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-3xl">🔍</p>
            <h3 className="mt-4 text-xl font-black">Ara</h3>
            <p className="mt-2 text-slate-500">
              Nereden, nereye ve tarih bilgilerini girerek fırsatları keşfet.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-3xl">💸</p>
            <h3 className="mt-4 text-xl font-black">Karşılaştır</h3>
            <p className="mt-2 text-slate-500">
              En ucuz, en iyi ve popüler fırsatları tek ekranda gör.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-3xl">✈️</p>
            <h3 className="mt-4 text-xl font-black">Yönlen</h3>
            <p className="mt-2 text-slate-500">
              Satın al butonuyla ilgili bilet sayfasına yönlen.
            </p>
          </div>
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
              <a href="/admin">Admin Panel</a>
              <a href="/admin/fiyat-alarmlari">Fiyat Alarmları</a>
              <a href="/admin/ayarlar">Site Ayarları</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}