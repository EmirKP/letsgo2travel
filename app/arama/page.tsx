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
  vize: "Vizesiz" | "Vizeli";
  ay: string;
  havayolu: string;
  sure: string;
  bagaj: string;
  etiket: string;
  link: string;
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

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
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
  const [maksimumFiyat, setMaksimumFiyat] = useState("15000");
  const [siralama, setSiralama] = useState("en-iyi");
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");

  async function ara(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    setYukleniyor(true);
    setHata("");

    const params = new URLSearchParams({
      nereden,
      nereye,
      vize,
      kategori,
      aktarma,
      maksimumFiyat,
      siralama,
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
    ara();
  }, []);

  async function satinAl(bilet: Bilet) {
    try {
      await fetch(`/api/biletler/${bilet.id}/click`, {
        method: "POST",
      });
    } catch {
      // Tıklanma sayacı çalışmazsa satın alma engellenmez.
    }

    window.open(bilet.link, "_blank", "noopener,noreferrer");
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
      <header className="border-b bg-white">
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

          <nav className="hidden gap-5 text-sm font-bold md:flex">
            <a href="/" className="hover:text-yellow-600">
              Ana Sayfa
            </a>
            <a href="/arama" className="text-yellow-600">
              Uçuş Ara
            </a>
            <a href="/admin" className="hover:text-yellow-600">
              Admin
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
            Şimdilik Letsgo 2 Travel veritabanındaki fırsatlar içinde arama yapar.
            Sonraki aşamada gerçek uçuş API bağlantısı eklenebilir.
          </p>

          <form
            onSubmit={ara}
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
                  placeholder="Roma, Bakü..."
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
              <span className="font-black">Nereden:</span>{" "}
              {nereden || "Tümü"}
            </p>
            <p>
              <span className="font-black">Nereye:</span>{" "}
              {nereye || "Tümü"}
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
            onClick={() => {
              setNereden("");
              setNereye("");
              setGidisTarihi("");
              setDonusTarihi("");
              setYolcu("1");
              setVize("Tümü");
              setKategori("Tümü");
              setAktarma("Tümü");
              setMaksimumFiyat("15000");
              setSiralama("en-iyi");
              setTimeout(() => ara(), 100);
            }}
            className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 font-black text-white"
          >
            Temizle
          </button>
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
                <div className="grid gap-0 md:grid-cols-[1fr_240px]">
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