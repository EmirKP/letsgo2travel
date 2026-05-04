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

const populerAramalar = [
  { nereden: "İstanbul", nereye: "Roma", etiket: "Avrupa kaçamağı" },
  { nereden: "İstanbul", nereye: "Saraybosna", etiket: "Vizesiz favori" },
  { nereden: "Ankara", nereye: "Bakü", etiket: "Yakın rota" },
  { nereden: "İstanbul", nereye: "Paris", etiket: "Popüler şehir" },
];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat || 0)} TL`;
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
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");

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
    setHata("");

    const params = new URLSearchParams({
      nereden: aktifNereden,
      nereye: aktifNereye,
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
      // Tıklanma kaydı hata verirse bile kullanıcı yönlenir.
    }

    window.open(bilet.link, "_blank", "noopener,noreferrer");
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

    const vizesiz = biletler.filter((bilet) => bilet.vize === "Vizesiz").length;

    const ortalama = biletler.length
      ? Math.round(
          biletler.reduce((toplam, bilet) => toplam + bilet.fiyatSayi, 0) /
            biletler.length
        )
      : 0;

    return {
      toplam: biletler.length,
      enUcuz,
      vizesiz,
      ortalama,
    };
  }, [biletler]);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Letsgo 2 Travel" className="h-14 w-auto" />
            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel</h1>
              <p className="text-sm text-slate-500">
                Ucuz uçuş arama ve fırsat platformu
              </p>
            </div>
          </a>

          <nav className="hidden gap-6 text-sm font-black md:flex">
            <a href="/" className="hover:text-yellow-600">
              Ana Sayfa
            </a>
            <a href="/arama" className="text-yellow-600">
              Uçuş Ara
            </a>
            <a href="/admin" className="hover:text-yellow-600">
              Admin
            </a>
            <a href="/admin/fiyat-alarmlari" className="hover:text-yellow-600">
              Fiyat Alarmları
            </a>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="inline-block rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
            Skyscanner tarzı arama + Letsgo fırsatları
          </p>

          <h2 className="mt-5 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
            Ucuz uçuşları ara, fırsatları karşılaştır
          </h2>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
            Letsgo 2 Travel, senin eklediğin ucuz uçuş fırsatlarını arama motoru
            mantığıyla gösterir.
          </p>

          <form
            onSubmit={aramaYap}
            className="mt-8 rounded-3xl bg-white p-4 text-slate-950 shadow-2xl md:p-6"
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
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Nereye?
                </label>
                <input
                  value={nereye}
                  onChange={(e) => setNereye(e.target.value)}
                  placeholder="Roma, Bakü, Paris..."
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
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
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
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
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Yolcu
                </label>
                <select
                  value={yolcu}
                  onChange={(e) => setYolcu(e.target.value)}
                  className="mt-2 w-full rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
                >
                  <option>1</option>
                  <option>2</option>
                  <option>3</option>
                  <option>4</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-5">
              <select
                value={vize}
                onChange={(e) => setVize(e.target.value)}
                className="rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
              >
                <option>Tümü</option>
                <option>Vizesiz</option>
                <option>Vizeli</option>
              </select>

              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                className="rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
              >
                {kategoriler.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>

              <select
                value={aktarma}
                onChange={(e) => setAktarma(e.target.value)}
                className="rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
              >
                <option>Tümü</option>
                <option>Aktarmasız</option>
                <option>1 Aktarma</option>
                <option>Farketmez</option>
              </select>

              <select
                value={siralama}
                onChange={(e) => setSiralama(e.target.value)}
                className="rounded-2xl border px-4 py-4 font-bold outline-none focus:border-yellow-400"
              >
                <option value="en-iyi">En iyi</option>
                <option value="en-ucuz">En ucuz</option>
                <option value="en-hizli">En hızlı</option>
                <option value="populer">Popüler</option>
              </select>

              <button
                disabled={yukleniyor}
                className="rounded-2xl bg-yellow-400 px-6 py-4 font-black text-slate-950 transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {yukleniyor ? "Aranıyor..." : "Ucuz Bilet Ara"}
              </button>
            </div>

            <div className="mt-5">
              <label className="text-sm font-black text-slate-500">
                Maksimum fiyat: {fiyatYaz(Number(maksimumFiyat))}
              </label>
              <input
                type="range"
                min="1000"
                max="30000"
                step="500"
                value={maksimumFiyat}
                onChange={(e) => setMaksimumFiyat(e.target.value)}
                className="mt-2 w-full"
              />
            </div>
          </form>

          <div className="mt-5 flex flex-wrap gap-3">
            {populerAramalar.map((arama) => (
              <button
                key={`${arama.nereden}-${arama.nereye}`}
                onClick={() => populerAramaYap(arama.nereden, arama.nereye)}
                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white hover:text-slate-950"
              >
                {arama.nereden} → {arama.nereye} · {arama.etiket}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Sonuç</p>
            <p className="mt-2 text-4xl font-black">{istatistik.toplam}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">En ucuz</p>
            <p className="mt-2 text-4xl font-black">
              {istatistik.enUcuz ? istatistik.enUcuz.fiyat : "—"}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Vizesiz</p>
            <p className="mt-2 text-4xl font-black">{istatistik.vizesiz}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Ortalama</p>
            <p className="mt-2 text-4xl font-black">
              {fiyatYaz(istatistik.ortalama)}
            </p>
          </div>
        </div>

        {hata && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 font-bold text-red-600">
            {hata}
          </p>
        )}
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-3xl bg-white p-6 shadow">
          <h3 className="text-xl font-black">Filtre Özeti</h3>

          <div className="mt-5 grid gap-3 text-sm">
            <p>
              <span className="font-black">Nereden:</span> {nereden || "Tümü"}
            </p>
            <p>
              <span className="font-black">Nereye:</span> {nereye || "Tümü"}
            </p>
            <p>
              <span className="font-black">Gidiş:</span>{" "}
              {gidisTarihi || "Seçilmedi"}
            </p>
            <p>
              <span className="font-black">Dönüş:</span>{" "}
              {donusTarihi || "Seçilmedi"}
            </p>
            <p>
              <span className="font-black">Vize:</span> {vize}
            </p>
            <p>
              <span className="font-black">Kategori:</span> {kategori}
            </p>
            <p>
              <span className="font-black">Aktarma:</span> {aktarma}
            </p>
            <p>
              <span className="font-black">Yolcu:</span> {yolcu}
            </p>
          </div>

          <button
            onClick={temizle}
            className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white"
          >
            Temizle
          </button>

          <div className="mt-5 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800">
            Canlı API bağlanınca bu ekran gerçek uçuş sonuçlarını da gösterecek.
          </div>

          <form
            onSubmit={fiyatAlarmiKur}
            className="mt-5 rounded-2xl bg-slate-100 p-4"
          >
            <h3 className="text-lg font-black">Fiyat Alarmı Kur</h3>

            <p className="mt-1 text-sm text-slate-500">
              Bu rota için hedef fiyatını yaz. Talep admin paneline düşer.
            </p>

            <label className="mt-4 block text-sm font-black text-slate-500">
              E-posta
            </label>

            <input
              value={alarmEmail}
              onChange={(e) => setAlarmEmail(e.target.value)}
              type="email"
              placeholder="ornek@mail.com"
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-yellow-400"
            />

            <label className="mt-4 block text-sm font-black text-slate-500">
              Maksimum fiyat
            </label>

            <input
              value={alarmMaksimumFiyat}
              onChange={(e) => setAlarmMaksimumFiyat(e.target.value)}
              type="number"
              placeholder="3000"
              className="mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:border-yellow-400"
            />

            <button
              disabled={alarmYukleniyor}
              className="mt-4 w-full rounded-xl bg-yellow-400 px-4 py-3 font-black text-slate-950 disabled:opacity-60"
            >
              {alarmYukleniyor ? "Kaydediliyor..." : "Fiyat Alarmı Kur"}
            </button>

            {alarmMesaji && (
              <p className="mt-3 rounded-xl bg-white p-3 text-sm font-bold text-slate-700">
                {alarmMesaji}
              </p>
            )}
          </form>
        </aside>

        <div className="grid gap-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-black text-yellow-600">Arama sonuçları</p>
              <h2 className="text-3xl font-black">Uçuş Fırsatları</h2>
            </div>

            <p className="text-sm font-bold text-slate-500">
              Fiyatlar değişebilir. Satın almadan önce son fiyatı kontrol et.
            </p>
          </div>

          {yukleniyor ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow">
              <p className="text-xl font-black">Fırsatlar aranıyor...</p>
            </div>
          ) : biletler.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center shadow">
              <h3 className="text-2xl font-black">Sonuç bulunamadı</h3>
              <p className="mt-2 text-slate-500">
                Farklı şehir, kategori veya fiyat deneyebilirsin.
              </p>
            </div>
          ) : (
            biletler.map((bilet) => (
              <article
                key={bilet.id}
                className="overflow-hidden rounded-3xl bg-white shadow transition hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="grid gap-0 md:grid-cols-[1fr_250px]">
                  <div className="p-6">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">
                        {bilet.ulkeEmoji} {bilet.kategori}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {bilet.vize}
                      </span>

                      {bilet.oneCikan && (
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                          Öne çıkan
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-2xl font-black">
                      {bilet.nereden} → {bilet.nereye}
                    </h3>

                    <p className="mt-1 text-slate-500">
                      {bilet.ulke} • {bilet.tarih}
                    </p>

                    {bilet.aciklama && (
                      <p className="mt-3 max-w-2xl text-slate-600">
                        {bilet.aciklama}
                      </p>
                    )}

                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-100 p-4">
                        <p className="text-xs font-black text-slate-500">
                          Havayolu
                        </p>
                        <p className="mt-1 font-bold">{bilet.havayolu}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-100 p-4">
                        <p className="text-xs font-black text-slate-500">
                          Süre
                        </p>
                        <p className="mt-1 font-bold">{bilet.sure}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-100 p-4">
                        <p className="text-xs font-black text-slate-500">
                          Aktarma
                        </p>
                        <p className="mt-1 font-bold">{bilet.aktarma}</p>
                      </div>

                      <div className="rounded-2xl bg-slate-100 p-4">
                        <p className="text-xs font-black text-slate-500">
                          Sağlayıcı
                        </p>
                        <p className="mt-1 font-bold">{bilet.saglayici}</p>
                      </div>
                    </div>

                    <p className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800">
                      {bilet.bagaj} • Son kontrol: {bilet.sonKontrol}
                    </p>
                  </div>

                  <div className="flex flex-col justify-between bg-slate-950 p-6 text-white">
                    <div>
                      <p className="text-sm text-slate-400">Başlayan fiyat</p>
                      <p className="mt-1 text-4xl font-black">{bilet.fiyat}</p>

                      <p className="mt-3 text-sm text-slate-400">
                        {bilet.tiklanma || 0} kullanıcı ilgilendi
                      </p>
                    </div>

                    <div className="mt-6 grid gap-3">
                      <button
                        onClick={() => satinAl(bilet)}
                        className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300"
                      >
                        Satın Al
                      </button>

                      <a
                        href={`/ucak-bileti/${bilet.detaySlug}`}
                        className="rounded-xl border border-white/20 px-5 py-4 text-center font-black hover:bg-white hover:text-slate-950"
                      >
                        Detay
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}