"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

const STORAGE_KEY = "letsgo-biletler";
const ADMIN_SIFRE = "letsgo2026";

const bosForm = {
  nereden: "",
  nereye: "",
  ulke: "",
  fiyatSayi: 2500,
  tarih: "",
  vize: "Vizesiz" as VizeTipi,
  ay: "Haziran",
  havayolu: "",
  sure: "",
  bagaj: "Kabin bagajı dahil",
  etiket: "",
  link: "https://www.skyscanner.com.tr/",
};

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
];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

export default function AdminPanel() {
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [biletler, setBiletler] = useState<Bilet[]>(varsayilanBiletler);
  const [duzenlenenId, setDuzenlenenId] = useState<number | null>(null);
  const [form, setForm] = useState(bosForm);
  const [arama, setArama] = useState("");

  useEffect(() => {
    const kayitliGiris = localStorage.getItem("letsgo-admin-giris");
    const kayitliBiletler = localStorage.getItem(STORAGE_KEY);

    if (kayitliGiris === "true") {
      setGirisYapildi(true);
    }

    if (kayitliBiletler) {
      setBiletler(JSON.parse(kayitliBiletler));
    }
  }, []);

  function biletleriKaydet(yeniListe: Bilet[]) {
    setBiletler(yeniListe);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(yeniListe));
  }

  function girisYap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (sifre === ADMIN_SIFRE) {
      setGirisYapildi(true);
      localStorage.setItem("letsgo-admin-giris", "true");
      setHata("");
      return;
    }

    setHata("Şifre yanlış. Şifre: letsgo2026");
  }

  function cikisYap() {
    localStorage.removeItem("letsgo-admin-giris");
    setGirisYapildi(false);
  }

  function formuGuncelle(alan: string, deger: string | number) {
    setForm((onceki) => ({
      ...onceki,
      [alan]: deger,
    }));
  }

  function biletKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.nereden || !form.nereye || !form.ulke || !form.tarih) {
      alert("Lütfen nereden, nereye, ülke ve tarih alanlarını doldur.");
      return;
    }

    const yeniBilet: Bilet = {
      id: duzenlenenId ?? Date.now(),
      nereden: form.nereden,
      nereye: form.nereye,
      ulke: form.ulke,
      fiyat: fiyatYaz(Number(form.fiyatSayi)),
      fiyatSayi: Number(form.fiyatSayi),
      tarih: form.tarih,
      vize: form.vize,
      ay: form.ay,
      havayolu: form.havayolu || "Belirtilmedi",
      sure: form.sure || "Belirtilmedi",
      bagaj: form.bagaj || "Kabin bagajı dahil",
      etiket: form.etiket || "Yeni Fırsat",
      link: form.link || "https://www.skyscanner.com.tr/",
    };

    if (duzenlenenId) {
      const yeniListe = biletler.map((bilet) =>
        bilet.id === duzenlenenId ? yeniBilet : bilet
      );

      biletleriKaydet(yeniListe);
    } else {
      biletleriKaydet([yeniBilet, ...biletler]);
    }

    setForm(bosForm);
    setDuzenlenenId(null);
  }

  function biletDuzenle(bilet: Bilet) {
    setDuzenlenenId(bilet.id);
    setForm({
      nereden: bilet.nereden,
      nereye: bilet.nereye,
      ulke: bilet.ulke,
      fiyatSayi: bilet.fiyatSayi,
      tarih: bilet.tarih,
      vize: bilet.vize,
      ay: bilet.ay,
      havayolu: bilet.havayolu,
      sure: bilet.sure,
      bagaj: bilet.bagaj,
      etiket: bilet.etiket,
      link: bilet.link,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function biletSil(id: number) {
    const eminMi = confirm("Bu bileti silmek istediğine emin misin?");

    if (!eminMi) return;

    const yeniListe = biletler.filter((bilet) => bilet.id !== id);
    biletleriKaydet(yeniListe);
  }

  function biletleriSifirla() {
    const eminMi = confirm("Tüm biletler varsayılana dönecek. Emin misin?");

    if (!eminMi) return;

    biletleriKaydet(varsayilanBiletler);
    setForm(bosForm);
    setDuzenlenenId(null);
  }

  const filtrelenmisBiletler = useMemo(() => {
    return biletler.filter((bilet) => {
      const metin =
        `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.ay} ${bilet.vize}`.toLocaleLowerCase(
          "tr-TR"
        );

      return metin.includes(arama.toLocaleLowerCase("tr-TR"));
    });
  }, [arama, biletler]);

  const toplamFiyat = biletler.reduce((toplam, bilet) => toplam + bilet.fiyatSayi, 0);
  const ortalamaFiyat = biletler.length ? Math.round(toplamFiyat / biletler.length) : 0;

  if (!girisYapildi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <form
          onSubmit={girisYap}
          className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-950 shadow-2xl"
        >
          <img src="/logo.png" alt="Letsgo 2 Travel Logo" className="mx-auto h-28 w-auto" />

          <h1 className="mt-6 text-center text-3xl font-black">
            Admin Panel
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Bilet fırsatlarını yönetmek için giriş yap.
          </p>

          <label className="mt-8 block text-sm font-black text-slate-600">
            Şifre
          </label>

          <input
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            type="password"
            placeholder="Şifreyi yaz"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
          />

          {hata && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
              {hata}
            </p>
          )}

          <button className="mt-5 w-full rounded-xl bg-yellow-400 px-5 py-3 font-black text-slate-950 hover:bg-yellow-300">
            Giriş Yap
          </button>

          <a
            href="/"
            className="mt-4 block text-center text-sm font-bold text-slate-500 hover:text-slate-950"
          >
            Siteye dön
          </a>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Letsgo 2 Travel Logo" className="h-14 w-auto" />

            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel Admin</h1>
              <p className="text-sm text-slate-500">Bilet fırsat yönetimi</p>
            </div>
          </a>

          <div className="flex gap-3">
            <a
              href="/"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
            >
              Siteyi Gör
            </a>

            <button
              onClick={cikisYap}
              className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black hover:bg-slate-300"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Toplam fırsat</p>
            <p className="mt-2 text-4xl font-black">{biletler.length}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Ortalama fiyat</p>
            <p className="mt-2 text-4xl font-black">{fiyatYaz(ortalamaFiyat)}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Vizesiz fırsat</p>
            <p className="mt-2 text-4xl font-black">
              {biletler.filter((bilet) => bilet.vize === "Vizesiz").length}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[420px_1fr]">
        <form onSubmit={biletKaydet} className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {duzenlenenId ? "Bileti Düzenle" : "Yeni Bilet Ekle"}
              </h2>
              <p className="text-sm text-slate-500">
                Bilgileri doldur ve kaydet.
              </p>
            </div>

            {duzenlenenId && (
              <button
                type="button"
                onClick={() => {
                  setDuzenlenenId(null);
                  setForm(bosForm);
                }}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black"
              >
                İptal
              </button>
            )}
          </div>

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">Nereden</label>
                <input
                  value={form.nereden}
                  onChange={(e) => formuGuncelle("nereden", e.target.value)}
                  placeholder="İstanbul"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">Nereye</label>
                <input
                  value={form.nereye}
                  onChange={(e) => formuGuncelle("nereye", e.target.value)}
                  placeholder="Roma"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Ülke</label>
              <input
                value={form.ulke}
                onChange={(e) => formuGuncelle("ulke", e.target.value)}
                placeholder="İtalya"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">Fiyat</label>
                <input
                  value={form.fiyatSayi}
                  onChange={(e) => formuGuncelle("fiyatSayi", Number(e.target.value))}
                  type="number"
                  placeholder="3250"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">Ay</label>
                <select
                  value={form.ay}
                  onChange={(e) => formuGuncelle("ay", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                >
                  <option>Haziran</option>
                  <option>Temmuz</option>
                  <option>Ağustos</option>
                  <option>Eylül</option>
                  <option>Ekim</option>
                  <option>Kasım</option>
                  <option>Aralık</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Tarih</label>
              <input
                value={form.tarih}
                onChange={(e) => formuGuncelle("tarih", e.target.value)}
                placeholder="12 Haziran - 18 Haziran"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">Vize</label>
                <select
                  value={form.vize}
                  onChange={(e) => formuGuncelle("vize", e.target.value as VizeTipi)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                >
                  <option>Vizesiz</option>
                  <option>Vizeli</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">Etiket</label>
                <input
                  value={form.etiket}
                  onChange={(e) => formuGuncelle("etiket", e.target.value)}
                  placeholder="Avrupa Fırsatı"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Havayolu</label>
              <input
                value={form.havayolu}
                onChange={(e) => formuGuncelle("havayolu", e.target.value)}
                placeholder="Pegasus / AJet"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Uçuş Süresi</label>
              <input
                value={form.sure}
                onChange={(e) => formuGuncelle("sure", e.target.value)}
                placeholder="2 saat 35 dk"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">Bagaj</label>
              <input
                value={form.bagaj}
                onChange={(e) => formuGuncelle("bagaj", e.target.value)}
                placeholder="Kabin bagajı dahil"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">
                Satın Al Linki
              </label>
              <input
                value={form.link}
                onChange={(e) => formuGuncelle("link", e.target.value)}
                placeholder="Skyscanner affiliate linki"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <button className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300">
              {duzenlenenId ? "Değişiklikleri Kaydet" : "Bileti Ekle"}
            </button>
          </div>
        </form>

        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">Bilet Listesi</h2>
              <p className="text-sm text-slate-500">
                Eklediğin biletler ana sayfada görünecek.
              </p>
            </div>

            <button
              onClick={biletleriSifirla}
              className="rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-100"
            >
              Varsayılana Dön
            </button>
          </div>

          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Bilet ara..."
            className="mb-5 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
          />

          <div className="grid gap-4">
            {filtrelenmisBiletler.map((bilet) => (
              <div
                key={bilet.id}
                className="rounded-2xl border bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black text-yellow-700">
                      {bilet.etiket}
                    </p>

                    <h3 className="mt-1 text-xl font-black">
                      {bilet.nereden} → {bilet.nereye}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {bilet.ulke} • {bilet.tarih} • {bilet.vize}
                    </p>

                    <p className="mt-2 text-2xl font-black">
                      {bilet.fiyat}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => biletDuzenle(bilet)}
                      className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                    >
                      Düzenle
                    </button>

                    <button
                      onClick={() => biletSil(bilet.id)}
                      className="rounded-xl bg-red-100 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-200"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filtrelenmisBiletler.length === 0 && (
              <div className="rounded-2xl bg-slate-100 p-8 text-center">
                <p className="font-black">Bilet bulunamadı.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}