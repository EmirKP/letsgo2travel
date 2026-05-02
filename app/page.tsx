"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type VizeTipi = "Vizesiz" | "Vizeli";

type Bilet = {
  id: number;
  nereden: string;
  nereye: string;
  ulke: string;
  fiyat: string;
  fiyatSayi: number;
  tarih: string;
  vize: VizeTipi;
  ay: string;
  havayolu: string;
  sure: string;
  bagaj: string;
  etiket: string;
  link: string;
};

const instagramTr = "https://www.instagram.com/letsgo2travel_tr/";
const instagramEn = "https://www.instagram.com/letsgo2travel_en/";

const STORAGE_KEY = "letsgo-biletler";

const varsayilanBiletler: Bilet[] = [
  {
    id: 1,
    nereden: "İstanbul",
    nereye: "Saraybosna",
    ulke: "Bosna Hersek",
    fiyat: "4.600 TL",
    fiyatSayi: 4600,
    tarih: "16 Eylül - 21 Eylül",
    vize: "Vizesiz",
    ay: "Eylül",
    havayolu: "Pegasus / AJet",
    sure: "1 saat 55 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Vizesiz Favori",
    link: "https://www.skyscanner.com.tr/",
  },
  {
    id: 2,
    nereden: "İstanbul",
    nereye: "Roma",
    ulke: "İtalya",
    fiyat: "3.250 TL",
    fiyatSayi: 3250,
    tarih: "12 Haziran - 18 Haziran",
    vize: "Vizeli",
    ay: "Haziran",
    havayolu: "Wizz Air / Pegasus",
    sure: "2 saat 35 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Avrupa Fırsatı",
    link: "https://www.skyscanner.com.tr/",
  },
  {
    id: 3,
    nereden: "Ankara",
    nereye: "Bakü",
    ulke: "Azerbaycan",
    fiyat: "2.980 TL",
    fiyatSayi: 2980,
    tarih: "5 Ağustos - 9 Ağustos",
    vize: "Vizesiz",
    ay: "Ağustos",
    havayolu: "AJet / THY",
    sure: "2 saat 20 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Yakın Rota",
    link: "https://www.skyscanner.com.tr/",
  },
  {
    id: 4,
    nereden: "İzmir",
    nereye: "Budapeşte",
    ulke: "Macaristan",
    fiyat: "3.890 TL",
    fiyatSayi: 3890,
    tarih: "3 Ekim - 7 Ekim",
    vize: "Vizeli",
    ay: "Ekim",
    havayolu: "SunExpress / Wizz Air",
    sure: "2 saat 15 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Sonbahar Rotası",
    link: "https://www.skyscanner.com.tr/",
  },
  {
    id: 5,
    nereden: "İstanbul",
    nereye: "Tiran",
    ulke: "Arnavutluk",
    fiyat: "2.750 TL",
    fiyatSayi: 2750,
    tarih: "8 Temmuz - 12 Temmuz",
    vize: "Vizesiz",
    ay: "Temmuz",
    havayolu: "Pegasus",
    sure: "1 saat 40 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Ucuz Kaçamak",
    link: "https://www.skyscanner.com.tr/",
  },
  {
    id: 6,
    nereden: "Antalya",
    nereye: "Belgrad",
    ulke: "Sırbistan",
    fiyat: "3.150 TL",
    fiyatSayi: 3150,
    tarih: "22 Eylül - 26 Eylül",
    vize: "Vizesiz",
    ay: "Eylül",
    havayolu: "Air Serbia / AJet",
    sure: "2 saat 05 dk",
    bagaj: "Kabin bagajı dahil",
    etiket: "Balkan Fırsatı",
    link: "https://www.skyscanner.com.tr/",
  },
];

const rehberler = [
  {
    baslik: "Vizesiz gidilebilecek ülkeler",
    aciklama:
      "Pasaportla kolayca seyahat edebileceğin popüler vizesiz rotaları keşfet.",
    ikon: "🌍",
  },
  {
    baslik: "Ucuz uçak bileti nasıl bulunur?",
    aciklama:
      "Esnek tarih, erken takip ve doğru rota seçimiyle daha uygun bilet bulma taktikleri.",
    ikon: "💸",
  },
  {
    baslik: "İlk yurt dışı seyahati rehberi",
    aciklama:
      "Pasaport, bagaj, havalimanı ve konaklama için basit başlangıç rehberi.",
    ikon: "🧳",
  },
  {
    baslik: "Balkan rotası planı",
    aciklama:
      "Saraybosna, Belgrad, Tiran ve Üsküp gibi uygun fiyatlı rotaları karşılaştır.",
    ikon: "🏔️",
  },
  {
    baslik: "Hafta sonu kaçamakları",
    aciklama:
      "Cuma çıkıp pazar dönebileceğin kısa ve uygun fiyatlı şehirleri incele.",
    ikon: "📅",
  },
  {
    baslik: "Bagaj ve havalimanı ipuçları",
    aciklama:
      "Kabin bagajı, check-in ve havalimanı sürecinde dikkat etmen gerekenler.",
    ikon: "🎒",
  },
];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function benzersizListe(liste: string[]) {
  return ["Tümü", ...Array.from(new Set(liste.filter(Boolean)))];
}

export default function Home() {
  const [biletler, setBiletler] = useState<Bilet[]>(varsayilanBiletler);

  const [arama, setArama] = useState("");
  const [ay, setAy] = useState("Tümü");
  const [vize, setVize] = useState("Tümü");
  const [sehir, setSehir] = useState("Tümü");
  const [ulke, setUlke] = useState("Tümü");
  const [maksimumFiyat, setMaksimumFiyat] = useState("10000");
  const [siralama, setSiralama] = useState("onerilen");
  const [sadeceFavoriler, setSadeceFavoriler] = useState(false);
  const [favoriler, setFavoriler] = useState<number[]>([]);
  const [kopyalananId, setKopyalananId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [alarmMesaji, setAlarmMesaji] = useState("");

useEffect(() => {
  async function biletleriYukle() {
    try {
      const response = await fetch("/api/biletler", {
        cache: "no-store",
      });

      const data = await response.json();

      if (data.biletler) {
        setBiletler(data.biletler);
      }
    } catch {
      setBiletler(varsayilanBiletler);
    }
  }

  biletleriYukle();
}, []);

  useEffect(() => {
    const kayitliFavoriler = localStorage.getItem("letsgo-favoriler");

    if (kayitliFavoriler) {
      try {
        setFavoriler(JSON.parse(kayitliFavoriler));
      } catch {
        setFavoriler([]);
      }
    }
  }, []);

  const aylar = useMemo(() => {
    return benzersizListe(biletler.map((bilet) => bilet.ay));
  }, [biletler]);

  const sehirler = useMemo(() => {
    return benzersizListe(biletler.map((bilet) => bilet.nereden));
  }, [biletler]);

  const ulkeler = useMemo(() => {
    return benzersizListe(biletler.map((bilet) => bilet.ulke));
  }, [biletler]);

  const vizeler = ["Tümü", "Vizesiz", "Vizeli"];

  const enYuksekFiyat = useMemo(() => {
    if (biletler.length === 0) return 10000;
    return Math.max(...biletler.map((bilet) => bilet.fiyatSayi), 10000);
  }, [biletler]);

  function favoriDegistir(id: number) {
    setFavoriler((onceki) => {
      const yeniListe = onceki.includes(id)
        ? onceki.filter((favoriId) => favoriId !== id)
        : [...onceki, id];

      localStorage.setItem("letsgo-favoriler", JSON.stringify(yeniListe));
      return yeniListe;
    });
  }

  function filtreleriTemizle() {
    setArama("");
    setAy("Tümü");
    setVize("Tümü");
    setSehir("Tümü");
    setUlke("Tümü");
    setMaksimumFiyat(String(enYuksekFiyat));
    setSiralama("onerilen");
    setSadeceFavoriler(false);
  }

  async function rotayiPaylas(bilet: Bilet) {
    const metin = `${bilet.nereden} → ${bilet.nereye} uçuş fırsatı: ${bilet.fiyat} | Letsgo 2 Travel`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Letsgo 2 Travel Uçuş Fırsatı",
          text: metin,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(`${metin} ${window.location.href}`);
      }

      setKopyalananId(bilet.id);
      setTimeout(() => setKopyalananId(null), 1800);
    } catch {
      setKopyalananId(null);
    }
  }

  function fiyatAlarmiGonder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!email.trim()) {
      setAlarmMesaji("Lütfen e-posta adresini yaz.");
      return;
    }

    setAlarmMesaji(
      "Harika! Fiyat alarmı özelliği şu an demo olarak çalışıyor. Gerçek e-posta sistemi admin panelin veritabanı aşamasında bağlanacak."
    );
    setEmail("");
  }

  const filtrelenmisBiletler = useMemo(() => {
    let sonuc = biletler.filter((bilet) => {
      const aramaMetni =
        `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.ay} ${bilet.vize} ${bilet.havayolu} ${bilet.etiket}`.toLocaleLowerCase(
          "tr-TR"
        );

      const aramaUyuyor = aramaMetni.includes(
        arama.toLocaleLowerCase("tr-TR")
      );

      const ayUyuyor = ay === "Tümü" || bilet.ay === ay;
      const vizeUyuyor = vize === "Tümü" || bilet.vize === vize;
      const sehirUyuyor = sehir === "Tümü" || bilet.nereden === sehir;
      const ulkeUyuyor = ulke === "Tümü" || bilet.ulke === ulke;
      const fiyatUyuyor = bilet.fiyatSayi <= Number(maksimumFiyat);
      const favoriUyuyor = !sadeceFavoriler || favoriler.includes(bilet.id);

      return (
        aramaUyuyor &&
        ayUyuyor &&
        vizeUyuyor &&
        sehirUyuyor &&
        ulkeUyuyor &&
        fiyatUyuyor &&
        favoriUyuyor
      );
    });

    if (siralama === "ucuz") {
      sonuc = [...sonuc].sort((a, b) => a.fiyatSayi - b.fiyatSayi);
    }

    if (siralama === "pahali") {
      sonuc = [...sonuc].sort((a, b) => b.fiyatSayi - a.fiyatSayi);
    }

    if (siralama === "vizesiz") {
      sonuc = [...sonuc].sort((a, b) => {
        if (a.vize === "Vizesiz" && b.vize !== "Vizesiz") return -1;
        if (a.vize !== "Vizesiz" && b.vize === "Vizesiz") return 1;
        return a.fiyatSayi - b.fiyatSayi;
      });
    }

    return sonuc;
  }, [
    biletler,
    arama,
    ay,
    vize,
    sehir,
    ulke,
    maksimumFiyat,
    siralama,
    sadeceFavoriler,
    favoriler,
  ]);

  const enUcuzBilet = useMemo(() => {
    if (biletler.length === 0) return null;
    return [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0];
  }, [biletler]);

  const vizesizBiletSayisi = useMemo(() => {
    return biletler.filter((bilet) => bilet.vize === "Vizesiz").length;
  }, [biletler]);

  const ortalamaFiyat = useMemo(() => {
    if (biletler.length === 0) return 0;
    const toplam = biletler.reduce((sum, bilet) => sum + bilet.fiyatSayi, 0);
    return Math.round(toplam / biletler.length);
  }, [biletler]);

  const populerRotalar = useMemo(() => {
    return biletler.slice(0, 8).map((bilet) => `${bilet.nereden} → ${bilet.nereye}`);
  }, [biletler]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Letsgo 2 Travel Logo"
              width={90}
              height={90}
              priority
              className="h-16 w-auto"
            />

            <div>
              <h1 className="text-xl font-black md:text-2xl">
                Letsgo 2 Travel
              </h1>
              <p className="text-xs text-slate-500 md:text-sm">
                Ucuz uçak bileti fırsatları
              </p>
            </div>
          </a>

          <nav className="hidden gap-6 text-sm font-bold md:flex">
            <a href="#" className="hover:text-yellow-600">
              Ana Sayfa
            </a>
            <a href="#biletler" className="hover:text-yellow-600">
              Ucuz Biletler
            </a>
            <a href="#rehber" className="hover:text-yellow-600">
              Rehberler
            </a>
            <a href="#sosyal" className="hover:text-yellow-600">
              Sosyal
            </a>
            <a href="/admin" className="hover:text-yellow-600">
              Admin
            </a>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-block rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
              Güncel uçuş fırsatları
            </p>

            <h2 className="text-4xl font-black leading-tight md:text-6xl">
              Ucuz uçak bileti fırsatlarını tek yerde keşfet
            </h2>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Yurt içi ve yurt dışı uygun fiyatlı uçuşları takip et. Fırsatı
              gör, favorilere ekle, paylaş ve bilet arama sayfasına yönlen.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#biletler"
                className="rounded-xl bg-yellow-400 px-6 py-3 font-black text-slate-950 transition hover:bg-yellow-300"
              >
                Fırsatları Gör
              </a>

              <a
                href={instagramTr}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/30 px-6 py-3 font-black text-white transition hover:bg-white hover:text-slate-950"
              >
                Instagram TR
              </a>

              <a
                href={instagramEn}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/30 px-6 py-3 font-black text-white transition hover:bg-white hover:text-slate-950"
              >
                Instagram EN
              </a>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-3xl font-black">{biletler.length}+</p>
                <p className="text-sm text-slate-300">Aktif fırsat</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-3xl font-black">
                  {enUcuzBilet ? enUcuzBilet.fiyat : "—"}
                </p>
                <p className="text-sm text-slate-300">En ucuz bilet</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-3xl font-black">{vizesizBiletSayisi}</p>
                <p className="text-sm text-slate-300">Vizesiz rota</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-3xl font-black">
                  {fiyatYaz(ortalamaFiyat)}
                </p>
                <p className="text-sm text-slate-300">Ortalama fiyat</p>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
              <Image
                src="/logo.png"
                alt="Letsgo 2 Travel Logo"
                width={520}
                height={520}
                priority
                className="mx-auto h-auto w-full max-w-sm"
              />

              <div className="mt-6 rounded-2xl bg-slate-950/60 p-4">
                <p className="font-black text-yellow-300">
                  Admin panel bağlantılı
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  Admin panelden eklediğin biletler artık burada görünür.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-8 max-w-6xl px-5">
        <div className="rounded-3xl bg-white p-5 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <label className="text-sm font-black text-slate-500">
                Arama
              </label>
              <input
                value={arama}
                onChange={(e) => setArama(e.target.value)}
                placeholder="Roma, Bakü, vizesiz, Pegasus..."
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Şehir</label>
              <select
                value={sehir}
                onChange={(e) => setSehir(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                {sehirler.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Ülke</label>
              <select
                value={ulke}
                onChange={(e) => setUlke(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                {ulkeler.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Ay</label>
              <select
                value={ay}
                onChange={(e) => setAy(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                {aylar.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Vize</label>
              <select
                value={vize}
                onChange={(e) => setVize(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                {vizeler.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-3">
            <div>
              <label className="text-sm font-black text-slate-500">
                Maksimum fiyat: {fiyatYaz(Number(maksimumFiyat))}
              </label>
              <input
                type="range"
                min="1500"
                max={enYuksekFiyat}
                step="250"
                value={maksimumFiyat}
                onChange={(e) => setMaksimumFiyat(e.target.value)}
                className="mt-3 w-full"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">
                Sıralama
              </label>
              <select
                value={siralama}
                onChange={(e) => setSiralama(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                <option value="onerilen">Önerilen sıralama</option>
                <option value="ucuz">Önce en ucuz</option>
                <option value="pahali">Önce en pahalı</option>
                <option value="vizesiz">Önce vizesiz rotalar</option>
              </select>
            </div>

            <div className="flex flex-col justify-end gap-3 sm:flex-row md:flex-col">
              <button
                onClick={() => setSadeceFavoriler(!sadeceFavoriler)}
                className={
                  sadeceFavoriler
                    ? "rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950"
                    : "rounded-xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                }
              >
                {sadeceFavoriler
                  ? "Favoriler gösteriliyor"
                  : "Favorileri göster"}
              </button>

              <button
                onClick={filtreleriTemizle}
                className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Filtreleri Temizle
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-100 p-4">
            <p className="text-sm font-bold text-slate-600">
              {filtrelenmisBiletler.length} fırsat listeleniyor. Favori sayın:{" "}
              {favoriler.length}
            </p>
          </div>
        </div>
      </section>

      <section id="biletler" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-black text-yellow-600">Ucuz uçuş listesi</p>
            <h2 className="mt-1 text-3xl font-black md:text-4xl">
              Ucuz Uçak Biletleri
            </h2>
            <p className="mt-2 max-w-2xl text-slate-500">
              Fırsatları filtrele, favorilere ekle, arkadaşlarınla paylaş ve
              satın al butonuyla bilet arama sayfasına git.
            </p>
          </div>
        </div>

        {filtrelenmisBiletler.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow">
            <h3 className="text-2xl font-black">Sonuç bulunamadı</h3>
            <p className="mt-2 text-slate-500">
              Filtreleri değiştirerek tekrar dene.
            </p>
            <button
              onClick={filtreleriTemizle}
              className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-black text-white"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filtrelenmisBiletler.map((bilet) => (
              <article
                key={bilet.id}
                className="overflow-hidden rounded-3xl bg-white shadow transition hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="bg-slate-950 p-5 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-yellow-300">
                        {bilet.etiket}
                      </p>
                      <h3 className="mt-1 text-2xl font-black">
                        {bilet.nereden} → {bilet.nereye}
                      </h3>
                      <p className="mt-1 text-sm text-slate-300">
                        {bilet.ulke}
                      </p>
                    </div>

                    <span
                      className={
                        bilet.vize === "Vizesiz"
                          ? "rounded-full bg-green-100 px-3 py-1 text-sm font-black text-green-700"
                          : "rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-700"
                      }
                    >
                      {bilet.vize}
                    </span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Tarih
                      </p>
                      <p className="mt-1 font-bold">{bilet.tarih}</p>
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Ay
                      </p>
                      <p className="mt-1 font-bold">{bilet.ay}</p>
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Havayolu
                      </p>
                      <p className="mt-1 font-bold">{bilet.havayolu}</p>
                    </div>

                    <div className="rounded-2xl bg-slate-100 p-4">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Uçuş
                      </p>
                      <p className="mt-1 font-bold">{bilet.sure}</p>
                    </div>
                  </div>

                  <p className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800">
                    {bilet.bagaj}
                  </p>

                  <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-500">
                        Başlayan fiyatlarla
                      </p>
                      <p className="text-4xl font-black text-slate-950">
                        {bilet.fiyat}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:min-w-36">
                      <a
                        href={bilet.link}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-slate-950 px-6 py-3 text-center font-black text-white transition hover:bg-yellow-400 hover:text-slate-950"
                      >
                        Satın Al
                      </a>

                      <button
                        onClick={() => favoriDegistir(bilet.id)}
                        className="rounded-xl bg-slate-100 px-6 py-3 text-center font-black text-slate-800 transition hover:bg-slate-200"
                      >
                        {favoriler.includes(bilet.id)
                          ? "Favoriden Çıkar"
                          : "Favoriye Ekle"}
                      </button>

                      <button
                        onClick={() => rotayiPaylas(bilet)}
                        className="rounded-xl border px-6 py-3 text-center font-black text-slate-800 transition hover:border-yellow-400 hover:bg-yellow-50"
                      >
                        {kopyalananId === bilet.id ? "Paylaşıldı" : "Paylaş"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white px-5 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="font-black text-yellow-600">Popüler rotalar</p>
          <h2 className="mt-1 text-3xl font-black md:text-4xl">
            En çok aranan uçuşlar
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {populerRotalar.map((rota) => (
              <button
                key={rota}
                onClick={() => setArama(rota.replace("→", ""))}
                className="rounded-3xl border bg-slate-50 p-5 text-left transition hover:border-yellow-400 hover:bg-yellow-50"
              >
                <p className="text-lg font-black">{rota}</p>
                <p className="mt-2 text-sm text-slate-500">
                  Uygun fiyatlı uçuşları takip et.
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="rehber" className="mx-auto max-w-6xl px-5 py-16">
        <p className="font-black text-yellow-600">Seyahat içerikleri</p>
        <h2 className="mt-1 text-3xl font-black md:text-4xl">
          Gezi Rehberleri
        </h2>
        <p className="mt-2 max-w-2xl text-slate-500">
          Sadece bilet listelemek yetmez. Google’da çıkmak için rehber
          içerikleri de çok önemli. Bu alan ileride blog sistemine dönüşecek.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {rehberler.map((rehber) => (
            <article
              key={rehber.baslik}
              className="rounded-3xl bg-white p-6 shadow transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-3xl">
                {rehber.ikon}
              </div>
              <h3 className="text-xl font-black">{rehber.baslik}</h3>
              <p className="mt-3 text-slate-600">{rehber.aciklama}</p>
              <button className="mt-5 font-black text-yellow-700">
                Yakında →
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-950 px-5 py-16 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-black text-yellow-400">Fiyat alarmı</p>
            <h2 className="mt-1 text-3xl font-black md:text-4xl">
              Ucuz bilet düşünce haberin olsun
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-300">
              Bu alan şimdilik demo olarak çalışıyor. Sonraki aşamada gerçek
              e-posta sistemi ve veritabanı bağlanacak.
            </p>
          </div>

          <form
            onSubmit={fiyatAlarmiGonder}
            className="rounded-3xl bg-white/10 p-6"
          >
            <label className="text-sm font-black text-slate-300">
              E-posta adresin
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="ornek@mail.com"
              className="mt-2 w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-slate-950 outline-none focus:border-yellow-400"
            />

            <button className="mt-4 w-full rounded-xl bg-yellow-400 px-6 py-4 font-black text-slate-950 transition hover:bg-yellow-300">
              Fiyat Alarmı Kur
            </button>

            {alarmMesaji && (
              <p className="mt-4 rounded-2xl bg-slate-950/50 p-4 text-sm text-slate-200">
                {alarmMesaji}
              </p>
            )}
          </form>
        </div>
      </section>

      <section id="sosyal" className="bg-white px-5 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="font-black text-yellow-600">Sosyal medya</p>
          <h2 className="mt-1 text-3xl font-black md:text-4xl">
            Letsgo 2 Travel hesapları
          </h2>
          <p className="mt-2 max-w-2xl text-slate-500">
            Türkçe ve İngilizce hesapları ayrı tutmak çok iyi fikir. Böylece
            hem Türkiye kitlesine hem global kitleye ayrı içerik paylaşabilirsin.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <a
              href={instagramTr}
              target="_blank"
              rel="noreferrer"
              className="rounded-3xl bg-slate-950 p-8 text-white shadow transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <p className="text-sm font-black text-yellow-400">
                Türkiye hesabı
              </p>
              <h3 className="mt-2 text-3xl font-black">
                @letsgo2travel_tr
              </h3>
              <p className="mt-3 text-slate-300">
                Türkiye kitlesi için Türkçe uçuş fırsatları, vizesiz rotalar ve
                kampanyalar.
              </p>
            </a>

            <a
              href={instagramEn}
              target="_blank"
              rel="noreferrer"
              className="rounded-3xl bg-yellow-400 p-8 text-slate-950 shadow transition hover:-translate-y-1 hover:shadow-2xl"
            >
              <p className="text-sm font-black">English account</p>
              <h3 className="mt-2 text-3xl font-black">
                @letsgo2travel_en
              </h3>
              <p className="mt-3 text-slate-800">
                Global audience için İngilizce travel deals, guides and flight
                inspiration.
              </p>
            </a>
          </div>
        </div>
      </section>

      <section id="iletisim" className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-3xl bg-slate-950 p-8 text-white md:p-10">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className="font-black text-yellow-400">
                Bildirimleri kaçırma
              </p>
              <h2 className="mt-1 text-3xl font-black md:text-4xl">
                Yeni fırsatlar için bizi takip et
              </h2>
              <p className="mt-4 max-w-xl leading-7 text-slate-300">
                Instagram hesaplarımızdan yeni uçuş fırsatlarını paylaşacağız.
                WhatsApp kanalı açılınca buraya ayrıca eklenecek.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <a
                href={instagramTr}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-yellow-400 px-6 py-4 text-center font-black text-slate-950 transition hover:bg-yellow-300"
              >
                Instagram Türkiye
              </a>

              <a
                href={instagramEn}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/30 px-6 py-4 text-center font-black text-white transition hover:bg-white hover:text-slate-950"
              >
                Instagram English
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <p className="font-black text-yellow-600">Güven ve bilgi</p>
        <h2 className="mt-1 text-3xl font-black md:text-4xl">
          Sıkça Sorulan Sorular
        </h2>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow">
            <h3 className="text-lg font-black">Bu site bilet satıyor mu?</h3>
            <p className="mt-2 text-slate-600">
              Hayır. Bu site fırsatları listeler ve kullanıcıyı bilet arama
              sayfasına yönlendirir.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h3 className="text-lg font-black">Fiyatlar kesin mi?</h3>
            <p className="mt-2 text-slate-600">
              Uçak bileti fiyatları hızlı değişebilir. Son fiyatı yönlendirilen
              bilet sitesinde kontrol etmek gerekir.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h3 className="text-lg font-black">
              Admin panelden eklediğim bilet görünür mü?
            </h3>
            <p className="mt-2 text-slate-600">
              Evet. Şu an aynı tarayıcıda admin panelden eklediğin bilet ana
              sayfada görünür.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h3 className="text-lg font-black">
              Sonraki gerçek adım ne?
            </h3>
            <p className="mt-2 text-slate-600">
              Veritabanı bağlamak. Böylece biletler sadece senin tarayıcında
              değil, herkeste görünür.
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 px-5 py-10 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Letsgo 2 Travel Logo"
              width={80}
              height={80}
              className="h-14 w-auto"
            />

            <div>
              <h2 className="text-2xl font-black">Letsgo 2 Travel</h2>
              <p className="text-sm text-slate-400">
                Ucuz uçak bileti fırsatlarını paylaşan bağımsız fırsat sitesi.
              </p>
            </div>
          </div>

          <div className="text-sm text-slate-500 md:text-right">
            <p>© 2026 Letsgo 2 Travel. Tüm hakları saklıdır.</p>
            <p className="mt-1">
              Bilet fiyatları değişebilir. Satın almadan önce kontrol ediniz.
            </p>
            <div className="mt-3 flex gap-3 md:justify-end">
              <a
                href={instagramTr}
                target="_blank"
                rel="noreferrer"
                className="hover:text-yellow-400"
              >
                Instagram TR
              </a>
              <a
                href={instagramEn}
                target="_blank"
                rel="noreferrer"
                className="hover:text-yellow-400"
              >
                Instagram EN
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}