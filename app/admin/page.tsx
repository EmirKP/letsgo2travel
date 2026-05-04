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

  kalkisKodu: string;
  varisKodu: string;
  aktarma: string;
  saglayici: string;
  aramaPuani: number;
  gidisTarihi: string | null;
  donusTarihi: string | null;
  detaySlug: string;
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

  kalkisKodu: string;
  varisKodu: string;
  aktarma: string;
  saglayici: string;
  aramaPuani: number;
  gidisTarihi: string;
  donusTarihi: string;
  detaySlug: string;
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

  kalkisKodu: "",
  varisKodu: "",
  aktarma: "Farketmez",
  saglayici: "Letsgo 2 Travel",
  aramaPuani: 80,
  gidisTarihi: "",
  donusTarihi: "",
  detaySlug: "",
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

const aktarmaSecenekleri = ["Farketmez", "Aktarmasız", "1 Aktarma", "2+ Aktarma"];

function fiyatYaz(fiyat: number) {
  return `${new Intl.NumberFormat("tr-TR").format(fiyat)} TL`;
}

function slugOlustur(nereden: string, nereye: string) {
  return `${nereden}-${nereye}`
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function yuzde(deger: number, toplam: number) {
  if (!toplam) return 0;
  return Math.round((deger / toplam) * 100);
}

export default function AdminPanel() {
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [sifre, setSifre] = useState("");
  const [adminSifre, setAdminSifre] = useState("");

  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [form, setForm] = useState<BiletForm>(bosForm);
  const [duzenlenenId, setDuzenlenenId] = useState<number | null>(null);

  const [arama, setArama] = useState("");
  const [kategoriFiltresi, setKategoriFiltresi] = useState("Tümü");
  const [durumFiltresi, setDurumFiltresi] = useState("Tümü");
  const [siralama, setSiralama] = useState("son");

  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [mesaj, setMesaj] = useState("");
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
      const mesaj = error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
      return false;
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    const kayitliSifre = localStorage.getItem("letsgo-admin-password");

    if (kayitliSifre) {
      setSifre(kayitliSifre);
      setAdminSifre(kayitliSifre);

      biletleriYukle(kayitliSifre).then((basarili) => {
        if (basarili) setGirisYapildi(true);
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
    } else {
      setHata("Şifre yanlış olabilir veya bağlantı hatası var.");
    }
  }

  function cikisYap() {
    localStorage.removeItem("letsgo-admin-password");
    setGirisYapildi(false);
    setSifre("");
    setAdminSifre("");
    setBiletler([]);
  }

  function formGuncelle<K extends keyof BiletForm>(alan: K, deger: BiletForm[K]) {
    setForm((onceki) => ({
      ...onceki,
      [alan]: deger,
    }));
  }

  async function biletKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setHata("");
    setMesaj("");

    if (!form.nereden || !form.nereye || !form.ulke || !form.tarih) {
      setHata("Nereden, nereye, ülke ve tarih alanları zorunlu.");
      return;
    }

    const gonderilecekForm = {
      ...form,
      detaySlug: form.detaySlug || slugOlustur(form.nereden, form.nereye),
    };

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
        body: JSON.stringify(gonderilecekForm),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Kayıt yapılamadı.");
      }

      await biletleriYukle(adminSifre);

      setForm(bosForm);
      setDuzenlenenId(null);
      setMesaj(duzenlenenId ? "Bilet güncellendi." : "Yeni bilet eklendi.");

      setTimeout(() => setMesaj(""), 2500);
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : "Bir hata oluştu.";
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

      kalkisKodu: bilet.kalkisKodu || "",
      varisKodu: bilet.varisKodu || "",
      aktarma: bilet.aktarma || "Farketmez",
      saglayici: bilet.saglayici || "Letsgo 2 Travel",
      aramaPuani: bilet.aramaPuani || 80,
      gidisTarihi: bilet.gidisTarihi || "",
      donusTarihi: bilet.donusTarihi || "",
      detaySlug: bilet.detaySlug || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function biletSil(id: number) {
    const eminMi = confirm("Bu bileti silmek istediğine emin misin?");
    if (!eminMi) return;

    setYukleniyor(true);
    setHata("");

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
      setMesaj("Bilet silindi.");
      setTimeout(() => setMesaj(""), 2500);
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  async function hizliGuncelle(bilet: Bilet, alan: "aktif" | "oneCikan") {
    const guncelBilet = {
      ...bilet,
      aktif: alan === "aktif" ? !bilet.aktif : bilet.aktif,
      oneCikan: alan === "oneCikan" ? !bilet.oneCikan : bilet.oneCikan,
    };

    setYukleniyor(true);

    try {
      const response = await fetch(`/api/admin/biletler/${bilet.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminSifre,
        },
        body: JSON.stringify(guncelBilet),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Güncelleme yapılamadı.");
      }

      await biletleriYukle(adminSifre);
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : "Bir hata oluştu.";
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

Fırsat detayı:
https://letsgo2travel.vercel.app/ucak-bileti/${bilet.detaySlug}

Fiyatlar değişebilir. Son fiyatı satın alma sayfasında kontrol edin.

#letsgo2travel #ucuzbilet #ucucfirsati #seyahat`;
  }

  function whatsappMetni(bilet: Bilet) {
    return `✈️ Uçuş Fırsatı

${bilet.nereden} → ${bilet.nereye}
📍 ${bilet.ulke}
📅 ${bilet.tarih}
💸 ${bilet.fiyat}
🛂 ${bilet.vize}
🎒 ${bilet.bagaj}

Detay:
https://letsgo2travel.vercel.app/ucak-bileti/${bilet.detaySlug}

Satın al:
${bilet.link}`;
  }

  async function metinKopyala(metin: string, mesaj: string) {
    await navigator.clipboard.writeText(metin);
    setKopyaMesaji(mesaj);
    setTimeout(() => setKopyaMesaji(""), 2200);
  }

  function csvIndir() {
    const basliklar = [
      "ID",
      "Nereden",
      "Kalkış Kodu",
      "Nereye",
      "Varış Kodu",
      "Ülke",
      "Fiyat",
      "Tarih",
      "Vize",
      "Kategori",
      "Aktarma",
      "Sağlayıcı",
      "Arama Puanı",
      "Aktif",
      "Öne Çıkan",
      "Tıklanma",
      "Detay Slug",
      "Link",
    ];

    const satirlar = biletler.map((bilet) => [
      bilet.id,
      bilet.nereden,
      bilet.kalkisKodu,
      bilet.nereye,
      bilet.varisKodu,
      bilet.ulke,
      bilet.fiyat,
      bilet.tarih,
      bilet.vize,
      bilet.kategori,
      bilet.aktarma,
      bilet.saglayici,
      bilet.aramaPuani,
      bilet.aktif ? "Aktif" : "Pasif",
      bilet.oneCikan ? "Evet" : "Hayır",
      bilet.tiklanma,
      bilet.detaySlug,
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
      const metin = `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.kategori} ${bilet.vize} ${bilet.kalkisKodu} ${bilet.varisKodu}`
        .toLocaleLowerCase("tr-TR");

      const aramaUyuyor = metin.includes(arama.toLocaleLowerCase("tr-TR"));

      const kategoriUyuyor =
        kategoriFiltresi === "Tümü" || bilet.kategori === kategoriFiltresi;

      const durumUyuyor =
        durumFiltresi === "Tümü" ||
        (durumFiltresi === "Aktif" && bilet.aktif) ||
        (durumFiltresi === "Pasif" && !bilet.aktif) ||
        (durumFiltresi === "Öne Çıkan" && bilet.oneCikan);

      return aramaUyuyor && kategoriUyuyor && durumUyuyor;
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

    if (siralama === "puan") {
      sonuc = [...sonuc].sort((a, b) => b.aramaPuani - a.aramaPuani);
    }

    return sonuc;
  }, [arama, kategoriFiltresi, durumFiltresi, siralama, biletler]);

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

    const ortalamaFiyat = toplam
      ? Math.round(
          biletler.reduce((toplam, bilet) => toplam + bilet.fiyatSayi, 0) /
            toplam
        )
      : 0;

    const enUcuz = toplam
      ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
      : null;

    const enCokTiklanan = toplam
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

  if (!girisYapildi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5">
        <form
          onSubmit={girisYap}
          className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
        >
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel"
            className="mx-auto h-28 w-auto"
          />

          <h1 className="mt-6 text-center text-3xl font-black">
            Admin Panel V4
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Skyscanner tarzı arama ve fırsat yönetim merkezi.
          </p>

          <label className="mt-8 block text-sm font-black text-slate-600">
            Admin şifresi
          </label>

          <input
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            type="password"
            className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
          />

          {hata && (
            <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600">
              {hata}
            </p>
          )}

          <button
            disabled={yukleniyor}
            className="mt-5 w-full rounded-xl bg-yellow-400 px-5 py-3 font-black text-slate-950 disabled:opacity-60"
          >
            {yukleniyor ? "Kontrol ediliyor..." : "Giriş Yap"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel Admin V4</h1>
              <p className="text-sm text-slate-500">
                Uçuş arama, fırsat, istatistik ve içerik yönetimi.
              </p>
            </div>
          </a>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={csvIndir}
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950"
            >
              CSV İndir
            </button>

            <a
              href="/admin/ayarlar"
              className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black"
            >
              Site Ayarları
            </a>

            <a
              href="/"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              Siteyi Gör
            </a>

            <button
              onClick={cikisYap}
              className="rounded-xl bg-red-100 px-4 py-3 text-sm font-black text-red-600"
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

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
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

        {kategoriAnalizi.length > 0 && (
          <div className="mt-4 rounded-3xl bg-white p-6 shadow">
            <h2 className="text-xl font-black">Kategori Dağılımı</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
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
                        width: `${yuzde(item.adet, istatistik.toplam)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(hata || mesaj || kopyaMesaji) && (
          <div className="mt-5 grid gap-3">
            {hata && (
              <p className="rounded-2xl bg-red-50 p-4 font-bold text-red-600">
                {hata}
              </p>
            )}
            {mesaj && (
              <p className="rounded-2xl bg-green-50 p-4 font-bold text-green-700">
                {mesaj}
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

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[460px_1fr]">
        <form onSubmit={biletKaydet} className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">
                {duzenlenenId ? "Bileti Düzenle" : "Yeni Uçuş Fırsatı Ekle"}
              </h2>
              <p className="text-sm text-slate-500">
                Skyscanner tarzı arama için detaylı alanlar.
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
              <Input label="Nereden" value={form.nereden} onChange={(v) => formGuncelle("nereden", v)} placeholder="İstanbul" />
              <Input label="Nereye" value={form.nereye} onChange={(v) => formGuncelle("nereye", v)} placeholder="Roma" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Kalkış kodu" value={form.kalkisKodu} onChange={(v) => formGuncelle("kalkisKodu", v.toUpperCase())} placeholder="IST / SAW / ESB" />
              <Input label="Varış kodu" value={form.varisKodu} onChange={(v) => formGuncelle("varisKodu", v.toUpperCase())} placeholder="FCO / CDG / GYD" />
            </div>

            <div className="grid gap-4 sm:grid-cols-[90px_1fr]">
              <Input label="Emoji" value={form.ulkeEmoji} onChange={(v) => formGuncelle("ulkeEmoji", v)} placeholder="🇮🇹" />
              <Input label="Ülke" value={form.ulke} onChange={(v) => formGuncelle("ulke", v)} placeholder="İtalya" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Fiyat" value={String(form.fiyatSayi)} onChange={(v) => formGuncelle("fiyatSayi", Number(v))} type="number" placeholder="3250" />

              <Select
                label="Ay"
                value={form.ay}
                onChange={(v) => formGuncelle("ay", v)}
                options={aylar}
              />
            </div>

            <Input label="Tarih yazısı" value={form.tarih} onChange={(v) => formGuncelle("tarih", v)} placeholder="12 Haziran - 18 Haziran" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Gidiş tarihi" value={form.gidisTarihi} onChange={(v) => formGuncelle("gidisTarihi", v)} type="date" />
              <Input label="Dönüş tarihi" value={form.donusTarihi} onChange={(v) => formGuncelle("donusTarihi", v)} type="date" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Vize"
                value={form.vize}
                onChange={(v) => formGuncelle("vize", v as VizeTipi)}
                options={["Vizesiz", "Vizeli"]}
              />

              <Select
                label="Kategori"
                value={form.kategori}
                onChange={(v) => formGuncelle("kategori", v)}
                options={kategoriSecenekleri}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Aktarma"
                value={form.aktarma}
                onChange={(v) => formGuncelle("aktarma", v)}
                options={aktarmaSecenekleri}
              />

              <Input label="Arama puanı" value={String(form.aramaPuani)} onChange={(v) => formGuncelle("aramaPuani", Number(v))} type="number" placeholder="80" />
            </div>

            <Input label="Sağlayıcı" value={form.saglayici} onChange={(v) => formGuncelle("saglayici", v)} placeholder="Letsgo 2 Travel / Skyscanner / Travelpayouts" />

            <Input label="Etiket" value={form.etiket} onChange={(v) => formGuncelle("etiket", v)} placeholder="Avrupa Fırsatı" />

            <Textarea label="Kısa açıklama" value={form.aciklama} onChange={(v) => formGuncelle("aciklama", v)} placeholder="Bu rota hafta sonu kaçamağı için uygun..." />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Havayolu" value={form.havayolu} onChange={(v) => formGuncelle("havayolu", v)} placeholder="Pegasus / AJet" />
              <Input label="Uçuş süresi" value={form.sure} onChange={(v) => formGuncelle("sure", v)} placeholder="2 saat 35 dk" />
            </div>

            <Input label="Bagaj" value={form.bagaj} onChange={(v) => formGuncelle("bagaj", v)} placeholder="Kabin bagajı dahil" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Son kontrol" value={form.sonKontrol} onChange={(v) => formGuncelle("sonKontrol", v)} placeholder="Bugün" />
              <Input label="Kampanya bitiş" value={form.kampanyaBitis} onChange={(v) => formGuncelle("kampanyaBitis", v)} placeholder="Stoklarla sınırlı" />
            </div>

            <Input label="Detay URL slug" value={form.detaySlug} onChange={(v) => formGuncelle("detaySlug", v)} placeholder="istanbul-roma" />

            <Input label="Satın al linki" value={form.link} onChange={(v) => formGuncelle("link", v)} placeholder="Affiliate / satın alma linki" />

            <div className="grid gap-3 rounded-2xl bg-slate-100 p-4">
              <label className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={(e) => formGuncelle("aktif", e.target.checked)}
                />
                Aktif olarak yayınla
              </label>

              <label className="flex items-center gap-3 font-bold">
                <input
                  type="checkbox"
                  checked={form.oneCikan}
                  onChange={(e) => formGuncelle("oneCikan", e.target.checked)}
                />
                Günün fırsatı / öne çıkan yap
              </label>
            </div>

            <button
              disabled={yukleniyor}
              className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950 disabled:opacity-60"
            >
              {yukleniyor
                ? "Kaydediliyor..."
                : duzenlenenId
                  ? "Değişiklikleri Kaydet"
                  : "Fırsatı Ekle"}
            </button>
          </div>
        </form>

        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black">Uçuş Fırsatları</h2>
              <p className="text-sm text-slate-500">
                Arama, filtre, sosyal medya metni ve hızlı yönetim.
              </p>
            </div>

            <button
              onClick={() => biletleriYukle(adminSifre)}
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              Yenile
            </button>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Rota, ülke, kod ara..."
              className="rounded-xl border px-4 py-3 outline-none focus:border-yellow-400 md:col-span-2"
            />

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
              <option value="puan">En yüksek arama puanı</option>
            </select>
          </div>

          <div className="grid gap-4">
            {filtrelenmisBiletler.map((bilet) => (
              <article key={bilet.id} className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">
                        {bilet.ulkeEmoji} {bilet.kategori}
                      </span>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {bilet.kalkisKodu || "—"} → {bilet.varisKodu || "—"}
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
                      {bilet.ulke} • {bilet.tarih} • {bilet.vize} • {bilet.aktarma}
                    </p>

                    <p className="mt-2 text-3xl font-black">{bilet.fiyat}</p>

                    <p className="mt-2 text-sm text-slate-600">
                      {bilet.havayolu} · {bilet.sure} · {bilet.saglayici}
                    </p>

                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Puan: {bilet.aramaPuani} · Slug: {bilet.detaySlug}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:min-w-96">
                    <button
                      onClick={() => biletDuzenle(bilet)}
                      className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                    >
                      Düzenle
                    </button>

                    <button
                      onClick={() => biletSil(bilet.id)}
                      className="rounded-xl bg-red-100 px-4 py-3 text-sm font-black text-red-600"
                    >
                      Sil
                    </button>

                    <button
                      onClick={() => hizliGuncelle(bilet, "aktif")}
                      className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-black"
                    >
                      {bilet.aktif ? "Pasife Al" : "Aktif Yap"}
                    </button>

                    <button
                      onClick={() => hizliGuncelle(bilet, "oneCikan")}
                      className="rounded-xl bg-yellow-100 px-4 py-3 text-sm font-black text-yellow-800"
                    >
                      {bilet.oneCikan ? "Öneden Çıkar" : "Öne Çıkar"}
                    </button>

                    <a
                      href={`/ucak-bileti/${bilet.detaySlug}`}
                      target="_blank"
                      className="rounded-xl border px-4 py-3 text-center text-sm font-black"
                    >
                      Detay Sayfası
                    </a>

                    <a
                      href="/arama"
                      target="_blank"
                      className="rounded-xl border px-4 py-3 text-center text-sm font-black"
                    >
                      Aramada Gör
                    </a>

                    <button
                      onClick={() =>
                        metinKopyala(
                          instagramMetni(bilet),
                          "Instagram metni kopyalandı."
                        )
                      }
                      className="rounded-xl border px-4 py-3 text-sm font-black"
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
                      className="rounded-xl border px-4 py-3 text-sm font-black"
                    >
                      WhatsApp Metni
                    </button>
                  </div>
                </div>
              </article>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
      />
    </div>
  );
}