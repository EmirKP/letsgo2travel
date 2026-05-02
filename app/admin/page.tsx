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
  aktif: boolean;
  oneCikan: boolean;
  kategori: string;
  aciklama: string;
  ulkeEmoji: string;
  sonKontrol: string;
  kampanyaBitis: string;
  tiklanma: number;
};

type BiletForm = {
  nereden: string;
  nereye: string;
  ulke: string;
  fiyatSayi: number;
  tarih: string;
  vize: VizeTipi;
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
};

const bosForm: BiletForm = {
  nereden: "",
  nereye: "",
  ulke: "",
  fiyatSayi: 2500,
  tarih: "",
  vize: "Vizesiz",
  ay: "Haziran",
  havayolu: "",
  sure: "",
  bagaj: "Kabin bagajı dahil",
  etiket: "",
  link: "https://www.skyscanner.com.tr/",
  aktif: true,
  oneCikan: false,
  kategori: "Genel",
  aciklama: "",
  ulkeEmoji: "✈️",
  sonKontrol: "Bugün",
  kampanyaBitis: "",
};

const kategoriSecenekleri = [
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

const aylar = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function yuzdeHesapla(deger: number, toplam: number) {
  if (!toplam) return 0;
  return Math.round((deger / toplam) * 100);
}

export default function AdminPanel() {
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [sifre, setSifre] = useState("");
  const [adminSifre, setAdminSifre] = useState("");
  const [hata, setHata] = useState("");
  const [basariliMesaj, setBasariliMesaj] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [duzenlenenId, setDuzenlenenId] = useState<number | null>(null);
  const [form, setForm] = useState<BiletForm>(bosForm);
  const [arama, setArama] = useState("");
  const [durumFiltresi, setDurumFiltresi] = useState("Tümü");
  const [kategoriFiltresi, setKategoriFiltresi] = useState("Tümü");
  const [siralama, setSiralama] = useState("son");
  const [kopyaMesaji, setKopyaMesaji] = useState("");

  async function biletleriYukle(sifreDegeri: string) {
    setYukleniyor(true);
    setHata("");

    try {
      const response = await fetch("/api/admin/biletler", {
        headers: {
          "x-admin-password": sifreDegeri,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Biletler alınamadı.");
      }

      setBiletler(data.biletler || []);
      return true;
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
      return false;
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    const kayitliSifre = localStorage.getItem("letsgo-admin-password");

    if (kayitliSifre) {
      setAdminSifre(kayitliSifre);
      setSifre(kayitliSifre);

      biletleriYukle(kayitliSifre).then((basarili) => {
        if (basarili) {
          setGirisYapildi(true);
        }
      });
    }
  }, []);

  async function girisYap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!sifre.trim()) {
      setHata("Lütfen admin şifresini yaz.");
      return;
    }

    const basarili = await biletleriYukle(sifre);

    if (basarili) {
      setGirisYapildi(true);
      setAdminSifre(sifre);
      localStorage.setItem("letsgo-admin-password", sifre);
      setHata("");
    } else {
      setHata("Şifre yanlış olabilir veya bağlantı hatası var.");
    }
  }

  function cikisYap() {
    localStorage.removeItem("letsgo-admin-password");
    setGirisYapildi(false);
    setAdminSifre("");
    setSifre("");
    setBiletler([]);
  }

  function formuGuncelle<K extends keyof BiletForm>(
    alan: K,
    deger: BiletForm[K]
  ) {
    setForm((onceki) => ({
      ...onceki,
      [alan]: deger,
    }));
  }

  async function biletKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHata("");
    setBasariliMesaj("");

    if (!form.nereden || !form.nereye || !form.ulke || !form.tarih) {
      setHata("Lütfen nereden, nereye, ülke ve tarih alanlarını doldur.");
      return;
    }

    setYukleniyor(true);

    try {
      const url = duzenlenenId
        ? `/api/admin/biletler/${duzenlenenId}`
        : "/api/admin/biletler";

      const method = duzenlenenId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminSifre,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Kayıt yapılamadı.");
      }

      await biletleriYukle(adminSifre);

      setForm(bosForm);
      setDuzenlenenId(null);
      setBasariliMesaj(
        duzenlenenId ? "Bilet güncellendi." : "Yeni bilet eklendi."
      );

      setTimeout(() => setBasariliMesaj(""), 2500);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
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
      aktif: bilet.aktif,
      oneCikan: bilet.oneCikan,
      kategori: bilet.kategori || "Genel",
      aciklama: bilet.aciklama || "",
      ulkeEmoji: bilet.ulkeEmoji || "✈️",
      sonKontrol: bilet.sonKontrol || "Bugün",
      kampanyaBitis: bilet.kampanyaBitis || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function biletSil(id: number) {
    const eminMi = confirm("Bu bileti silmek istediğine emin misin?");

    if (!eminMi) return;

    setYukleniyor(true);
    setHata("");
    setBasariliMesaj("");

    try {
      const response = await fetch(`/api/admin/biletler/${id}`, {
        method: "DELETE",
        headers: {
          "x-admin-password": adminSifre,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Bilet silinemedi.");
      }

      await biletleriYukle(adminSifre);
      setBasariliMesaj("Bilet silindi.");
      setTimeout(() => setBasariliMesaj(""), 2500);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  async function hizliGuncelle(bilet: Bilet, alan: "aktif" | "oneCikan") {
    setYukleniyor(true);
    setHata("");

    const yeniBilet = {
      ...bilet,
      aktif: alan === "aktif" ? !bilet.aktif : bilet.aktif,
      oneCikan: alan === "oneCikan" ? !bilet.oneCikan : bilet.oneCikan,
    };

    try {
      const response = await fetch(`/api/admin/biletler/${bilet.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminSifre,
        },
        body: JSON.stringify(yeniBilet),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Güncelleme yapılamadı.");
      }

      await biletleriYukle(adminSifre);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  function instagramMetni(bilet: Bilet) {
    return `✈️ ${bilet.nereden} → ${bilet.nereye}

📍 ${bilet.ulke}
📅 ${bilet.tarih}
💸 ${bilet.fiyat}
🛂 ${bilet.vize}
🎒 ${bilet.bagaj}
🏷️ ${bilet.kategori}

Fiyatlar değişebilir. Son fiyatı satın alma sayfasında kontrol edin.

#letsgo2travel #ucuzbilet #seyahat #traveldeals`;
  }

  function whatsappMetni(bilet: Bilet) {
    return `✈️ Uçuş Fırsatı

${bilet.nereden} → ${bilet.nereye}
📍 ${bilet.ulke}
📅 ${bilet.tarih}
💸 ${bilet.fiyat}
🛂 ${bilet.vize}

Satın al: ${bilet.link}`;
  }

  async function metinKopyala(metin: string, mesaj: string) {
    await navigator.clipboard.writeText(metin);
    setKopyaMesaji(mesaj);
    setTimeout(() => setKopyaMesaji(""), 2000);
  }

  function csvIndir() {
    const basliklar = [
      "ID",
      "Nereden",
      "Nereye",
      "Ülke",
      "Fiyat",
      "Tarih",
      "Vize",
      "Ay",
      "Kategori",
      "Aktif",
      "Öne Çıkan",
      "Tıklanma",
      "Link",
    ];

    const satirlar = biletler.map((bilet) => [
      bilet.id,
      bilet.nereden,
      bilet.nereye,
      bilet.ulke,
      bilet.fiyat,
      bilet.tarih,
      bilet.vize,
      bilet.ay,
      bilet.kategori,
      bilet.aktif ? "Aktif" : "Pasif",
      bilet.oneCikan ? "Evet" : "Hayır",
      bilet.tiklanma,
      bilet.link,
    ]);

    const csv = [basliklar, ...satirlar]
      .map((satir) => satir.map((hucre) => `"${hucre}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "letsgo2travel-biletler.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  const filtrelenmisBiletler = useMemo(() => {
    let sonuc = biletler.filter((bilet) => {
      const metin =
        `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.ay} ${bilet.vize} ${bilet.etiket} ${bilet.kategori}`.toLocaleLowerCase(
          "tr-TR"
        );

      const aramaUyuyor = metin.includes(arama.toLocaleLowerCase("tr-TR"));
      const durumUyuyor =
        durumFiltresi === "Tümü" ||
        (durumFiltresi === "Aktif" && bilet.aktif) ||
        (durumFiltresi === "Pasif" && !bilet.aktif) ||
        (durumFiltresi === "Öne Çıkan" && bilet.oneCikan);

      const kategoriUyuyor =
        kategoriFiltresi === "Tümü" || bilet.kategori === kategoriFiltresi;

      return aramaUyuyor && durumUyuyor && kategoriUyuyor;
    });

    if (siralama === "ucuz") {
      sonuc = [...sonuc].sort((a, b) => a.fiyatSayi - b.fiyatSayi);
    }

    if (siralama === "pahali") {
      sonuc = [...sonuc].sort((a, b) => b.fiyatSayi - a.fiyatSayi);
    }

    if (siralama === "tiklanma") {
      sonuc = [...sonuc].sort((a, b) => b.tiklanma - a.tiklanma);
    }

    return sonuc;
  }, [arama, biletler, durumFiltresi, kategoriFiltresi, siralama]);

  const istatistik = useMemo(() => {
    const toplam = biletler.length;
    const aktif = biletler.filter((bilet) => bilet.aktif).length;
    const pasif = biletler.filter((bilet) => !bilet.aktif).length;
    const oneCikan = biletler.filter((bilet) => bilet.oneCikan).length;
    const vizesiz = biletler.filter((bilet) => bilet.vize === "Vizesiz").length;
    const toplamTiklanma = biletler.reduce(
      (toplam, bilet) => toplam + Number(bilet.tiklanma || 0),
      0
    );

    const toplamFiyat = biletler.reduce(
      (toplam, bilet) => toplam + bilet.fiyatSayi,
      0
    );

    const ortalamaFiyat = toplam ? Math.round(toplamFiyat / toplam) : 0;

    const enUcuz = biletler.length
      ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    const enPahali = biletler.length
      ? [...biletler].sort((a, b) => b.fiyatSayi - a.fiyatSayi)[0]
      : null;

    const enCokTiklanan = biletler.length
      ? [...biletler].sort((a, b) => b.tiklanma - a.tiklanma)[0]
      : null;

    return {
      toplam,
      aktif,
      pasif,
      oneCikan,
      vizesiz,
      toplamTiklanma,
      ortalamaFiyat,
      enUcuz,
      enPahali,
      enCokTiklanan,
    };
  }, [biletler]);

  const kategoriAnalizi = useMemo(() => {
    return kategoriSecenekleri
      .map((kategori) => ({
        kategori,
        adet: biletler.filter((bilet) => bilet.kategori === kategori).length,
      }))
      .filter((item) => item.adet > 0);
  }, [biletler]);

  const kalkisSehirleri = useMemo(() => {
    const sehirler = Array.from(new Set(biletler.map((bilet) => bilet.nereden)));

    return sehirler
      .map((sehir) => ({
        sehir,
        adet: biletler.filter((bilet) => bilet.nereden === sehir).length,
      }))
      .sort((a, b) => b.adet - a.adet)
      .slice(0, 6);
  }, [biletler]);

  if (!girisYapildi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <form
          onSubmit={girisYap}
          className="w-full max-w-md rounded-3xl bg-white p-8 text-slate-950 shadow-2xl"
        >
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel Logo"
            className="mx-auto h-28 w-auto"
          />

          <h1 className="mt-6 text-center text-3xl font-black">
            Admin Panel V2
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Gelişmiş bilet yönetimi ve istatistik paneli.
          </p>

          <label className="mt-8 block text-sm font-black text-slate-600">
            Admin şifresi
          </label>

          <input
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            type="password"
            placeholder="Admin şifresini yaz"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
          />

          {hata && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
              {hata}
            </p>
          )}

          <button
            disabled={yukleniyor}
            className="mt-5 w-full rounded-xl bg-yellow-400 px-5 py-3 font-black text-slate-950 hover:bg-yellow-300 disabled:opacity-60"
          >
            {yukleniyor ? "Kontrol ediliyor..." : "Giriş Yap"}
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
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel Logo"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel Admin V2</h1>
              <p className="text-sm text-slate-500">
                Gelişmiş yönetim ve istatistik paneli
              </p>
            </div>
          </a>

          <div className="flex gap-3">
            <button
              onClick={csvIndir}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-yellow-300"
            >
              CSV İndir
            </button>

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
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Toplam fırsat</p>
            <p className="mt-2 text-4xl font-black">{istatistik.toplam}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Aktif fırsat</p>
            <p className="mt-2 text-4xl font-black">{istatistik.aktif}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Toplam tıklanma</p>
            <p className="mt-2 text-4xl font-black">
              {istatistik.toplamTiklanma}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Ortalama fiyat</p>
            <p className="mt-2 text-4xl font-black">
              {fiyatYaz(istatistik.ortalamaFiyat)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow">
            <p className="text-sm font-black text-slate-400">En ucuz fırsat</p>
            <p className="mt-2 text-2xl font-black">
              {istatistik.enUcuz
                ? `${istatistik.enUcuz.nereden} → ${istatistik.enUcuz.nereye}`
                : "Yok"}
            </p>
            <p className="mt-1 text-yellow-300">
              {istatistik.enUcuz?.fiyat || "—"}
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Vizesiz fırsat</p>
            <p className="mt-2 text-4xl font-black">{istatistik.vizesiz}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Öne çıkan</p>
            <p className="mt-2 text-4xl font-black">{istatistik.oneCikan}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">
              En çok tıklanan
            </p>
            <p className="mt-2 text-xl font-black">
              {istatistik.enCokTiklanan
                ? `${istatistik.enCokTiklanan.nereden} → ${istatistik.enCokTiklanan.nereye}`
                : "Yok"}
            </p>
            <p className="mt-1 text-slate-500">
              {istatistik.enCokTiklanan?.tiklanma || 0} tıklanma
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-xl font-black">Kategori Dağılımı</h2>

            <div className="mt-5 grid gap-4">
              {kategoriAnalizi.map((item) => (
                <div key={item.kategori}>
                  <div className="mb-2 flex justify-between text-sm font-bold">
                    <span>{item.kategori}</span>
                    <span>{item.adet} fırsat</span>
                  </div>

                  <div className="h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-yellow-400"
                      style={{
                        width: `${yuzdeHesapla(item.adet, istatistik.toplam)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              {kategoriAnalizi.length === 0 && (
                <p className="text-slate-500">Henüz kategori verisi yok.</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-xl font-black">Kalkış Şehirleri</h2>

            <div className="mt-5 grid gap-4">
              {kalkisSehirleri.map((item) => (
                <div key={item.sehir}>
                  <div className="mb-2 flex justify-between text-sm font-bold">
                    <span>{item.sehir}</span>
                    <span>{item.adet} fırsat</span>
                  </div>

                  <div className="h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-slate-950"
                      style={{
                        width: `${yuzdeHesapla(item.adet, istatistik.toplam)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              {kalkisSehirleri.length === 0 && (
                <p className="text-slate-500">Henüz şehir verisi yok.</p>
              )}
            </div>
          </div>
        </div>

        {(hata || basariliMesaj || kopyaMesaji) && (
          <div className="mt-5 grid gap-3">
            {hata && (
              <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-600">
                {hata}
              </p>
            )}

            {basariliMesaj && (
              <p className="rounded-2xl bg-green-50 p-4 font-bold text-green-700">
                {basariliMesaj}
              </p>
            )}

            {kopyaMesaji && (
              <p className="rounded-2xl bg-yellow-50 p-4 font-bold text-yellow-800">
                {kopyaMesaji}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[440px_1fr]">
        <form onSubmit={biletKaydet} className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {duzenlenenId ? "Bileti Düzenle" : "Yeni Bilet Ekle"}
              </h2>
              <p className="text-sm text-slate-500">
                V2 form: kategori, açıklama, son kontrol ve sosyal metin uyumlu.
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
                <label className="text-sm font-black text-slate-500">
                  Nereden
                </label>
                <input
                  value={form.nereden}
                  onChange={(e) => formuGuncelle("nereden", e.target.value)}
                  placeholder="İstanbul"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Nereye
                </label>
                <input
                  value={form.nereye}
                  onChange={(e) => formuGuncelle("nereye", e.target.value)}
                  placeholder="Roma"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Bayrak
                </label>
                <input
                  value={form.ulkeEmoji}
                  onChange={(e) => formuGuncelle("ulkeEmoji", e.target.value)}
                  placeholder="🇮🇹"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Fiyat
                </label>
                <input
                  value={form.fiyatSayi}
                  onChange={(e) =>
                    formuGuncelle("fiyatSayi", Number(e.target.value))
                  }
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
                  {aylar.map((ay) => (
                    <option key={ay}>{ay}</option>
                  ))}
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
                  onChange={(e) =>
                    formuGuncelle("vize", e.target.value as VizeTipi)
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                >
                  <option>Vizesiz</option>
                  <option>Vizeli</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Kategori
                </label>
                <select
                  value={form.kategori}
                  onChange={(e) => formuGuncelle("kategori", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                >
                  {kategoriSecenekleri.map((kategori) => (
                    <option key={kategori}>{kategori}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">
                Etiket
              </label>
              <input
                value={form.etiket}
                onChange={(e) => formuGuncelle("etiket", e.target.value)}
                placeholder="Avrupa Fırsatı"
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div>
              <label className="text-sm font-black text-slate-500">
                Kısa açıklama
              </label>
              <textarea
                value={form.aciklama}
                onChange={(e) => formuGuncelle("aciklama", e.target.value)}
                placeholder="Bu rota hafta sonu kaçamağı için uygun..."
                rows={3}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Havayolu
                </label>
                <input
                  value={form.havayolu}
                  onChange={(e) => formuGuncelle("havayolu", e.target.value)}
                  placeholder="Pegasus / AJet"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Uçuş Süresi
                </label>
                <input
                  value={form.sure}
                  onChange={(e) => formuGuncelle("sure", e.target.value)}
                  placeholder="2 saat 35 dk"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Son kontrol
                </label>
                <input
                  value={form.sonKontrol}
                  onChange={(e) => formuGuncelle("sonKontrol", e.target.value)}
                  placeholder="Bugün / 03.05.2026"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Kampanya bitiş
                </label>
                <input
                  value={form.kampanyaBitis}
                  onChange={(e) =>
                    formuGuncelle("kampanyaBitis", e.target.value)
                  }
                  placeholder="Stoklarla sınırlı"
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
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

            <div className="grid gap-3 rounded-2xl bg-slate-100 p-4">
              <label className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={(e) => formuGuncelle("aktif", e.target.checked)}
                />
                Aktif olarak yayınla
              </label>

              <label className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  checked={form.oneCikan}
                  onChange={(e) =>
                    formuGuncelle("oneCikan", e.target.checked)
                  }
                />
                Öne çıkan fırsat yap
              </label>
            </div>

            <button
              disabled={yukleniyor}
              className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300 disabled:opacity-60"
            >
              {yukleniyor
                ? "Kaydediliyor..."
                : duzenlenenId
                  ? "Değişiklikleri Kaydet"
                  : "Bileti Ekle"}
            </button>
          </div>
        </form>

        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">Bilet Listesi</h2>
              <p className="text-sm text-slate-500">
                Arama, filtre, sosyal metin ve hızlı yönetim.
              </p>
            </div>

            <button
              onClick={() => biletleriYukle(adminSifre)}
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
            >
              Yenile
            </button>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Bilet ara..."
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400 md:col-span-2"
            />

            <select
              value={durumFiltresi}
              onChange={(e) => setDurumFiltresi(e.target.value)}
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
            >
              <option>Tümü</option>
              <option>Aktif</option>
              <option>Pasif</option>
              <option>Öne Çıkan</option>
            </select>

            <select
              value={kategoriFiltresi}
              onChange={(e) => setKategoriFiltresi(e.target.value)}
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
            >
              <option>Tümü</option>
              {kategoriSecenekleri.map((kategori) => (
                <option key={kategori}>{kategori}</option>
              ))}
            </select>
          </div>

          <div className="mb-5">
            <select
              value={siralama}
              onChange={(e) => setSiralama(e.target.value)}
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
            >
              <option value="son">Son eklenen</option>
              <option value="ucuz">Önce en ucuz</option>
              <option value="pahali">Önce en pahalı</option>
              <option value="tiklanma">En çok tıklanan</option>
            </select>
          </div>

          <div className="grid gap-4">
            {filtrelenmisBiletler.map((bilet) => (
              <div key={bilet.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">
                        {bilet.ulkeEmoji} {bilet.kategori}
                      </span>

                      <span
                        className={
                          bilet.aktif
                            ? "rounded-full bg-green-100 px-3 py-1 text-xs font-black text-green-700"
                            : "rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700"
                        }
                      >
                        {bilet.aktif ? "Aktif" : "Pasif"}
                      </span>

                      {bilet.oneCikan && (
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                          Öne çıkan
                        </span>
                      )}

                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                        {bilet.tiklanma || 0} tıklanma
                      </span>
                    </div>

                    <h3 className="mt-3 text-xl font-black">
                      {bilet.nereden} → {bilet.nereye}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {bilet.ulke} • {bilet.tarih} • {bilet.vize}
                    </p>

                    <p className="mt-2 text-2xl font-black">{bilet.fiyat}</p>

                    {bilet.aciklama && (
                      <p className="mt-2 max-w-2xl text-sm text-slate-600">
                        {bilet.aciklama}
                      </p>
                    )}

                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Son kontrol: {bilet.sonKontrol || "Bugün"}
                      {bilet.kampanyaBitis
                        ? ` • Bitiş: ${bilet.kampanyaBitis}`
                        : ""}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-80">
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

                    <button
                      onClick={() => hizliGuncelle(bilet, "aktif")}
                      className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black hover:bg-slate-300"
                    >
                      {bilet.aktif ? "Pasife Al" : "Aktif Yap"}
                    </button>

                    <button
                      onClick={() => hizliGuncelle(bilet, "oneCikan")}
                      className="rounded-xl bg-yellow-100 px-4 py-3 text-sm font-black text-yellow-800 hover:bg-yellow-200"
                    >
                      {bilet.oneCikan ? "Öneden Çıkar" : "Öne Çıkar"}
                    </button>

                    <button
                      onClick={() =>
                        metinKopyala(
                          instagramMetni(bilet),
                          "Instagram metni kopyalandı."
                        )
                      }
                      className="rounded-xl border px-4 py-3 text-sm font-black hover:border-yellow-400 hover:bg-yellow-50"
                    >
                      Instagram Metni
                    </button>

                    <button
                      onClick={() =>
                        metinKopyala(
                          whatsappMetni(bilet),
                          "WhatsApp metni kopyalandı."
                        )
                      }
                      className="rounded-xl border px-4 py-3 text-sm font-black hover:border-yellow-400 hover:bg-yellow-50"
                    >
                      WhatsApp Metni
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