"use client";

import { FormEvent, useEffect, useState } from "react";

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
    "Yurt içi ve yurt dışı uygun fiyatlı uçuşları takip et. Fırsatı gör, favorilere ekle, paylaş ve bilet arama sayfasına yönlen.",

  instagramTr: "https://www.instagram.com/letsgo2travel_tr/",
  instagramEn: "https://www.instagram.com/letsgo2travel_en/",
  whatsappLink: "",

  temaAdi: "Letsgo Klasik",
  anaRenk: "#FACC15",
  koyuRenk: "#020617",
  arkaPlan: "#F1F5F9",
  kartRenk: "#FFFFFF",
  yaziRenk: "#0F172A",
  butonYaziRenk: "#020617",

  gununFirsatiGoster: true,
  kategorilerGoster: true,
  rehberlerGoster: true,
  fiyatAlarmGoster: true,
  sosyalMedyaGoster: true,
  sssGoster: true,

  footerMetni:
    "Ucuz uçak bileti fırsatlarını paylaşan bağımsız fırsat sitesi.",
};

const temalar = [
  {
    ad: "Letsgo Klasik",
    anaRenk: "#FACC15",
    koyuRenk: "#020617",
    arkaPlan: "#F1F5F9",
    kartRenk: "#FFFFFF",
    yaziRenk: "#0F172A",
    butonYaziRenk: "#020617",
  },
  {
    ad: "Premium Mavi",
    anaRenk: "#38BDF8",
    koyuRenk: "#020617",
    arkaPlan: "#E0F2FE",
    kartRenk: "#FFFFFF",
    yaziRenk: "#0F172A",
    butonYaziRenk: "#020617",
  },
  {
    ad: "Turuncu Seyahat",
    anaRenk: "#FB923C",
    koyuRenk: "#1C1917",
    arkaPlan: "#FFF7ED",
    kartRenk: "#FFFFFF",
    yaziRenk: "#1C1917",
    butonYaziRenk: "#1C1917",
  },
  {
    ad: "Yeşil Doğa",
    anaRenk: "#22C55E",
    koyuRenk: "#052E16",
    arkaPlan: "#F0FDF4",
    kartRenk: "#FFFFFF",
    yaziRenk: "#052E16",
    butonYaziRenk: "#052E16",
  },
  {
    ad: "Minimal Beyaz",
    anaRenk: "#111827",
    koyuRenk: "#111827",
    arkaPlan: "#FFFFFF",
    kartRenk: "#F9FAFB",
    yaziRenk: "#111827",
    butonYaziRenk: "#FFFFFF",
  },
];

export default function AdminAyarlarPage() {
  const [sifre, setSifre] = useState("");
  const [girisYapildi, setGirisYapildi] = useState(false);
  const [ayarlar, setAyarlar] = useState<SiteAyarlari>(varsayilanAyarlar);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [mesaj, setMesaj] = useState("");

  useEffect(() => {
    const kayitliSifre = localStorage.getItem("letsgo-admin-password");

    if (kayitliSifre) {
      setSifre(kayitliSifre);
      ayarlariYukle(kayitliSifre).then((basarili) => {
        if (basarili) setGirisYapildi(true);
      });
    }
  }, []);

  async function ayarlariYukle(sifreDegeri: string) {
    setYukleniyor(true);
    setHata("");

    try {
      const response = await fetch("/api/admin/site-ayarlari", {
        headers: {
          "x-admin-password": sifreDegeri,
        },
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ayarlar alınamadı.");
      }

      setAyarlar(data.ayarlar);
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

  async function girisYap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const basarili = await ayarlariYukle(sifre);

    if (basarili) {
      setGirisYapildi(true);
      localStorage.setItem("letsgo-admin-password", sifre);
    } else {
      setHata("Şifre yanlış olabilir.");
    }
  }

  function alanGuncelle<K extends keyof SiteAyarlari>(
    alan: K,
    deger: SiteAyarlari[K]
  ) {
    setAyarlar((onceki) => ({
      ...onceki,
      [alan]: deger,
    }));
  }

  function temaUygula(temaAdi: string) {
    const tema = temalar.find((item) => item.ad === temaAdi);

    if (!tema) return;

    setAyarlar((onceki) => ({
      ...onceki,
      temaAdi: tema.ad,
      anaRenk: tema.anaRenk,
      koyuRenk: tema.koyuRenk,
      arkaPlan: tema.arkaPlan,
      kartRenk: tema.kartRenk,
      yaziRenk: tema.yaziRenk,
      butonYaziRenk: tema.butonYaziRenk,
    }));
  }

  async function ayarlariKaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setYukleniyor(true);
    setHata("");
    setMesaj("");

    try {
      const response = await fetch("/api/admin/site-ayarlari", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": sifre,
        },
        body: JSON.stringify(ayarlar),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Ayarlar kaydedilemedi.");
      }

      setAyarlar(data.ayarlar);
      setMesaj("Site ayarları kaydedildi.");
      setTimeout(() => setMesaj(""), 2500);
    } catch (error) {
      const mesaj =
        error instanceof Error ? error.message : "Bir hata oluştu.";
      setHata(mesaj);
    } finally {
      setYukleniyor(false);
    }
  }

  if (!girisYapildi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5">
        <form
          onSubmit={girisYap}
          className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
        >
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel Logo"
            className="mx-auto h-24 w-auto"
          />

          <h1 className="mt-6 text-center text-3xl font-black">
            Site Ayarları
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Tema, renk ve ana sayfa yazılarını yönet.
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
    <main
      className="min-h-screen px-5 py-8"
      style={{
        backgroundColor: ayarlar.arkaPlan,
        color: ayarlar.yaziRenk,
      }}
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel Logo"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-2xl font-black">Site Ayarları V3</h1>
              <p className="text-sm text-slate-500">
                Tema, renkler, ana sayfa metinleri ve görünüm kontrolü.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/admin"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              Admin Panel
            </a>

            <a
              href="/"
              className="rounded-xl px-4 py-3 text-sm font-black"
              style={{
                backgroundColor: ayarlar.anaRenk,
                color: ayarlar.butonYaziRenk,
              }}
            >
              Siteyi Gör
            </a>
          </div>
        </header>

        {(hata || mesaj) && (
          <div className="mb-6 grid gap-3">
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
          </div>
        )}

        <form onSubmit={ayarlariKaydet} className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Marka Bilgileri</h2>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Site başlığı
                </label>
                <input
                  value={ayarlar.siteBaslik}
                  onChange={(e) => alanGuncelle("siteBaslik", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Alt başlık
                </label>
                <input
                  value={ayarlar.siteAltBaslik}
                  onChange={(e) =>
                    alanGuncelle("siteAltBaslik", e.target.value)
                  }
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Footer metni
                </label>
                <textarea
                  value={ayarlar.footerMetni}
                  onChange={(e) => alanGuncelle("footerMetni", e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Ana Sayfa Hero</h2>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Rozet yazısı
                </label>
                <input
                  value={ayarlar.heroRozet}
                  onChange={(e) => alanGuncelle("heroRozet", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Büyük başlık
                </label>
                <textarea
                  value={ayarlar.heroBaslik}
                  onChange={(e) => alanGuncelle("heroBaslik", e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Açıklama
                </label>
                <textarea
                  value={ayarlar.heroAciklama}
                  onChange={(e) =>
                    alanGuncelle("heroAciklama", e.target.value)
                  }
                  rows={4}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Sosyal Medya</h2>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-black text-slate-500">
                  Instagram Türkiye
                </label>
                <input
                  value={ayarlar.instagramTr}
                  onChange={(e) => alanGuncelle("instagramTr", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  Instagram English
                </label>
                <input
                  value={ayarlar.instagramEn}
                  onChange={(e) => alanGuncelle("instagramEn", e.target.value)}
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-500">
                  WhatsApp linki
                </label>
                <input
                  value={ayarlar.whatsappLink}
                  onChange={(e) => alanGuncelle("whatsappLink", e.target.value)}
                  placeholder="https://whatsapp.com/channel/..."
                  className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Tema Seçimi</h2>

            <div className="mt-5">
              <label className="text-sm font-black text-slate-500">
                Hazır tema
              </label>

              <select
                value={ayarlar.temaAdi}
                onChange={(e) => temaUygula(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
              >
                {temalar.map((tema) => (
                  <option key={tema.ad}>{tema.ad}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["anaRenk", "Ana renk"],
                ["koyuRenk", "Koyu renk"],
                ["arkaPlan", "Arka plan"],
                ["kartRenk", "Kart rengi"],
                ["yaziRenk", "Yazı rengi"],
                ["butonYaziRenk", "Buton yazı rengi"],
              ].map(([alan, label]) => (
                <div key={alan}>
                  <label className="text-sm font-black text-slate-500">
                    {label}
                  </label>

                  <div className="mt-2 flex gap-2">
                    <input
                      type="color"
                      value={ayarlar[alan as keyof SiteAyarlari] as string}
                      onChange={(e) =>
                        alanGuncelle(
                          alan as keyof SiteAyarlari,
                          e.target.value as any
                        )
                      }
                      className="h-12 w-14 rounded-xl border"
                    />

                    <input
                      value={ayarlar[alan as keyof SiteAyarlari] as string}
                      onChange={(e) =>
                        alanGuncelle(
                          alan as keyof SiteAyarlari,
                          e.target.value as any
                        )
                      }
                      className="w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl p-6 text-white" style={{ backgroundColor: ayarlar.koyuRenk }}>
              <p
                className="inline-block rounded-full px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor: ayarlar.anaRenk,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                Tema Önizleme
              </p>

              <h3 className="mt-5 text-3xl font-black">
                {ayarlar.heroBaslik}
              </h3>

              <p className="mt-3 text-slate-300">
                {ayarlar.heroAciklama}
              </p>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow lg:col-span-2">
            <h2 className="text-2xl font-black">Ana Sayfa Bölümleri</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                ["gununFirsatiGoster", "Günün Fırsatı"],
                ["kategorilerGoster", "Kategori Bölümleri"],
                ["rehberlerGoster", "Gezi Rehberleri"],
                ["fiyatAlarmGoster", "Fiyat Alarmı"],
                ["sosyalMedyaGoster", "Sosyal Medya"],
                ["sssGoster", "Sıkça Sorulan Sorular"],
              ].map(([alan, label]) => (
                <label
                  key={alan}
                  className="flex items-center gap-3 rounded-2xl bg-slate-100 p-4 font-bold"
                >
                  <input
                    type="checkbox"
                    checked={ayarlar[alan as keyof SiteAyarlari] as boolean}
                    onChange={(e) =>
                      alanGuncelle(
                        alan as keyof SiteAyarlari,
                        e.target.checked as any
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <div className="lg:col-span-2">
            <button
              disabled={yukleniyor}
              className="w-full rounded-2xl px-6 py-5 text-lg font-black shadow disabled:opacity-60"
              style={{
                backgroundColor: ayarlar.anaRenk,
                color: ayarlar.butonYaziRenk,
              }}
            >
              {yukleniyor ? "Kaydediliyor..." : "Site Ayarlarını Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}