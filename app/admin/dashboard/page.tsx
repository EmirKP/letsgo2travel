"use client";

import { useEffect, useState } from "react";

type Bilet = {
  id: number;
  nereden: string;
  nereye: string;
  ulke: string;
  fiyat: string;
  fiyatSayi: number;
  vize: string;
  kategori: string;
  aktif: boolean;
  oneCikan: boolean;
  tiklanma: number;
};

function fiyatYaz(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(value || 0)} TL`;
}

export default function AdminDashboardPage() {
  const [biletler, setBiletler] = useState<Bilet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  useEffect(() => {
    async function yukle() {
      setYukleniyor(true);
      setHata("");

      try {
        const response = await fetch("/api/biletler", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Biletler alınamadı.");
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

    yukle();
  }, []);

  const aktifBiletler = biletler.filter((bilet) => bilet.aktif !== false);
  const vizesizler = aktifBiletler.filter((bilet) => bilet.vize === "Vizesiz");
  const oneCikanlar = aktifBiletler.filter((bilet) => bilet.oneCikan);

  const enUcuz = aktifBiletler.length
    ? [...aktifBiletler].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0]
    : null;

  const toplamTiklanma = aktifBiletler.reduce(
    (toplam, bilet) => toplam + (bilet.tiklanma || 0),
    0
  );

  const ortalamaFiyat = aktifBiletler.length
    ? Math.round(
        aktifBiletler.reduce((toplam, bilet) => toplam + bilet.fiyatSayi, 0) /
          aktifBiletler.length
      )
    : 0;

  const enCokTiklananlar = [...aktifBiletler]
    .sort((a, b) => (b.tiklanma || 0) - (a.tiklanma || 0))
    .slice(0, 5);

  const enUcuzlar = [...aktifBiletler]
    .sort((a, b) => a.fiyatSayi - b.fiyatSayi)
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-2xl font-black">Admin Dashboard</h1>
              <p className="text-sm text-slate-500">
                Letsgo 2 Travel yönetim özeti
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/admin"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
            >
              Bilet Admin
            </a>

            <a
              href="/admin/ayarlar"
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white"
            >
              Site Ayarları
            </a>

            <a
              href="/admin/fiyat-alarmlari"
              className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white"
            >
              Fiyat Alarmları
            </a>

            <a
              href="/"
              className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-black text-slate-950"
            >
              Siteyi Gör
            </a>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-5 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <p className="inline-block rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
            Yönetim Özeti
          </p>

          <h2 className="mt-5 text-4xl font-black md:text-5xl">
            Site performansını tek ekranda takip et
          </h2>

          <p className="mt-3 max-w-3xl leading-8 text-slate-300">
            Aktif fırsatlar, en ucuz rotalar, tıklamalar ve hızlı admin
            bağlantıları.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8">
        {yukleniyor && (
          <p className="mb-5 rounded-2xl bg-blue-50 p-4 font-bold text-blue-700">
            Veriler yükleniyor...
          </p>
        )}

        {hata && (
          <p className="mb-5 rounded-2xl bg-red-50 p-4 font-bold text-red-600">
            {hata}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Aktif fırsat"
            value={String(aktifBiletler.length)}
            note="Sitede görünen biletler"
          />

          <StatCard
            title="Vizesiz fırsat"
            value={String(vizesizler.length)}
            note="Vizesiz rota sayısı"
          />

          <StatCard
            title="Öne çıkan"
            value={String(oneCikanlar.length)}
            note="Ana sayfa fırsatları"
          />

          <StatCard
            title="Toplam tıklanma"
            value={String(toplamTiklanma)}
            note="Satın al ilgisi"
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <StatCard
            title="En ucuz"
            value={enUcuz ? enUcuz.fiyat : "—"}
            note={enUcuz ? `${enUcuz.nereden} → ${enUcuz.nereye}` : "Veri yok"}
          />

          <StatCard
            title="Ortalama fiyat"
            value={fiyatYaz(ortalamaFiyat)}
            note="Aktif fırsat ortalaması"
          />

          <StatCard
            title="Toplam bilet"
            value={String(biletler.length)}
            note="Veritabanındaki biletler"
          />

          <StatCard
            title="Kategori"
            value={String(new Set(aktifBiletler.map((b) => b.kategori)).size)}
            note="Aktif kategori sayısı"
          />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-12 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow">
          <h3 className="text-2xl font-black">Hızlı İşlemler</h3>

          <div className="mt-5 grid gap-3">
            <QuickLink href="/admin" title="Biletleri Yönet" />
            <QuickLink href="/admin/fiyat-alarmlari" title="Fiyat Alarmları" />
            <QuickLink href="/admin/ayarlar" title="Site Ayarları" />
            <QuickLink href="/arama" title="Arama Sayfası" />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow lg:col-span-2">
          <h3 className="text-2xl font-black">En Çok Tıklananlar</h3>

          <div className="mt-5 grid gap-3">
            {enCokTiklananlar.length === 0 ? (
              <p className="rounded-2xl bg-slate-100 p-4 font-bold text-slate-500">
                Henüz tıklama verisi yok.
              </p>
            ) : (
              enCokTiklananlar.map((bilet, index) => (
                <MiniBiletRow key={bilet.id} bilet={bilet} index={index + 1} />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12">
        <div className="rounded-3xl bg-white p-6 shadow">
          <h3 className="text-2xl font-black">En Ucuz Fırsatlar</h3>

          <div className="mt-5 grid gap-3">
            {enUcuzlar.length === 0 ? (
              <p className="rounded-2xl bg-slate-100 p-4 font-bold text-slate-500">
                Henüz bilet verisi yok.
              </p>
            ) : (
              enUcuzlar.map((bilet, index) => (
                <MiniBiletRow key={bilet.id} bilet={bilet} index={index + 1} />
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow">
      <p className="text-sm font-black text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-2 text-sm font-bold text-slate-400">{note}</p>
    </div>
  );
}

function QuickLink({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      className="rounded-2xl bg-slate-100 p-4 font-black transition hover:bg-slate-950 hover:text-white"
    >
      {title}
    </a>
  );
}

function MiniBiletRow({
  bilet,
  index,
}: {
  bilet: Bilet;
  index: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-100 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
          {index}
        </span>

        <div>
          <p className="font-black">
            {bilet.nereden} → {bilet.nereye}
          </p>
          <p className="text-sm text-slate-500">
            {bilet.ulke} · {bilet.kategori}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="font-black">{bilet.fiyat}</p>
        <p className="text-xs text-slate-500">{bilet.tiklanma || 0} tık</p>
      </div>
    </div>
  );
}