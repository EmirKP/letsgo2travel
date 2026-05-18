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
  gorselUrl: string;
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
  gorselUrl: string;
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
  gorselUrl: "",
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
  return `${new Intl.NumberFormat("tr-TR").format(Number.isFinite(fiyat) ? fiyat : 0)} TL`;
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

function rotaGorselSinifi(metin: string) {
  const temiz = metin.toLocaleLowerCase("tr-TR");
  if (temiz.includes("roma") || temiz.includes("italya")) return "roma";
  if (temiz.includes("paris") || temiz.includes("fransa")) return "roma";
  if (temiz.includes("saraybosna") || temiz.includes("bosna")) return "saraybosna";
  if (temiz.includes("bakü") || temiz.includes("baku") || temiz.includes("azerbaycan")) return "baku";
  if (temiz.includes("dubai")) return "dubai";
  return "default";
}

function rotaGorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.72)), url(${url})`,
  };
}

function alanDoluMu(...degerler: string[]) {
  return degerler.filter((deger) => deger.trim()).length;
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
        headers: { "x-admin-password": sifreDegeri },
        cache: "no-store",
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Biletler alınamadı.");

      setBiletler(Array.isArray(data.biletler) ? data.biletler : []);
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
    if (!kayitliSifre) return;

    setSifre(kayitliSifre);
    setAdminSifre(kayitliSifre);
    biletleriYukle(kayitliSifre).then((basarili) => {
      if (basarili) setGirisYapildi(true);
    });
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
    setForm((onceki) => ({ ...onceki, [alan]: deger }));
  }

  function formSifirla() {
    setForm(bosForm);
    setDuzenlenenId(null);
    setHata("");
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
      fiyatSayi: Number(form.fiyatSayi || 0),
    };

    setYukleniyor(true);

    try {
      const url = duzenlenenId ? `/api/admin/biletler/${duzenlenenId}` : "/api/admin/biletler";
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
      if (!response.ok) throw new Error(data.message || "Kayıt yapılamadı.");

      await biletleriYukle(adminSifre);
      formSifirla();
      setMesaj(duzenlenenId ? "Fırsat güncellendi." : "Yeni fırsat yayına hazırlandı.");
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
      gorselUrl: bilet.gorselUrl || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function biletSil(id: number) {
    if (!confirm("Bu fırsatı silmek istediğine emin misin?")) return;
    setYukleniyor(true);
    setHata("");

    try {
      const response = await fetch(`/api/admin/biletler/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": adminSifre },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Bilet silinemedi.");

      await biletleriYukle(adminSifre);
      setMesaj("Fırsat silindi.");
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
      if (!response.ok) throw new Error(data.message || "Güncelleme yapılamadı.");
      await biletleriYukle(adminSifre);
    } catch (error) {
      const mesaj = error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  function instagramMetni(bilet: Bilet) {
    return `✈️ ${bilet.nereden} → ${bilet.nereye}\n\n📍 ${bilet.ulke}\n📅 ${bilet.tarih}\n💸 ${bilet.fiyat}\n🛂 ${bilet.vize}\n🎒 ${bilet.bagaj}\n🏷️ ${bilet.kategori}\n\nDetay: https://letsgo2travel.vercel.app/ucak-bileti/${bilet.detaySlug}\n\nFiyatlar değişebilir. Son fiyatı satın alma sayfasında kontrol edin.\n\n#letsgo2travel #ucuzbilet #ucucfirsati #seyahat`;
  }

  function whatsappMetni(bilet: Bilet) {
    return `✈️ Uçuş Fırsatı\n\n${bilet.nereden} → ${bilet.nereye}\n📍 ${bilet.ulke}\n📅 ${bilet.tarih}\n💸 ${bilet.fiyat}\n\nDetay: https://letsgo2travel.vercel.app/ucak-bileti/${bilet.detaySlug}\nSatın al: ${bilet.link}`;
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
      "Görsel URL",
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
      bilet.gorselUrl,
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
      .map((satir) => satir.map((hucre) => `"${String(hucre).replaceAll('"', '""')}"`).join(","))
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
      const metin = `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.kategori} ${bilet.vize} ${bilet.kalkisKodu} ${bilet.varisKodu}`.toLocaleLowerCase("tr-TR");
      const aramaUyuyor = metin.includes(arama.toLocaleLowerCase("tr-TR"));
      const kategoriUyuyor = kategoriFiltresi === "Tümü" || bilet.kategori === kategoriFiltresi;
      const durumUyuyor =
        durumFiltresi === "Tümü" ||
        (durumFiltresi === "Aktif" && bilet.aktif) ||
        (durumFiltresi === "Pasif" && !bilet.aktif) ||
        (durumFiltresi === "Öne Çıkan" && bilet.oneCikan) ||
        (durumFiltresi === "Görselli" && Boolean(bilet.gorselUrl));

      return aramaUyuyor && kategoriUyuyor && durumUyuyor;
    });

    if (siralama === "ucuz") sonuc = [...sonuc].sort((a, b) => a.fiyatSayi - b.fiyatSayi);
    if (siralama === "pahali") sonuc = [...sonuc].sort((a, b) => b.fiyatSayi - a.fiyatSayi);
    if (siralama === "tiklanma") sonuc = [...sonuc].sort((a, b) => b.tiklanma - a.tiklanma);
    if (siralama === "puan") sonuc = [...sonuc].sort((a, b) => b.aramaPuani - a.aramaPuani);

    return sonuc;
  }, [arama, kategoriFiltresi, durumFiltresi, siralama, biletler]);

  const istatistik = useMemo(() => {
    const toplam = biletler.length;
    const aktif = biletler.filter((bilet) => bilet.aktif).length;
    const pasif = biletler.filter((bilet) => !bilet.aktif).length;
    const oneCikan = biletler.filter((bilet) => bilet.oneCikan).length;
    const gorselli = biletler.filter((bilet) => bilet.gorselUrl).length;
    const vizesiz = biletler.filter((bilet) => bilet.vize === "Vizesiz").length;
    const toplamTiklanma = biletler.reduce((toplam, bilet) => toplam + Number(bilet.tiklanma || 0), 0);
    const ortalamaFiyat = toplam ? Math.round(biletler.reduce((toplam, bilet) => toplam + bilet.fiyatSayi, 0) / toplam) : 0;
    const enUcuz = toplam ? [...biletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0] : null;
    const enCokTiklanan = toplam ? [...biletler].sort((a, b) => b.tiklanma - a.tiklanma)[0] : null;

    return { toplam, aktif, pasif, oneCikan, gorselli, vizesiz, toplamTiklanma, ortalamaFiyat, enUcuz, enCokTiklanan };
  }, [biletler]);

  const kategoriAnalizi = useMemo(() => {
    return kategoriSecenekleri
      .map((kategori) => ({ kategori, adet: biletler.filter((bilet) => bilet.kategori === kategori).length }))
      .filter((item) => item.adet > 0);
  }, [biletler]);

  const formDoluluk = useMemo(() => {
    const dolu = alanDoluMu(form.nereden, form.nereye, form.ulke, form.tarih, form.link, form.gorselUrl, form.aciklama, form.kalkisKodu, form.varisKodu);
    return Math.min(100, Math.round((dolu / 9) * 100));
  }, [form]);

  if (!girisYapildi) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#153b7a,#061733_48%,#020617)] px-5 py-10 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-6xl items-center justify-center">
          <form onSubmit={girisYap} className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-2xl">
            <div className="bg-slate-950 px-8 py-8 text-center">
              <img src="/logo.png" alt="Letsgo 2 Travel" className="mx-auto h-20 w-auto" />
              <h1 className="mt-6 text-3xl font-black">Admin Yönetim Merkezi</h1>
              <p className="mt-2 text-sm text-slate-300">Uçuş fırsatı, rota görseli ve ana sayfa yönetimi.</p>
            </div>

            <div className="p-8 text-slate-950">
              <label className="block text-sm font-black text-slate-600">Admin şifresi</label>
              <input
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                type="password"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-yellow-400"
                placeholder="Şifreni yaz"
              />

              {hata && <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-600">{hata}</p>}

              <button disabled={yukleniyor} className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-black text-slate-950 shadow-lg shadow-yellow-400/30 disabled:opacity-60">
                {yukleniyor ? "Kontrol ediliyor..." : "Panele Giriş Yap"}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef3f9] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
        <aside className="hidden border-r border-white/10 bg-slate-950 p-6 text-white lg:block">
          <a href="/" className="block rounded-3xl bg-white/5 p-5">
            <img src="/logo.png" alt="Letsgo 2 Travel" className="h-16 w-auto" />
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Admin Control</p>
          </a>

          <nav className="mt-8 grid gap-3 text-sm font-black">
            <a href="#ozet" className="rounded-2xl bg-white px-4 py-3 text-slate-950">📊 Özet Panel</a>
            <a href="#yeni" className="rounded-2xl bg-white/10 px-4 py-3 text-white hover:bg-white/15">➕ Yeni Fırsat</a>
            <a href="#firsatlar" className="rounded-2xl bg-white/10 px-4 py-3 text-white hover:bg-white/15">✈️ Fırsatlar</a>
            <a href="/admin/dashboard" className="rounded-2xl bg-white/10 px-4 py-3 text-white hover:bg-white/15">📈 Dashboard</a>
            <a href="/admin/ayarlar" className="rounded-2xl bg-white/10 px-4 py-3 text-white hover:bg-white/15">⚙️ Site Ayarları</a>
            <a href="/" target="_blank" className="rounded-2xl bg-yellow-400 px-4 py-3 text-slate-950">🌍 Siteyi Aç</a>
          </nav>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-black">Ana sayfa görselleri</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Görsel URL eklediğin aktif fırsatlar artık ana sayfadaki kartlarda otomatik görünür.
            </p>
          </div>
        </aside>

        <div>
          <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-4">
                <img src="/logo.png" alt="Letsgo 2 Travel" className="h-12 w-auto lg:hidden" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Letsgo 2 Travel</p>
                  <h1 className="text-2xl font-black tracking-tight">Profesyonel Admin Panel</h1>
                  <p className="text-sm text-slate-500">Fırsat ekle, görsel yönet, ana sayfayı güncelle, performansı izle.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={csvIndir} className="rounded-2xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950">CSV İndir</button>
                <button onClick={() => biletleriYukle(adminSifre)} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white">Yenile</button>
                <a href="/" target="_blank" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Siteyi Gör</a>
                <button onClick={cikisYap} className="rounded-2xl bg-red-100 px-4 py-3 text-sm font-black text-red-600">Çıkış</button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] px-5 py-6">
            {(hata || mesaj || kopyaMesaji) && (
              <div className="mb-5 grid gap-3">
                {hata && <p className="rounded-3xl border border-red-200 bg-red-50 p-4 font-bold text-red-600">{hata}</p>}
                {mesaj && <p className="rounded-3xl border border-green-200 bg-green-50 p-4 font-bold text-green-700">{mesaj}</p>}
                {kopyaMesaji && <p className="rounded-3xl border border-yellow-200 bg-yellow-50 p-4 font-bold text-yellow-800">{kopyaMesaji}</p>}
              </div>
            )}

            <section id="ozet" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard title="Toplam fırsat" value={istatistik.toplam} sub="Sistemdeki tüm rotalar" icon="🗂️" />
              <StatCard title="Aktif" value={istatistik.aktif} sub={`${istatistik.pasif} pasif kayıt`} icon="✅" />
              <StatCard title="Öne çıkan" value={istatistik.oneCikan} sub="Ana sayfada üstte gelir" icon="⭐" />
              <StatCard title="Görselli" value={istatistik.gorselli} sub="Ana sayfada güçlü görünür" icon="🖼️" />
              <StatCard title="Tıklanma" value={istatistik.toplamTiklanma} sub="Toplam yönlendirme" icon="📈" />
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl">
                <p className="text-sm font-black text-slate-400">En iyi fırsat özeti</p>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <MiniInsight title="En ucuz" value={istatistik.enUcuz ? `${istatistik.enUcuz.nereden} → ${istatistik.enUcuz.nereye}` : "Yok"} sub={istatistik.enUcuz?.fiyat || "—"} />
                  <MiniInsight title="En çok tıklanan" value={istatistik.enCokTiklanan ? `${istatistik.enCokTiklanan.nereden} → ${istatistik.enCokTiklanan.nereye}` : "Yok"} sub={`${istatistik.enCokTiklanan?.tiklanma || 0} tıklanma`} />
                  <MiniInsight title="Ortalama fiyat" value={fiyatYaz(istatistik.ortalamaFiyat)} sub={`${istatistik.vizesiz} vizesiz rota`} />
                </div>
              </div>

              <div className="rounded-[32px] bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-slate-500">Kategori dağılımı</p>
                    <h2 className="mt-1 text-2xl font-black">Yayın dengesi</h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">{kategoriAnalizi.length} kategori</span>
                </div>

                <div className="mt-5 grid gap-3">
                  {kategoriAnalizi.length === 0 && <p className="text-sm font-bold text-slate-500">Henüz kategori verisi yok.</p>}
                  {kategoriAnalizi.slice(0, 5).map((item) => (
                    <div key={item.kategori}>
                      <div className="mb-2 flex justify-between text-sm font-black">
                        <span>{item.kategori}</span>
                        <span>{item.adet} fırsat</span>
                      </div>
                      <div className="h-3 rounded-full bg-slate-100">
                        <div className="h-3 rounded-full bg-yellow-400" style={{ width: `${yuzde(item.adet, istatistik.toplam)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[520px_1fr]">
              <form id="yeni" onSubmit={biletKaydet} className="rounded-[32px] bg-white p-6 shadow-xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-blue-600">{duzenlenenId ? `#${duzenlenenId} düzenleniyor` : "Yeni kayıt"}</p>
                    <h2 className="mt-1 text-3xl font-black tracking-tight">{duzenlenenId ? "Fırsatı Düzenle" : "Uçuş Fırsatı Ekle"}</h2>
                    <p className="mt-1 text-sm text-slate-500">Bu formdaki görsel URL ana sayfa, arama ve detay kartlarında kullanılır.</p>
                  </div>
                  {duzenlenenId && <button type="button" onClick={formSifirla} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black">İptal</button>}
                </div>

                <div className="mb-5 rounded-3xl bg-slate-50 p-4">
                  <div className="mb-2 flex justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    <span>Form doluluğu</span>
                    <span>{formDoluluk}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-white">
                    <div className="h-3 rounded-full bg-blue-600" style={{ width: `${formDoluluk}%` }} />
                  </div>
                </div>

                <FormSection title="1. Temel rota bilgisi" hint="Ana sayfa ve aramada görünen en önemli alanlar.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Nereden" value={form.nereden} onChange={(v) => formGuncelle("nereden", v)} placeholder="İstanbul" />
                    <Input label="Nereye" value={form.nereye} onChange={(v) => formGuncelle("nereye", v)} placeholder="Roma" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Kalkış kodu" value={form.kalkisKodu} onChange={(v) => formGuncelle("kalkisKodu", v.toUpperCase())} placeholder="IST / SAW" />
                    <Input label="Varış kodu" value={form.varisKodu} onChange={(v) => formGuncelle("varisKodu", v.toUpperCase())} placeholder="FCO / CDG" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[92px_1fr]">
                    <Input label="Emoji" value={form.ulkeEmoji} onChange={(v) => formGuncelle("ulkeEmoji", v)} placeholder="🇮🇹" />
                    <Input label="Ülke" value={form.ulke} onChange={(v) => formGuncelle("ulke", v)} placeholder="İtalya" />
                  </div>
                </FormSection>

                <FormSection title="2. Fiyat, tarih ve yayın" hint="Kullanıcının göreceği kampanya detayları.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Fiyat" value={String(form.fiyatSayi)} onChange={(v) => formGuncelle("fiyatSayi", Number(v))} type="number" placeholder="3250" />
                    <Select label="Ay" value={form.ay} onChange={(v) => formGuncelle("ay", v)} options={aylar} />
                  </div>
                  <Input label="Tarih yazısı" value={form.tarih} onChange={(v) => formGuncelle("tarih", v)} placeholder="12 Haziran - 18 Haziran" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Gidiş tarihi" value={form.gidisTarihi} onChange={(v) => formGuncelle("gidisTarihi", v)} type="date" />
                    <Input label="Dönüş tarihi" value={form.donusTarihi} onChange={(v) => formGuncelle("donusTarihi", v)} type="date" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Vize" value={form.vize} onChange={(v) => formGuncelle("vize", v as VizeTipi)} options={["Vizesiz", "Vizeli"]} />
                    <Select label="Kategori" value={form.kategori} onChange={(v) => formGuncelle("kategori", v)} options={kategoriSecenekleri} />
                  </div>
                </FormSection>

                <FormSection title="3. Görsel ve açıklama" hint="Görsel URL eklersen ana sayfa kartında da görünür.">
                  <Input label="Rota görsel URL" value={form.gorselUrl} onChange={(v) => formGuncelle("gorselUrl", v)} placeholder="https://.../roma.jpg" />
                  <div className={`h-48 overflow-hidden rounded-3xl border bg-slate-900 l2t-route-visual-${rotaGorselSinifi(`${form.nereye} ${form.ulke} ${form.kategori}`)}`} style={rotaGorselStyle(form.gorselUrl)}>
                    <div className="flex h-full flex-col justify-end bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent p-5 text-white">
                      <span className="text-3xl">{form.ulkeEmoji || "✈️"}</span>
                      <strong className="mt-2 text-2xl font-black">{form.nereden || "İstanbul"} → {form.nereye || "Roma"}</strong>
                      <small className="mt-1 font-bold text-white/80">Ana sayfa önizlemesi</small>
                    </div>
                  </div>
                  <Textarea label="Kısa açıklama" value={form.aciklama} onChange={(v) => formGuncelle("aciklama", v)} placeholder="Bu rota hafta sonu kaçamağı için uygun..." />
                </FormSection>

                <FormSection title="4. Uçuş ve yönlendirme" hint="Detay sayfası ve satın alma linki.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Aktarma" value={form.aktarma} onChange={(v) => formGuncelle("aktarma", v)} options={aktarmaSecenekleri} />
                    <Input label="Arama puanı" value={String(form.aramaPuani)} onChange={(v) => formGuncelle("aramaPuani", Number(v))} type="number" placeholder="80" />
                  </div>
                  <Input label="Sağlayıcı" value={form.saglayici} onChange={(v) => formGuncelle("saglayici", v)} placeholder="Letsgo 2 Travel / Skyscanner" />
                  <Input label="Etiket" value={form.etiket} onChange={(v) => formGuncelle("etiket", v)} placeholder="Avrupa Fırsatı" />
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
                </FormSection>

                <div className="mt-6 grid gap-3 rounded-3xl bg-slate-50 p-4">
                  <Toggle checked={form.aktif} onChange={(value) => formGuncelle("aktif", value)} title="Aktif olarak yayınla" sub="Kapalı olursa ana sayfa ve aramada görünmez." />
                  <Toggle checked={form.oneCikan} onChange={(value) => formGuncelle("oneCikan", value)} title="Öne çıkan yap" sub="Ana sayfada ve aramada daha üstte görünür." />
                </div>

                <button disabled={yukleniyor} className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-4 text-lg font-black text-slate-950 shadow-lg shadow-yellow-400/30 disabled:opacity-60">
                  {yukleniyor ? "Kaydediliyor..." : duzenlenenId ? "Değişiklikleri Kaydet" : "Fırsatı Yayına Hazırla"}
                </button>
              </form>

              <section id="firsatlar" className="rounded-[32px] bg-white p-6 shadow-xl">
                <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className="text-sm font-black text-blue-600">Yönetim listesi</p>
                    <h2 className="mt-1 text-3xl font-black tracking-tight">Uçuş Fırsatları</h2>
                    <p className="mt-1 text-sm text-slate-500">Ara, filtrele, düzenle, ana sayfaya çıkar veya sosyal medya metni kopyala.</p>
                  </div>
                  <button onClick={() => biletleriYukle(adminSifre)} className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white">Listeyi Yenile</button>
                </div>

                <div className="mb-5 grid gap-3 lg:grid-cols-5">
                  <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Rota, ülke, kod ara..." className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500 lg:col-span-2" />
                  <select value={kategoriFiltresi} onChange={(e) => setKategoriFiltresi(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500">
                    <option>Tümü</option>
                    {kategoriSecenekleri.map((kategori) => <option key={kategori}>{kategori}</option>)}
                  </select>
                  <select value={durumFiltresi} onChange={(e) => setDurumFiltresi(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500">
                    <option>Tümü</option>
                    <option>Aktif</option>
                    <option>Pasif</option>
                    <option>Öne Çıkan</option>
                    <option>Görselli</option>
                  </select>
                  <select value={siralama} onChange={(e) => setSiralama(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500">
                    <option value="son">Son eklenen</option>
                    <option value="ucuz">Önce en ucuz</option>
                    <option value="pahali">Önce en pahalı</option>
                    <option value="tiklanma">En çok tıklanan</option>
                    <option value="puan">En yüksek puan</option>
                  </select>
                </div>

                <div className="grid gap-4">
                  {filtrelenmisBiletler.map((bilet) => {
                    const gorselSinifi = rotaGorselSinifi(`${bilet.nereye} ${bilet.ulke} ${bilet.kategori}`);
                    return (
                      <article key={bilet.id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50">
                        <div className="grid gap-0 xl:grid-cols-[320px_1fr]">
                          <div className={`min-h-64 bg-slate-900 l2t-route-visual-${gorselSinifi}`} style={rotaGorselStyle(bilet.gorselUrl)}>
                            <div className="flex h-full min-h-64 flex-col justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent p-5 text-white">
                              <div className="flex justify-between gap-3">
                                <span className="rounded-full bg-white/90 px-3 py-2 text-sm font-black text-slate-950">{bilet.ulkeEmoji} {bilet.kategori}</span>
                                <span className="text-3xl">✈️</span>
                              </div>
                              <div>
                                <h3 className="text-2xl font-black">{bilet.nereden} → {bilet.nereye}</h3>
                                <p className="mt-1 text-sm font-bold text-white/80">{bilet.kalkisKodu || "—"} → {bilet.varisKodu || "—"}</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-5">
                            <div className="flex flex-wrap gap-2">
                              <Badge tone={bilet.aktif ? "green" : "red"}>{bilet.aktif ? "Aktif" : "Pasif"}</Badge>
                              {bilet.oneCikan && <Badge tone="dark">Öne çıkan</Badge>}
                              <Badge tone="yellow">{bilet.fiyat}</Badge>
                              <Badge tone="gray">{bilet.tiklanma || 0} tıklanma</Badge>
                              <Badge tone={bilet.gorselUrl ? "blue" : "gray"}>{bilet.gorselUrl ? "Görsel var" : "Görsel yok"}</Badge>
                            </div>

                            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_230px]">
                              <div>
                                <h3 className="text-2xl font-black">{bilet.nereden} → {bilet.nereye}</h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{bilet.ulke} • {bilet.tarih} • {bilet.vize} • {bilet.aktarma}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{bilet.havayolu || "Havayolu yok"} · {bilet.sure || "Süre yok"} · {bilet.saglayici}</p>
                                {bilet.aciklama && <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-medium leading-6 text-slate-600">{bilet.aciklama}</p>}
                                <p className="mt-3 text-xs font-bold text-slate-500">Puan: {bilet.aramaPuani} · Slug: {bilet.detaySlug}</p>
                              </div>

                              <div className="grid gap-2">
                                <button onClick={() => biletDuzenle(bilet)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Düzenle</button>
                                <button onClick={() => biletSil(bilet.id)} className="rounded-2xl bg-red-100 px-4 py-3 text-sm font-black text-red-600">Sil</button>
                                <button onClick={() => hizliGuncelle(bilet, "aktif")} className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black">{bilet.aktif ? "Pasife Al" : "Aktif Yap"}</button>
                                <button onClick={() => hizliGuncelle(bilet, "oneCikan")} className="rounded-2xl bg-yellow-100 px-4 py-3 text-sm font-black text-yellow-800">{bilet.oneCikan ? "Öneden Çıkar" : "Öne Çıkar"}</button>
                                <a href={`/ucak-bileti/${bilet.detaySlug}`} target="_blank" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black">Detay</a>
                                <button onClick={() => metinKopyala(instagramMetni(bilet), "Instagram metni kopyalandı.")} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black">IG Metni</button>
                                <button onClick={() => metinKopyala(whatsappMetni(bilet), "WhatsApp metni kopyalandı.")} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black">WhatsApp</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}

                  {filtrelenmisBiletler.length === 0 && (
                    <div className="rounded-[28px] bg-slate-50 p-12 text-center">
                      <p className="text-2xl font-black">Fırsat bulunamadı.</p>
                      <p className="mt-2 text-slate-500">Filtreleri değiştir veya yeni fırsat ekle.</p>
                    </div>
                  )}
                </div>
              </section>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ title, value, sub, icon }: { title: string; value: string | number; sub: string; icon: string }) {
  return (
    <div className="rounded-[28px] bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{sub}</p>
        </div>
        <span className="rounded-2xl bg-slate-100 p-3 text-2xl">{icon}</span>
      </div>
    </div>
  );
}

function MiniInsight({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl bg-white/10 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <p className="mt-2 text-lg font-black leading-6">{value}</p>
      <p className="mt-1 text-sm font-bold text-yellow-300">{sub}</p>
    </div>
  );
}

function FormSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-100 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-lg font-black">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      </div>
      <div className="grid gap-4 p-4">{children}</div>
    </section>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 outline-none focus:border-blue-500" />
    </div>
  );
}

function Toggle({ checked, onChange, title, sub }: { checked: boolean; onChange: (value: boolean) => void; title: string; sub: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white p-4">
      <span>
        <span className="block font-black">{title}</span>
        <span className="mt-1 block text-xs font-bold text-slate-500">{sub}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5" />
    </label>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "red" | "yellow" | "dark" | "gray" | "blue" }) {
  const styles = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-800",
    dark: "bg-slate-950 text-white",
    gray: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
  }[tone];

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>{children}</span>;
}
