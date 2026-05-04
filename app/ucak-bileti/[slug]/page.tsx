"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export default function BiletDetayPage() {
  const params = useParams();
  const slugParam = params.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const [bilet, setBilet] = useState<Bilet | null>(null);
  const [benzerler, setBenzerler] = useState<Bilet[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => {
    async function biletYukle() {
      if (!slug) return;

      setYukleniyor(true);
      setHata("");

      try {
        const response = await fetch(`/api/ucak-bileti/${slug}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Bilet bulunamadı.");
        }

        setBilet(data.bilet);
        setBenzerler(data.benzerler || []);
      } catch (error) {
        const mesaj =
          error instanceof Error ? error.message : "Bir hata oluştu.";
        setHata(mesaj);
      } finally {
        setYukleniyor(false);
      }
    }

    biletYukle();
  }, [slug]);

  async function satinAl(seciliBilet: Bilet) {
    try {
      await fetch(`/api/biletler/${seciliBilet.id}/click`, {
        method: "POST",
      });
    } catch {
      // Tıklanma kaydı çalışmazsa yönlendirme engellenmez.
    }

    window.open(seciliBilet.link, "_blank", "noopener,noreferrer");
  }

  const paylasimMetni = useMemo(() => {
    if (!bilet) return "";

    return `✈️ ${bilet.nereden} → ${bilet.nereye}

📍 ${bilet.ulke}
📅 ${bilet.tarih}
💸 ${bilet.fiyat}
🛂 ${bilet.vize}
🎒 ${bilet.bagaj}

Letsgo 2 Travel fırsatı:
${typeof window !== "undefined" ? window.location.href : ""}`;
  }, [bilet]);

  async function paylasimKopyala() {
    await navigator.clipboard.writeText(paylasimMetni);
    setKopyalandi(true);
    setTimeout(() => setKopyalandi(false), 2000);
  }

  if (yukleniyor) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5">
        <div className="rounded-3xl bg-white p-10 text-center shadow">
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel"
            className="mx-auto h-24 w-auto"
          />
          <p className="mt-5 text-xl font-black">Bilet detayı yükleniyor...</p>
        </div>
      </main>
    );
  }

  if (hata || !bilet) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5">
        <div className="max-w-md rounded-3xl bg-white p-10 text-center shadow">
          <img
            src="/logo.png"
            alt="Letsgo 2 Travel"
            className="mx-auto h-24 w-auto"
          />
          <h1 className="mt-5 text-3xl font-black">Bilet bulunamadı</h1>
          <p className="mt-3 text-slate-500">
            Bu fırsat kaldırılmış veya pasife alınmış olabilir.
          </p>
          <a
            href="/arama"
            className="mt-6 inline-block rounded-xl bg-yellow-400 px-6 py-4 font-black text-slate-950"
          >
            Uçuş Ara
          </a>
        </div>
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
            <a href="/arama" className="hover:text-yellow-600">
              Uçuş Ara
            </a>
            <a href="/admin" className="hover:text-yellow-600">
              Admin
            </a>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-12 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
                {bilet.ulkeEmoji} {bilet.kategori}
              </span>

              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-black text-white">
                {bilet.vize}
              </span>

              {bilet.oneCikan && (
                <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
                  Öne çıkan fırsat
                </span>
              )}
            </div>

            <h2 className="mt-6 max-w-4xl text-4xl font-black leading-tight md:text-6xl">
              {bilet.nereden} → {bilet.nereye}
            </h2>

            <p className="mt-4 text-xl text-slate-300">
              {bilet.ulke} uçuş fırsatı · {bilet.tarih}
            </p>

            {bilet.aciklama && (
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
                {bilet.aciklama}
              </p>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/arama"
                className="rounded-xl border border-white/20 px-5 py-4 font-black text-white hover:bg-white hover:text-slate-950"
              >
                Yeni Arama Yap
              </a>

              <button
                onClick={paylasimKopyala}
                className="rounded-xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white hover:text-slate-950"
              >
                Paylaşım Metni Kopyala
              </button>
            </div>

            {kopyalandi && (
              <p className="mt-4 rounded-2xl bg-yellow-400 p-4 font-black text-slate-950">
                Paylaşım metni kopyalandı.
              </p>
            )}
          </div>

          <aside className="rounded-3xl bg-white p-6 text-slate-950 shadow-2xl">
            <p className="text-sm font-black text-slate-500">Başlayan fiyat</p>
            <p className="mt-2 text-5xl font-black">{bilet.fiyat}</p>

            <p className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800">
              Fiyatlar değişebilir. Satın almadan önce son fiyatı kontrol et.
            </p>

            <button
              onClick={() => satinAl(bilet)}
              className="mt-5 w-full rounded-xl bg-yellow-400 px-6 py-4 font-black text-slate-950 hover:bg-yellow-300"
            >
              Satın Al Sayfasına Git
            </button>

            <div className="mt-5 grid gap-3 text-sm">
              <p>
                <span className="font-black">Sağlayıcı:</span>{" "}
                {bilet.saglayici}
              </p>
              <p>
                <span className="font-black">Son kontrol:</span>{" "}
                {bilet.sonKontrol}
              </p>
              <p>
                <span className="font-black">İlgi:</span>{" "}
                {bilet.tiklanma || 0} tıklanma
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Tarih</p>
            <p className="mt-2 text-xl font-black">{bilet.tarih}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Havayolu</p>
            <p className="mt-2 text-xl font-black">{bilet.havayolu}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Uçuş süresi</p>
            <p className="mt-2 text-xl font-black">{bilet.sure}</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-sm font-black text-slate-500">Aktarma</p>
            <p className="mt-2 text-xl font-black">{bilet.aktarma}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="rounded-3xl bg-white p-8 shadow">
            <h3 className="text-3xl font-black">Rota Özeti</h3>

            <div className="mt-6 grid gap-5">
              <div className="rounded-2xl bg-slate-100 p-5">
                <p className="text-sm font-black text-slate-500">
                  Kalkış noktası
                </p>
                <p className="mt-1 text-2xl font-black">
                  {bilet.nereden} {bilet.kalkisKodu && `(${bilet.kalkisKodu})`}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-5">
                <p className="text-sm font-black text-slate-500">
                  Varış noktası
                </p>
                <p className="mt-1 text-2xl font-black">
                  {bilet.nereye} {bilet.varisKodu && `(${bilet.varisKodu})`}
                </p>
                <p className="mt-1 text-slate-500">
                  {bilet.ulkeEmoji} {bilet.ulke}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-100 p-5">
                <p className="text-sm font-black text-slate-500">
                  Bagaj bilgisi
                </p>
                <p className="mt-1 text-xl font-black">{bilet.bagaj}</p>
              </div>

              <div className="rounded-2xl bg-yellow-50 p-5 text-yellow-900">
                <p className="text-sm font-black">Önemli not</p>
                <p className="mt-1 font-bold">
                  Bu sayfa Letsgo 2 Travel tarafından eklenen fırsat bilgisini
                  gösterir. Son fiyat, koltuk durumu ve bagaj şartları satın
                  alma sayfasında değişebilir.
                </p>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl bg-slate-950 p-8 text-white shadow">
            <h3 className="text-2xl font-black">Hızlı Bilgiler</h3>

            <div className="mt-6 grid gap-4 text-sm">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-slate-400">Vize</p>
                <p className="mt-1 text-lg font-black">{bilet.vize}</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-slate-400">Kategori</p>
                <p className="mt-1 text-lg font-black">{bilet.kategori}</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-slate-400">Ay</p>
                <p className="mt-1 text-lg font-black">{bilet.ay}</p>
              </div>

              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-slate-400">Kampanya bitiş</p>
                <p className="mt-1 text-lg font-black">
                  {bilet.kampanyaBitis || "Stok / fiyat durumuna bağlı"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="font-black text-yellow-600">Benzer fırsatlar</p>
            <h3 className="text-3xl font-black">
              Bu rotaya yakın diğer fırsatlar
            </h3>
          </div>

          <a href="/arama" className="hidden font-black text-slate-600 md:block">
            Tüm fırsatları gör →
          </a>
        </div>

        {benzerler.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow">
            <p className="font-black">Benzer fırsat bulunamadı.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {benzerler.map((benzer) => (
              <article
                key={benzer.id}
                className="rounded-3xl bg-white p-5 shadow transition hover:-translate-y-1 hover:shadow-xl"
              >
                <p className="inline-block rounded-full bg-yellow-100 px-3 py-1 text-xs font-black text-yellow-800">
                  {benzer.ulkeEmoji} {benzer.kategori}
                </p>

                <h4 className="mt-4 text-xl font-black">
                  {benzer.nereden} → {benzer.nereye}
                </h4>

                <p className="mt-1 text-sm text-slate-500">
                  {benzer.ulke} · {benzer.tarih}
                </p>

                <p className="mt-4 text-3xl font-black">{benzer.fiyat}</p>

                <a
                  href={`/ucak-bileti/${benzer.detaySlug}`}
                  className="mt-5 block rounded-xl bg-slate-950 px-4 py-3 text-center font-black text-white"
                >
                  Detay
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}