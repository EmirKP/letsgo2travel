"use client";

import { useMemo } from "react";

function fiyatYaz(value: string | null) {
  const fiyat = Number(value || 0);
  return `${new Intl.NumberFormat("tr-TR").format(fiyat || 0)} TL`;
}

export default function CanliUcusPage() {
  const params = useMemo(() => {
    if (typeof window === "undefined") {
      return new URLSearchParams();
    }

    return new URLSearchParams(window.location.search);
  }, []);

  const nereden = params.get("nereden") || "";
  const nereye = params.get("nereye") || "";
  const gidis = params.get("gidis") || "";
  const donus = params.get("donus") || "";
  const fiyat = params.get("fiyat") || "";
  const aktarma = params.get("aktarma") || "Bilinmiyor";
  const havayolu = params.get("havayolu") || "Aviasales";
  const marker = params.get("marker") || "";

  const aviasalesHome = marker
    ? `https://www.aviasales.com/?marker=${encodeURIComponent(marker)}`
    : "https://www.aviasales.com/";

  const aramaMetni = `${nereden} → ${nereye} | Gidiş: ${gidis || "Tarih yok"}${
    donus ? ` | Dönüş: ${donus}` : ""
  } | Fiyat: ${fiyatYaz(fiyat)} | ${aktarma}`;

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(aramaMetni);
      alert("Uçuş bilgisi kopyalandı.");
    } catch {
      alert("Kopyalama yapılamadı.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Letsgo 2 Travel" className="h-14 w-auto" />
            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel</h1>
              <p className="text-sm text-slate-500">Canlı uçuş fiyat detayı</p>
            </div>
          </a>

          <a
            href="/arama"
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
          >
            Aramaya Dön
          </a>
        </div>
      </header>

      <section className="bg-gradient-to-br from-blue-950 via-slate-950 to-slate-900 px-5 py-12 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="inline-block rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
            Travelpayouts / Aviasales cache fiyatı
          </p>

          <h2 className="mt-6 text-4xl font-black md:text-6xl">
            {nereden} → {nereye}
          </h2>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
            Bu fiyat Travelpayouts / Aviasales Data API cache verisinden geldi.
            Fiyatlar değişebilir; satın almadan önce son fiyatı kontrol et.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl bg-white p-8 shadow">
          <h3 className="text-3xl font-black">Uçuş Detayı</h3>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Kalkış</p>
              <p className="mt-2 text-2xl font-black">{nereden}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Varış</p>
              <p className="mt-2 text-2xl font-black">{nereye}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Gidiş tarihi</p>
              <p className="mt-2 text-xl font-black">{gidis || "Belirsiz"}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Dönüş tarihi</p>
              <p className="mt-2 text-xl font-black">{donus || "Tek yön"}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Havayolu</p>
              <p className="mt-2 text-xl font-black">{havayolu}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-5">
              <p className="text-sm font-black text-slate-500">Aktarma</p>
              <p className="mt-2 text-xl font-black">{aktarma}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-blue-50 p-5 text-blue-900">
            <p className="font-black">Önemli bilgi</p>
            <p className="mt-2 leading-7">
              Aviasales dış bağlantıları bazen ülke/dil yönlendirmesi nedeniyle
              boş form açabiliyor. Bu yüzden uçuş detayını önce Letsgo içinde
              gösteriyoruz.
            </p>
          </div>
        </div>

        <aside className="h-fit rounded-3xl bg-slate-950 p-8 text-white shadow">
          <p className="text-sm text-slate-400">Cache fiyat</p>
          <p className="mt-2 text-5xl font-black">{fiyatYaz(fiyat)}</p>

          <div className="mt-6 grid gap-3">
            <button
              onClick={kopyala}
              className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950"
            >
              Bilgileri Kopyala
            </button>

            <a
              href={aviasalesHome}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/20 px-5 py-4 text-center font-black hover:bg-white hover:text-slate-950"
            >
              Aviasales Ana Sayfada Ara
            </a>

            <a
              href="/arama"
              className="rounded-xl bg-white/10 px-5 py-4 text-center font-black hover:bg-white hover:text-slate-950"
            >
              Başka Uçuş Ara
            </a>
          </div>

          <p className="mt-5 text-xs leading-6 text-slate-400">
            Bu ekran bilet satışı yapmaz. Fiyat bilgisi yönlendirme ve
            karşılaştırma amaçlıdır.
          </p>
        </aside>
      </section>
    </main>
  );
}