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

const temalar = [
  {
    ad: "Profesyonel Uçuş",
    anaRenk: "#0B1F3A",
    yanRenk1: "#2563EB",
    yanRenk2: "#FACC15",
    yanRenk3: "#10B981",
    koyuRenk: "#07182E",
    arkaPlan: "#F4F7FB",
    kartRenk: "#FFFFFF",
    yaziRenk: "#0B1F3A",
    butonYaziRenk: "#0B1F3A",
  },
  {
    ad: "Premium Gece",
    anaRenk: "#020617",
    yanRenk1: "#38BDF8",
    yanRenk2: "#FACC15",
    yanRenk3: "#22C55E",
    koyuRenk: "#020617",
    arkaPlan: "#E2E8F0",
    kartRenk: "#FFFFFF",
    yaziRenk: "#0F172A",
    butonYaziRenk: "#020617",
  },
  {
    ad: "Mavi Seyahat",
    anaRenk: "#0F172A",
    yanRenk1: "#0EA5E9",
    yanRenk2: "#F97316",
    yanRenk3: "#10B981",
    koyuRenk: "#082F49",
    arkaPlan: "#E0F2FE",
    kartRenk: "#FFFFFF",
    yaziRenk: "#0F172A",
    butonYaziRenk: "#0F172A",
  },
  {
    ad: "Minimal Premium",
    anaRenk: "#111827",
    yanRenk1: "#6366F1",
    yanRenk2: "#F59E0B",
    yanRenk3: "#059669",
    koyuRenk: "#111827",
    arkaPlan: "#F9FAFB",
    kartRenk: "#FFFFFF",
    yaziRenk: "#111827",
    butonYaziRenk: "#111827",
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

      setAyarlar({
        ...varsayilanAyarlar,
        ...data.ayarlar,
      });

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
      yanRenk1: tema.yanRenk1,
      yanRenk2: tema.yanRenk2,
      yanRenk3: tema.yanRenk3,
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

      setAyarlar({
        ...varsayilanAyarlar,
        ...data.ayarlar,
      });

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
            alt="Letsgo 2 Travel"
            className="mx-auto h-24 w-auto"
          />

          <h1 className="mt-6 text-center text-3xl font-black">
            Site Ayarları
          </h1>

          <p className="mt-2 text-center text-slate-500">
            Profesyonel renk sistemi ve görünüm ayarları.
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
              alt="Letsgo 2 Travel"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-2xl font-black">Site Ayarları V6</h1>
              <p className="text-sm text-slate-500">
                1 ana renk + 3 yan renk profesyonel tema sistemi.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/admin"
              className="rounded-xl px-4 py-3 text-sm font-black text-white"
              style={{ backgroundColor: ayarlar.anaRenk }}
            >
              Admin Panel
            </a>

            <a
              href="/"
              className="rounded-xl px-4 py-3 text-sm font-black"
              style={{
                backgroundColor: ayarlar.yanRenk2,
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
              <p
                className="rounded-2xl p-4 font-bold text-white"
                style={{ backgroundColor: ayarlar.yanRenk3 }}
              >
                {mesaj}
              </p>
            )}
          </div>
        )}

        <form onSubmit={ayarlariKaydet} className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Marka Bilgileri</h2>

            <div className="mt-5 grid gap-4">
              <Input
                label="Site başlığı"
                value={ayarlar.siteBaslik}
                onChange={(v) => alanGuncelle("siteBaslik", v)}
              />

              <Input
                label="Alt başlık"
                value={ayarlar.siteAltBaslik}
                onChange={(v) => alanGuncelle("siteAltBaslik", v)}
              />

              <Textarea
                label="Footer metni"
                value={ayarlar.footerMetni}
                onChange={(v) => alanGuncelle("footerMetni", v)}
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Ana Sayfa Hero</h2>

            <div className="mt-5 grid gap-4">
              <Input
                label="Rozet yazısı"
                value={ayarlar.heroRozet}
                onChange={(v) => alanGuncelle("heroRozet", v)}
              />

              <Textarea
                label="Büyük başlık"
                value={ayarlar.heroBaslik}
                onChange={(v) => alanGuncelle("heroBaslik", v)}
              />

              <Textarea
                label="Açıklama"
                value={ayarlar.heroAciklama}
                onChange={(v) => alanGuncelle("heroAciklama", v)}
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Sosyal Medya</h2>

            <div className="mt-5 grid gap-4">
              <Input
                label="Instagram Türkiye"
                value={ayarlar.instagramTr}
                onChange={(v) => alanGuncelle("instagramTr", v)}
              />

              <Input
                label="Instagram English"
                value={ayarlar.instagramEn}
                onChange={(v) => alanGuncelle("instagramEn", v)}
              />

              <Input
                label="WhatsApp linki"
                value={ayarlar.whatsappLink}
                onChange={(v) => alanGuncelle("whatsappLink", v)}
                placeholder="https://whatsapp.com/channel/..."
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow">
            <h2 className="text-2xl font-black">Profesyonel Renk Sistemi</h2>

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
              <ColorInput
                label="Ana renk"
                value={ayarlar.anaRenk}
                onChange={(v) => alanGuncelle("anaRenk", v)}
              />

              <ColorInput
                label="Yan renk 1"
                value={ayarlar.yanRenk1}
                onChange={(v) => alanGuncelle("yanRenk1", v)}
              />

              <ColorInput
                label="Yan renk 2"
                value={ayarlar.yanRenk2}
                onChange={(v) => alanGuncelle("yanRenk2", v)}
              />

              <ColorInput
                label="Yan renk 3"
                value={ayarlar.yanRenk3}
                onChange={(v) => alanGuncelle("yanRenk3", v)}
              />

              <ColorInput
                label="Arka plan"
                value={ayarlar.arkaPlan}
                onChange={(v) => alanGuncelle("arkaPlan", v)}
              />

              <ColorInput
                label="Kart rengi"
                value={ayarlar.kartRenk}
                onChange={(v) => alanGuncelle("kartRenk", v)}
              />

              <ColorInput
                label="Yazı rengi"
                value={ayarlar.yaziRenk}
                onChange={(v) => alanGuncelle("yaziRenk", v)}
              />

              <ColorInput
                label="Buton yazı rengi"
                value={ayarlar.butonYaziRenk}
                onChange={(v) => alanGuncelle("butonYaziRenk", v)}
              />
            </div>

            <div
              className="mt-6 rounded-3xl p-6 text-white"
              style={{ backgroundColor: ayarlar.anaRenk }}
            >
              <p
                className="inline-block rounded-full px-4 py-2 text-sm font-black"
                style={{
                  backgroundColor: ayarlar.yanRenk2,
                  color: ayarlar.butonYaziRenk,
                }}
              >
                Tema Önizleme
              </p>

              <h3 className="mt-5 text-3xl font-black">
                {ayarlar.heroBaslik}
              </h3>

              <p className="mt-3 text-slate-200">{ayarlar.heroAciklama}</p>

              <div className="mt-5 flex flex-wrap gap-3">
                <span
                  className="rounded-xl px-4 py-3 font-black"
                  style={{ backgroundColor: ayarlar.yanRenk1 }}
                >
                  Yan renk 1
                </span>
                <span
                  className="rounded-xl px-4 py-3 font-black text-slate-950"
                  style={{ backgroundColor: ayarlar.yanRenk2 }}
                >
                  Yan renk 2
                </span>
                <span
                  className="rounded-xl px-4 py-3 font-black"
                  style={{ backgroundColor: ayarlar.yanRenk3 }}
                >
                  Yan renk 3
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow lg:col-span-2">
            <h2 className="text-2xl font-black">Ana Sayfa Bölümleri</h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <CheckInput
                label="Günün Fırsatı"
                checked={ayarlar.gununFirsatiGoster}
                onChange={(v) => alanGuncelle("gununFirsatiGoster", v)}
              />

              <CheckInput
                label="Kategori Bölümleri"
                checked={ayarlar.kategorilerGoster}
                onChange={(v) => alanGuncelle("kategorilerGoster", v)}
              />

              <CheckInput
                label="Gezi Rehberleri"
                checked={ayarlar.rehberlerGoster}
                onChange={(v) => alanGuncelle("rehberlerGoster", v)}
              />

              <CheckInput
                label="Fiyat Alarmı"
                checked={ayarlar.fiyatAlarmGoster}
                onChange={(v) => alanGuncelle("fiyatAlarmGoster", v)}
              />

              <CheckInput
                label="Sosyal Medya"
                checked={ayarlar.sosyalMedyaGoster}
                onChange={(v) => alanGuncelle("sosyalMedyaGoster", v)}
              />

              <CheckInput
                label="Sıkça Sorulan Sorular"
                checked={ayarlar.sssGoster}
                onChange={(v) => alanGuncelle("sssGoster", v)}
              />
            </div>
          </section>

          <div className="lg:col-span-2">
            <button
              disabled={yukleniyor}
              className="w-full rounded-2xl px-6 py-5 text-lg font-black shadow disabled:opacity-60"
              style={{
                backgroundColor: ayarlar.yanRenk2,
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

function Input({
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-yellow-400"
      />
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-black text-slate-500">{label}</label>

      <div className="mt-2 flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-14 rounded-xl border"
        />

        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border px-4 py-3 font-bold outline-none focus:border-yellow-400"
        />
      </div>
    </div>
  );
}

function CheckInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-slate-100 p-4 font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}