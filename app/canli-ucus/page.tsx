"use client";

import { useEffect, useRef, useState } from "react";

type Detay = {
  nereden: string;
  nereye: string;
  gidis: string;
  donus: string;
  fiyat: string;
  aktarma: string;
  havayolu: string;
  kaynak: string;
};

const bosDetay: Detay = {
  nereden: "",
  nereye: "",
  gidis: "",
  donus: "",
  fiyat: "",
  aktarma: "Bilinmiyor",
  havayolu: "Aviasales",
  kaynak: "Travelpayouts / Aviasales",
};

function fiyatYaz(value: string) {
  const fiyat = Number(value || 0);
  return `${new Intl.NumberFormat("tr-TR").format(fiyat || 0)} TL`;
}

function tarihYaz(value: string) {
  if (!value) return "Belirsiz";

  if (
    value.includes("Oca") ||
    value.includes("Şub") ||
    value.includes("Mar") ||
    value.includes("Nis") ||
    value.includes("May") ||
    value.includes("Haz") ||
    value.includes("Tem") ||
    value.includes("Ağu") ||
    value.includes("Eyl") ||
    value.includes("Eki") ||
    value.includes("Kas") ||
    value.includes("Ara")
  ) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function CanliUcusPage() {
  const [detay, setDetay] = useState<Detay>(bosDetay);
  const [kopyaMesaji, setKopyaMesaji] = useState("");
  const widgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const yeniDetay: Detay = {
      nereden: params.get("nereden") || "",
      nereye: params.get("nereye") || "",
      gidis: params.get("gidis") || "",
      donus: params.get("donus") || "",
      fiyat: params.get("fiyat") || "",
      aktarma: params.get("aktarma") || "Bilinmiyor",
      havayolu: params.get("havayolu") || "Aviasales",
      kaynak: params.get("kaynak") || "Travelpayouts / Aviasales",
    };

    if (!yeniDetay.nereden || !yeniDetay.nereye) {
      window.location.href = "/arama";
      return;
    }

    setDetay(yeniDetay);
  }, []);

  useEffect(() => {
    if (!widgetRef.current) return;

    widgetRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.async = true;
    script.charset = "utf-8";
    script.src =
      "https://tpemd.com/content?currency=try&trs=525614&shmarker=725223&show_hotels=true&powered_by=true&locale=tr&searchUrl=search.jetradar.com&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

    widgetRef.current.appendChild(script);
  }, []);

  const tumBilgi = `${detay.nereden} → ${detay.nereye}
Gidiş: ${tarihYaz(detay.gidis)}
Dönüş: ${detay.donus ? tarihYaz(detay.donus) : "Tek yön / belirtilmedi"}
Fiyat: ${fiyatYaz(detay.fiyat)}
Aktarma: ${detay.aktarma}
Havayolu: ${detay.havayolu}
Kaynak: ${detay.kaynak}`;

  async function kopyala(metin: string, mesaj: string) {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyaMesaji(mesaj);
      setTimeout(() => setKopyaMesaji(""), 2500);
    } catch {
      alert("Kopyalama yapılamadı.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Letsgo 2 Travel"
              className="h-14 w-auto"
            />

            <div>
              <h1 className="text-xl font-black">Letsgo 2 Travel</h1>
              <p className="text-sm text-slate-500">
                Canlı uçuş fiyat detayı
              </p>
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

      <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-5 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="inline-block rounded-full bg-yellow-400 px-4 py-2 text-sm font-black text-slate-950">
            Canlı fiyat detayı
          </p>

          <h2 className="mt-6 text-4xl font-black md:text-6xl">
            {detay.nereden} → {detay.nereye}
          </h2>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
            Bu fiyat Travelpayouts / Aviasales Data API cache verisinden
            alınmıştır. Fiyatlar değişebilir; satın almadan önce aşağıdaki
            partner arama kutusundan güncel fiyatı kontrol et.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">Cache fiyat</p>
              <p className="mt-1 text-3xl font-black">
                {fiyatYaz(detay.fiyat)}
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">Gidiş</p>
              <p className="mt-1 text-xl font-black">{tarihYaz(detay.gidis)}</p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">Dönüş</p>
              <p className="mt-1 text-xl font-black">
                {detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi"}
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">Aktarma</p>
              <p className="mt-1 text-xl font-black">{detay.aktarma}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <div className="rounded-3xl bg-white p-8 shadow">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-black text-blue-600">Rota bilgisi</p>
                <h3 className="mt-1 text-3xl font-black">
                  {detay.nereden} → {detay.nereye}
                </h3>
              </div>

              <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-black text-green-800">
                {detay.aktarma}
              </span>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <InfoCard title="Kalkış" value={detay.nereden} />
              <InfoCard title="Varış" value={detay.nereye} />
              <InfoCard title="Gidiş tarihi" value={tarihYaz(detay.gidis)} />
              <InfoCard
                title="Dönüş tarihi"
                value={
                  detay.donus ? tarihYaz(detay.donus) : "Tek yön / belirtilmedi"
                }
              />
              <InfoCard title="Havayolu" value={detay.havayolu} />
              <InfoCard title="Kaynak" value={detay.kaynak} />
            </div>
          </div>

          <div className="rounded-3xl bg-white p-8 shadow">
            <p className="font-black text-blue-600">Partner arama rehberi</p>
            <h3 className="mt-1 text-3xl font-black">
              Widget’a şu bilgileri gir
            </h3>

            <div className="mt-6 grid gap-3">
              <CopyRow
                label="Kalkış"
                value={detay.nereden}
                onCopy={() => kopyala(detay.nereden, "Kalkış kodu kopyalandı")}
              />

              <CopyRow
                label="Varış"
                value={detay.nereye}
                onCopy={() => kopyala(detay.nereye, "Varış kodu kopyalandı")}
              />

              <CopyRow
                label="Gidiş"
                value={tarihYaz(detay.gidis)}
                onCopy={() => kopyala(tarihYaz(detay.gidis), "Gidiş tarihi kopyalandı")}
              />

              <CopyRow
                label="Dönüş"
                value={detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi"}
                onCopy={() =>
                  kopyala(
                    detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi",
                    "Dönüş tarihi kopyalandı"
                  )
                }
              />
            </div>

            {kopyaMesaji && (
              <p className="mt-5 rounded-2xl bg-green-50 p-4 font-black text-green-700">
                {kopyaMesaji}
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-blue-50 p-6 text-blue-950">
            <h4 className="text-xl font-black">Aracı site notu</h4>
            <p className="mt-3 leading-8">
              Letsgo 2 Travel bu fiyatı karşılaştırma ve yönlendirme amacıyla
              gösterir. Bilet satışı partner platformda yapılır. Partner sitede
              fiyat, bagaj ve müsaitlik değişebilir.
            </p>
          </div>
        </div>

        <aside className="h-fit rounded-3xl bg-slate-950 p-8 text-white shadow">
          <p className="text-sm text-slate-400">Gösterilen cache fiyat</p>
          <p className="mt-2 text-5xl font-black">{fiyatYaz(detay.fiyat)}</p>

          <div className="mt-6 grid gap-3">
            <button
              onClick={() => kopyala(tumBilgi, "Tüm uçuş bilgileri kopyalandı")}
              className="rounded-xl bg-yellow-400 px-5 py-4 font-black text-slate-950 hover:bg-yellow-300"
            >
              Tüm Bilgileri Kopyala
            </button>

            <a
              href="#partner-arama"
              className="rounded-xl border border-white/20 px-5 py-4 text-center font-black hover:bg-white hover:text-slate-950"
            >
              Partner Arama Kutusuna Git
            </a>

            <a
              href="/arama"
              className="rounded-xl bg-white/10 px-5 py-4 text-center font-black hover:bg-white hover:text-slate-950"
            >
              Başka Uçuş Ara
            </a>
          </div>

          <p className="mt-5 text-xs leading-6 text-slate-400">
            Bu sayfa bilet satışı yapmaz. Fiyatlar yönlendirme ve karşılaştırma
            amaçlıdır.
          </p>
        </aside>
      </section>

      <section id="partner-arama" className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-3xl bg-white p-6 shadow">
          <div className="mb-5">
            <p className="font-black text-blue-600">
              Travelpayouts / Aviasales
            </p>
            <h3 className="text-3xl font-black">Partner Arama Kutusu</h3>
            <p className="mt-2 text-slate-500">
              Yukarıdaki rota ve tarihleri girerek partner tarafta güncel
              uçuşları ara.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-white p-3">
            <div ref={widgetRef} />
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-100 p-5">
      <p className="text-sm font-black text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-100 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-black uppercase text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-black">{value}</p>
      </div>

      <button
        onClick={onCopy}
        className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
      >
        Kopyala
      </button>
    </div>
  );
}