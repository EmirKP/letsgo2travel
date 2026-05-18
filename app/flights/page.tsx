"use client";

import { useEffect, useMemo, useState } from "react";

type Firsat = {
  id: number;
  nereden: string;
  nereye: string;
  ulke: string;
  fiyat: string;
  fiyatSayi: number;
  tarih: string;
  vize: string;
  ay: string;
  havayolu: string;
  sure: string;
  bagaj: string;
  etiket: string;
  kategori: string;
  aciklama: string;
  ulkeEmoji: string;
  sonKontrol: string;
  tiklanma: number;
  kalkisKodu: string;
  varisKodu: string;
  aktarma: string;
  detaySlug: string;
  gorselUrl: string;
  oneCikan: boolean;
  gidisTarihi?: string | null;
  donusTarihi?: string | null;
};

const fallback: Firsat[] = [
  { id: 1, nereden: "İstanbul", nereye: "Roma", ulke: "İtalya", fiyat: "2.499 TL", fiyatSayi: 2499, tarih: "Haziran", vize: "Vizeli", ay: "Haziran", havayolu: "Partner", sure: "2 sa 35 dk", bagaj: "Kabin bagajı", etiket: "Şehir", kategori: "Avrupa", aciklama: "Kısa Avrupa kaçamağı için öne çıkan rota.", ulkeEmoji: "🇮🇹", sonKontrol: "Bugün", tiklanma: 0, kalkisKodu: "IST", varisKodu: "ROM", aktarma: "Farketmez", detaySlug: "istanbul-roma", gorselUrl: "/travel-images/route-roma.jpg", oneCikan: true },
  { id: 2, nereden: "İstanbul", nereye: "Saraybosna", ulke: "Bosna Hersek", fiyat: "1.899 TL", fiyatSayi: 1899, tarih: "Haziran", vize: "Vizesiz", ay: "Haziran", havayolu: "Partner", sure: "1 sa 55 dk", bagaj: "Kabin bagajı", etiket: "Balkan", kategori: "Vizesiz", aciklama: "Vizesiz Balkan rotası arayanlara uygun seçenek.", ulkeEmoji: "🇧🇦", sonKontrol: "Bugün", tiklanma: 0, kalkisKodu: "IST", varisKodu: "SJJ", aktarma: "Farketmez", detaySlug: "istanbul-saraybosna", gorselUrl: "/travel-images/route-saraybosna.jpg", oneCikan: true },
];

const kategoriler = ["Tümü", "Avrupa", "Vizesiz", "Balkan", "Hafta Sonu", "Yaz Tatili", "En Ucuz", "Aile Rotası", "Premium"];

function rotaSinifi(value: string) {
  const metin = value.toLocaleLowerCase("tr-TR");
  if (metin.includes("roma") || metin.includes("italya")) return "roma";
  if (metin.includes("paris") || metin.includes("fransa")) return "paris";
  if (metin.includes("saraybosna") || metin.includes("bosna")) return "saraybosna";
  if (metin.includes("bakü") || metin.includes("baku") || metin.includes("azerbaycan")) return "baku";
  if (metin.includes("dubai")) return "dubai";
  if (metin.includes("antalya") || metin.includes("bodrum") || metin.includes("dalaman")) return "summer";
  return "generic";
}

function gorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return { backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.05), rgba(2, 6, 23, 0.76)), url(${url})`, backgroundSize: "cover", backgroundPosition: "center" };
}

function aramaLinki(item: Firsat) {
  const params = new URLSearchParams({
    nereden: item.kalkisKodu || item.nereden,
    nereye: item.varisKodu || item.nereye,
    gidis: item.gidisTarihi || "",
    donus: "",
    yolcu: "1",
    maksimumFiyat: "30000",
    siralama: "en-iyi",
    vize: "Tümü",
    kategori: "Tümü",
    aktarma: "Tümü",
  } as Record<string, string>);
  return `/arama?${params.toString()}`;
}

export default function FlightsPage() {
  const [firsatlar, setFirsatlar] = useState<Firsat[]>([]);
  const [kategori, setKategori] = useState("Tümü");
  const [vize, setVize] = useState("Tümü");
  const [siralama, setSiralama] = useState("onecikan");
  const [arama, setArama] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setKategori(sp.get("kategori") || "Tümü");
  }, []);

  useEffect(() => {
    let aktif = true;
    async function yukle() {
      try {
        const response = await fetch("/api/firsatlar", { cache: "no-store" });
        const data = await response.json();
        if (!aktif) return;
        setFirsatlar(Array.isArray(data.firsatlar) ? data.firsatlar : []);
      } catch {
        if (aktif) setFirsatlar([]);
      } finally {
        if (aktif) setYukleniyor(false);
      }
    }
    yukle();
    return () => { aktif = false; };
  }, []);

  const tumFirsatlar = firsatlar.length ? firsatlar : fallback;
  const filtreli = useMemo(() => {
    let sonuc = tumFirsatlar.filter((item) => {
      const metin = `${item.nereden} ${item.nereye} ${item.ulke} ${item.kategori} ${item.havayolu}`.toLocaleLowerCase("tr-TR");
      const aramaUyuyor = !arama || metin.includes(arama.toLocaleLowerCase("tr-TR"));
      const kategoriUyuyor = kategori === "Tümü" || item.kategori === kategori;
      const vizeUyuyor = vize === "Tümü" || item.vize === vize;
      return aramaUyuyor && kategoriUyuyor && vizeUyuyor;
    });
    if (siralama === "enucuz") sonuc = [...sonuc].sort((a, b) => a.fiyatSayi - b.fiyatSayi);
    if (siralama === "populer") sonuc = [...sonuc].sort((a, b) => (b.tiklanma || 0) - (a.tiklanma || 0));
    if (siralama === "onecikan") sonuc = [...sonuc].sort((a, b) => Number(b.oneCikan) - Number(a.oneCikan));
    return sonuc;
  }, [arama, kategori, siralama, tumFirsatlar, vize]);

  const enUcuz = [...tumFirsatlar].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0];

  return (
    <main className="l2t-v12-page">
      <header className="v12-header">
        <div className="v12-container v12-header-inner">
          <a href="/" className="v12-brand"><img src="/logo.png" alt="Letsgo 2 Travel" /></a>
          <nav className="v12-nav"><a href="/">Ana sayfa</a><a href="/arama">Uçuş ara</a><a href="/admin">Admin</a></nav>
          <a href="/arama" className="v12-admin-link">Arama aç</a>
        </div>
      </header>

      <section className="v12-subhero">
        <div className="v12-container v12-subhero-grid">
          <div>
            <span className="v12-pill">✈️ Fırsat vitrini</span>
            <h1>Yayındaki uçuş fırsatlarını kategoriye göre keşfet.</h1>
            <p>Admin panelde aktif olan rotalar burada görselli kartlar halinde listelenir.</p>
            <div className="v12-proof-row"><span><b>{tumFirsatlar.length}</b> fırsat</span><span><b>{enUcuz?.fiyat || "—"}</b> en düşük fiyat</span><span><b>{filtreli.length}</b> sonuç</span></div>
          </div>
          <div className="v12-subhero-card"><strong>Son kontrol</strong><span>Fiyatlar değişebilir; partner sayfasında doğrulanmalıdır.</span></div>
        </div>
      </section>

      <section className="v12-section">
        <div className="v12-container">
          <div className="v12-toolbar">
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Şehir, ülke, rota ara..." />
            <select value={kategori} onChange={(e) => setKategori(e.target.value)}>{kategoriler.map((k) => <option key={k}>{k}</option>)}</select>
            <select value={vize} onChange={(e) => setVize(e.target.value)}><option>Tümü</option><option>Vizesiz</option><option>Vizeli</option></select>
            <select value={siralama} onChange={(e) => setSiralama(e.target.value)}><option value="onecikan">Öne çıkan</option><option value="enucuz">En ucuz</option><option value="populer">Popüler</option></select>
          </div>

          {yukleniyor && <div className="v12-loading">Fırsatlar yükleniyor...</div>}

          <div className="v12-deal-grid catalog">
            {filtreli.map((item) => {
              const sinif = rotaSinifi(`${item.nereye} ${item.ulke} ${item.kategori}`);
              return (
                <article className="v12-deal-card" key={item.id}>
                  <a href={`/ucak-bileti/${item.detaySlug}`} className={`v12-deal-visual v12-route-${sinif}`} style={gorselStyle(item.gorselUrl)}>
                    <div className="v12-deal-badges"><span>{item.ulkeEmoji} {item.kategori}</span>{item.oneCikan && <span>Öne çıkan</span>}</div>
                    <strong>{item.nereden} → {item.nereye}</strong>
                  </a>
                  <div className="v12-deal-body">
                    <div className="v12-deal-price-row"><small>{item.ay} · {item.vize}</small><b>{item.fiyat}</b></div>
                    <p>{item.aciklama}</p>
                    <div className="v12-deal-meta"><span>{item.havayolu}</span><span>{item.sure}</span><span>{item.sonKontrol}</span></div>
                    <div className="v12-deal-actions"><a href={aramaLinki(item)}>Aramada aç</a><a href={`/ucak-bileti/${item.detaySlug}`}>Detay</a></div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
