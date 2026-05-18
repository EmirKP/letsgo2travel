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

type BiletForm = Omit<Bilet, "id" | "fiyat" | "tiklanma" | "gidisTarihi" | "donusTarihi"> & {
  fiyatSayi: number;
  gidisTarihi: string;
  donusTarihi: string;
};

const bosForm: BiletForm = {
  nereden: "İstanbul",
  nereye: "Roma",
  ulke: "İtalya",
  fiyatSayi: 2499,
  tarih: "Haziran fırsatı",
  vize: "Vizeli",
  ay: "Haziran",
  havayolu: "Partner",
  sure: "2 sa 35 dk",
  bagaj: "Kabin bagajı dahil",
  etiket: "Şehir kaçamağı",
  link: "https://www.skyscanner.com.tr/",
  aktif: true,
  oneCikan: true,
  kategori: "Avrupa",
  aciklama: "Kısa Avrupa tatili planlayanlar için güncel uçuş fırsatı.",
  ulkeEmoji: "🇮🇹",
  sonKontrol: "Bugün",
  kampanyaBitis: "",
  kalkisKodu: "IST",
  varisKodu: "ROM",
  aktarma: "Farketmez",
  saglayici: "Letsgo 2 Travel",
  aramaPuani: 88,
  gidisTarihi: "",
  donusTarihi: "",
  detaySlug: "",
  gorselUrl: "",
};

const kategoriler = ["Genel", "Avrupa", "Balkan", "Vizesiz", "Hafta Sonu", "Yaz Tatili", "Kış Rotası", "En Ucuz", "Aile Rotası", "Premium"];
const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const aktarmaSecenekleri = ["Farketmez", "Aktarmasız", "1 Aktarma", "2+ Aktarma"];

function fiyatYaz(value: number) {
  return `${new Intl.NumberFormat("tr-TR").format(Number.isFinite(value) ? value : 0)} TL`;
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

function gorselStyle(url?: string) {
  if (!url?.trim()) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(2, 6, 23, 0.04), rgba(2, 6, 23, 0.78)), url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

function rotaSinifi(value: string) {
  const metin = value.toLocaleLowerCase("tr-TR");
  if (metin.includes("roma") || metin.includes("italya")) return "roma";
  if (metin.includes("paris") || metin.includes("fransa")) return "paris";
  if (metin.includes("saraybosna") || metin.includes("bosna")) return "saraybosna";
  if (metin.includes("bakü") || metin.includes("baku") || metin.includes("azerbaycan")) return "baku";
  if (metin.includes("dubai")) return "dubai";
  return "generic";
}

function formdanPayload(form: BiletForm) {
  return {
    ...form,
    detaySlug: form.detaySlug.trim() || slugOlustur(form.nereden, form.nereye),
    fiyatSayi: Number(form.fiyatSayi || 0),
    aramaPuani: Number(form.aramaPuani || 80),
  };
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
  const [aktifSekme, setAktifSekme] = useState("firsatlar");
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
      setHata(error instanceof Error ? error.message : "Bir hata oluştu.");
      return false;
    } finally {
      setYukleniyor(false);
    }
  }

  useEffect(() => {
    const kayitli = localStorage.getItem("letsgo-admin-password");
    if (!kayitli) return;
    setSifre(kayitli);
    setAdminSifre(kayitli);
    biletleriYukle(kayitli).then((ok) => setGirisYapildi(ok));
  }, []);

  async function girisYap(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sifre.trim()) {
      setHata("Admin şifresini yaz.");
      return;
    }
    const ok = await biletleriYukle(sifre);
    if (ok) {
      setAdminSifre(sifre);
      setGirisYapildi(true);
      localStorage.setItem("letsgo-admin-password", sifre);
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
    setMesaj("");
  }

  async function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHata("");
    setMesaj("");

    if (!form.nereden.trim() || !form.nereye.trim() || !form.ulke.trim()) {
      setHata("Nereden, nereye ve ülke alanları zorunlu.");
      return;
    }

    const endpoint = duzenlenenId ? `/api/admin/biletler/${duzenlenenId}` : "/api/admin/biletler";
    const method = duzenlenenId ? "PUT" : "POST";

    setYukleniyor(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminSifre,
        },
        body: JSON.stringify(formdanPayload(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Kayıt yapılamadı.");
      await biletleriYukle(adminSifre);
      setMesaj(duzenlenenId ? "Fırsat güncellendi." : "Yeni fırsat eklendi.");
      formSifirla();
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Bir hata oluştu.");
    } finally {
      setYukleniyor(false);
    }
  }

  function duzenle(bilet: Bilet) {
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
      kategori: bilet.kategori,
      aciklama: bilet.aciklama,
      ulkeEmoji: bilet.ulkeEmoji,
      sonKontrol: bilet.sonKontrol,
      kampanyaBitis: bilet.kampanyaBitis,
      kalkisKodu: bilet.kalkisKodu,
      varisKodu: bilet.varisKodu,
      aktarma: bilet.aktarma,
      saglayici: bilet.saglayici,
      aramaPuani: bilet.aramaPuani,
      gidisTarihi: bilet.gidisTarihi || "",
      donusTarihi: bilet.donusTarihi || "",
      detaySlug: bilet.detaySlug,
      gorselUrl: bilet.gorselUrl,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function sil(id: number) {
    if (!confirm("Bu fırsat silinsin mi?")) return;
    setYukleniyor(true);
    try {
      const response = await fetch(`/api/admin/biletler/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": adminSifre },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Silinemedi.");
      await biletleriYukle(adminSifre);
      setMesaj("Fırsat silindi.");
    } catch (error) {
      setHata(error instanceof Error ? error.message : "Bir hata oluştu.");
    } finally {
      setYukleniyor(false);
    }
  }

  async function aktiflikDegistir(bilet: Bilet) {
    const payload = { ...bilet, aktif: !bilet.aktif, gorselUrl: bilet.gorselUrl || "" };
    const response = await fetch(`/api/admin/biletler/${bilet.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": adminSifre },
      body: JSON.stringify(payload),
    });
    if (response.ok) biletleriYukle(adminSifre);
  }

  function instagramMetni(bilet: Bilet | BiletForm) {
    return `✈️ ${bilet.nereden} → ${bilet.nereye} uçuş fırsatı!\n\n💸 Başlayan fiyatlarla ${"fiyat" in bilet ? bilet.fiyat : fiyatYaz(bilet.fiyatSayi)}\n📍 ${bilet.ulke}\n📅 ${bilet.tarih || bilet.ay}\n🛂 ${bilet.vize}\n\nFiyatlar anlık değişebilir. Güncel fiyatı partner/havayolu sayfasından kontrol etmeyi unutma.\n\nNot: Marka/havayolu ismi geçtiği için reklam etiketi eklenebilir; bu post bilgilendirme amaçlıdır, iş birliği veya sponsorlu içerik değildir.`;
  }

  async function metinKopyala(metin: string) {
    await navigator.clipboard.writeText(metin);
    setKopyaMesaji("Metin kopyalandı.");
    setTimeout(() => setKopyaMesaji(""), 1800);
  }

  function csvIndir() {
    const baslik = ["id", "nereden", "nereye", "ulke", "fiyat", "kategori", "aktif", "oneCikan", "gorselUrl"].join(",");
    const satirlar = biletler.map((b) => [b.id, b.nereden, b.nereye, b.ulke, b.fiyat, b.kategori, b.aktif, b.oneCikan, b.gorselUrl].map((x) => `"${String(x).replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[baslik, ...satirlar].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "letsgo-firsatlar.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const istatistik = useMemo(() => {
    const aktif = biletler.filter((b) => b.aktif);
    const pasif = biletler.filter((b) => !b.aktif);
    const oneCikan = aktif.filter((b) => b.oneCikan);
    const gorselli = aktif.filter((b) => b.gorselUrl?.trim());
    const toplamTiklanma = biletler.reduce((sum, b) => sum + (b.tiklanma || 0), 0);
    const enUcuz = aktif.length ? [...aktif].sort((a, b) => a.fiyatSayi - b.fiyatSayi)[0] : null;
    const enCokTiklanan = biletler.length ? [...biletler].sort((a, b) => (b.tiklanma || 0) - (a.tiklanma || 0))[0] : null;
    return { aktif: aktif.length, pasif: pasif.length, oneCikan: oneCikan.length, gorselli: gorselli.length, toplamTiklanma, enUcuz, enCokTiklanan };
  }, [biletler]);

  const filtreliBiletler = useMemo(() => {
    const aramaMetni = arama.toLocaleLowerCase("tr-TR");
    return biletler.filter((bilet) => {
      const metin = `${bilet.nereden} ${bilet.nereye} ${bilet.ulke} ${bilet.kategori} ${bilet.havayolu}`.toLocaleLowerCase("tr-TR");
      const aramaUyuyor = !arama || metin.includes(aramaMetni);
      const kategoriUyuyor = kategoriFiltresi === "Tümü" || bilet.kategori === kategoriFiltresi;
      const durumUyuyor = durumFiltresi === "Tümü" || (durumFiltresi === "Aktif" ? bilet.aktif : !bilet.aktif);
      return aramaUyuyor && kategoriUyuyor && durumUyuyor;
    });
  }, [arama, biletler, durumFiltresi, kategoriFiltresi]);

  if (!girisYapildi) {
    return (
      <main className="admin12-login">
        <form onSubmit={girisYap} className="admin12-login-card">
          <img src="/logo.png" alt="Letsgo 2 Travel" />
          <span>Yönetim Merkezi</span>
          <h1>Admin paneline giriş yap</h1>
          <p>Fırsat ekleme, rota görseli, fiyat alarmı ve içerik yönetimi için şifreyi yaz.</p>
          <input value={sifre} onChange={(e) => setSifre(e.target.value)} type="password" placeholder="Admin şifresi" />
          {hata && <div className="admin12-error">{hata}</div>}
          <button disabled={yukleniyor}>{yukleniyor ? "Kontrol ediliyor..." : "Giriş yap"}</button>
          <a href="/">← Siteye dön</a>
        </form>
      </main>
    );
  }

  return (
    <main className="admin12-page">
      <aside className="admin12-sidebar">
        <a href="/" className="admin12-logo"><img src="/logo.png" alt="Letsgo 2 Travel" /></a>
        <div className="admin12-nav">
          {[
            ["firsatlar", "✈️ Fırsatlar"],
            ["ekle", "➕ Yeni kayıt"],
            ["icerik", "📲 Sosyal medya"],
            ["kalite", "✅ Kalite kontrol"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setAktifSekme(key)} className={aktifSekme === key ? "active" : ""}>{label}</button>
          ))}
        </div>
        <div className="admin12-side-card">
          <small>Canlı site</small>
          <strong>{istatistik.aktif} aktif fırsat</strong>
          <a href="/flights">Fırsat vitrinini aç →</a>
        </div>
        <button onClick={cikisYap} className="admin12-exit">Çıkış</button>
      </aside>

      <section className="admin12-main">
        <header className="admin12-topbar">
          <div>
            <span>Letsgo 2 Travel</span>
            <h1>Yayın ve fırsat yönetimi</h1>
            <p>Rota ekle, görselleri kontrol et, ana sayfa vitrininin kalitesini takip et.</p>
          </div>
          <div className="admin12-top-actions">
            <button onClick={() => biletleriYukle(adminSifre)}>{yukleniyor ? "Yenileniyor..." : "Yenile"}</button>
            <button onClick={csvIndir}>CSV indir</button>
            <a href="/admin/dashboard">Dashboard</a>
            <a href="/admin/fiyat-alarmlari">Fiyat alarmları</a>
          </div>
        </header>

        {(hata || mesaj || kopyaMesaji) && (
          <div className={`admin12-notice ${hata ? "error" : "success"}`}>{hata || mesaj || kopyaMesaji}</div>
        )}

        <div className="admin12-stats">
          <div><small>Toplam fırsat</small><strong>{biletler.length}</strong><span>{istatistik.aktif} aktif · {istatistik.pasif} pasif</span></div>
          <div><small>Öne çıkan</small><strong>{istatistik.oneCikan}</strong><span>Ana sayfa vitrin önceliği</span></div>
          <div><small>Görselli</small><strong>{istatistik.gorselli}</strong><span>{Math.max(0, istatistik.aktif - istatistik.gorselli)} görselsiz aktif</span></div>
          <div><small>Tıklanma</small><strong>{istatistik.toplamTiklanma}</strong><span>{istatistik.enCokTiklanan ? `${istatistik.enCokTiklanan.nereden} → ${istatistik.enCokTiklanan.nereye}` : "Veri bekleniyor"}</span></div>
        </div>

        {(aktifSekme === "ekle" || aktifSekme === "firsatlar") && (
          <div className="admin12-grid">
            <form onSubmit={kaydet} className="admin12-panel admin12-form-panel">
              <div className="admin12-panel-head">
                <div>
                  <span>{duzenlenenId ? "Düzenleme modu" : "Yeni fırsat"}</span>
                  <h2>{duzenlenenId ? "Fırsatı güncelle" : "Uçuş fırsatı ekle"}</h2>
                </div>
                <button type="button" onClick={formSifirla}>Formu temizle</button>
              </div>

              <div className="admin12-form-section">
                <h3>Rota bilgileri</h3>
                <div className="admin12-form-grid two">
                  <label><span>Nereden</span><input value={form.nereden} onChange={(e) => formGuncelle("nereden", e.target.value)} /></label>
                  <label><span>Nereye</span><input value={form.nereye} onChange={(e) => formGuncelle("nereye", e.target.value)} /></label>
                  <label><span>Kalkış kodu</span><input value={form.kalkisKodu} onChange={(e) => formGuncelle("kalkisKodu", e.target.value.toUpperCase())} placeholder="IST" /></label>
                  <label><span>Varış kodu</span><input value={form.varisKodu} onChange={(e) => formGuncelle("varisKodu", e.target.value.toUpperCase())} placeholder="ROM" /></label>
                  <label><span>Ülke</span><input value={form.ulke} onChange={(e) => formGuncelle("ulke", e.target.value)} /></label>
                  <label><span>Emoji</span><input value={form.ulkeEmoji} onChange={(e) => formGuncelle("ulkeEmoji", e.target.value)} /></label>
                </div>
              </div>

              <div className="admin12-form-section">
                <h3>Fiyat ve kampanya</h3>
                <div className="admin12-form-grid three">
                  <label><span>Fiyat</span><input type="number" value={form.fiyatSayi} onChange={(e) => formGuncelle("fiyatSayi", Number(e.target.value))} /></label>
                  <label><span>Ay</span><select value={form.ay} onChange={(e) => formGuncelle("ay", e.target.value)}>{aylar.map((ay) => <option key={ay}>{ay}</option>)}</select></label>
                  <label><span>Tarih metni</span><input value={form.tarih} onChange={(e) => formGuncelle("tarih", e.target.value)} /></label>
                  <label><span>Havayolu</span><input value={form.havayolu} onChange={(e) => formGuncelle("havayolu", e.target.value)} /></label>
                  <label><span>Süre</span><input value={form.sure} onChange={(e) => formGuncelle("sure", e.target.value)} /></label>
                  <label><span>Bagaj</span><input value={form.bagaj} onChange={(e) => formGuncelle("bagaj", e.target.value)} /></label>
                  <label><span>Gidiş tarihi</span><input type="date" value={form.gidisTarihi} onChange={(e) => formGuncelle("gidisTarihi", e.target.value)} /></label>
                  <label><span>Dönüş tarihi</span><input type="date" value={form.donusTarihi} onChange={(e) => formGuncelle("donusTarihi", e.target.value)} /></label>
                  <label><span>Kampanya bitiş</span><input value={form.kampanyaBitis} onChange={(e) => formGuncelle("kampanyaBitis", e.target.value)} /></label>
                </div>
              </div>

              <div className="admin12-form-section">
                <h3>Yayın ayarları</h3>
                <div className="admin12-form-grid three">
                  <label><span>Kategori</span><select value={form.kategori} onChange={(e) => formGuncelle("kategori", e.target.value)}>{kategoriler.map((k) => <option key={k}>{k}</option>)}</select></label>
                  <label><span>Vize</span><select value={form.vize} onChange={(e) => formGuncelle("vize", e.target.value as VizeTipi)}><option>Vizesiz</option><option>Vizeli</option></select></label>
                  <label><span>Aktarma</span><select value={form.aktarma} onChange={(e) => formGuncelle("aktarma", e.target.value)}>{aktarmaSecenekleri.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label><span>Etiket</span><input value={form.etiket} onChange={(e) => formGuncelle("etiket", e.target.value)} /></label>
                  <label><span>Arama puanı</span><input type="number" min="1" max="100" value={form.aramaPuani} onChange={(e) => formGuncelle("aramaPuani", Number(e.target.value))} /></label>
                  <label><span>Son kontrol</span><input value={form.sonKontrol} onChange={(e) => formGuncelle("sonKontrol", e.target.value)} /></label>
                </div>
                <div className="admin12-switches">
                  <label><input type="checkbox" checked={form.aktif} onChange={(e) => formGuncelle("aktif", e.target.checked)} /> Aktif yayınla</label>
                  <label><input type="checkbox" checked={form.oneCikan} onChange={(e) => formGuncelle("oneCikan", e.target.checked)} /> Ana sayfada öne çıkar</label>
                </div>
              </div>

              <div className="admin12-form-section">
                <h3>Görsel, SEO ve link</h3>
                <div className="admin12-form-grid one">
                  <label><span>Görsel URL</span><input value={form.gorselUrl} onChange={(e) => formGuncelle("gorselUrl", e.target.value)} placeholder="Boş bırakırsan otomatik rota görseli kullanılır" /></label>
                  <label><span>Partner / kontrol linki</span><input value={form.link} onChange={(e) => formGuncelle("link", e.target.value)} /></label>
                  <label><span>Detay slug</span><input value={form.detaySlug} onChange={(e) => formGuncelle("detaySlug", e.target.value)} placeholder={slugOlustur(form.nereden, form.nereye)} /></label>
                  <label><span>Açıklama</span><textarea value={form.aciklama} onChange={(e) => formGuncelle("aciklama", e.target.value)} /></label>
                </div>
              </div>

              <button type="submit" className="admin12-save" disabled={yukleniyor}>{yukleniyor ? "Kaydediliyor..." : duzenlenenId ? "Güncelle" : "Fırsatı yayınla"}</button>
            </form>

            <aside className="admin12-preview-col">
              <div className="admin12-panel sticky">
                <div className="admin12-panel-head simple"><h2>Canlı önizleme</h2></div>
                <div className={`admin12-preview-img v12-route-${rotaSinifi(`${form.nereye} ${form.ulke} ${form.kategori}`)}`} style={gorselStyle(form.gorselUrl)}>
                  <span>{form.ulkeEmoji}</span>
                  <strong>{form.nereden} → {form.nereye}</strong>
                </div>
                <div className="admin12-preview-body">
                  <span>{form.kategori} · {form.vize}</span>
                  <h3>{fiyatYaz(form.fiyatSayi)}</h3>
                  <p>{form.aciklama}</p>
                  <div><b>{form.havayolu}</b><b>{form.ay}</b><b>{form.sonKontrol}</b></div>
                </div>
                <button onClick={() => metinKopyala(instagramMetni(form))} className="admin12-copy-btn">Instagram metni kopyala</button>
              </div>
            </aside>
          </div>
        )}

        {aktifSekme === "firsatlar" && (
          <div className="admin12-panel admin12-list-panel">
            <div className="admin12-list-head">
              <div>
                <span>Yayındaki içerikler</span>
                <h2>Uçuş fırsatları</h2>
              </div>
              <div className="admin12-filters">
                <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Rota, ülke, havayolu ara..." />
                <select value={kategoriFiltresi} onChange={(e) => setKategoriFiltresi(e.target.value)}><option>Tümü</option>{kategoriler.map((k) => <option key={k}>{k}</option>)}</select>
                <select value={durumFiltresi} onChange={(e) => setDurumFiltresi(e.target.value)}><option>Tümü</option><option>Aktif</option><option>Pasif</option></select>
              </div>
            </div>

            <div className="admin12-cards">
              {filtreliBiletler.map((bilet) => (
                <article className="admin12-deal-row" key={bilet.id}>
                  <div className={`admin12-row-img v12-route-${rotaSinifi(`${bilet.nereye} ${bilet.ulke} ${bilet.kategori}`)}`} style={gorselStyle(bilet.gorselUrl)}>
                    <span>{bilet.ulkeEmoji}</span>
                  </div>
                  <div className="admin12-row-main">
                    <div className="admin12-row-title"><strong>{bilet.nereden} → {bilet.nereye}</strong><b>{bilet.fiyat}</b></div>
                    <p>{bilet.aciklama || `${bilet.ulke} rotası için fırsat.`}</p>
                    <div className="admin12-row-tags">
                      <span>{bilet.kategori}</span><span>{bilet.vize}</span><span>{bilet.havayolu}</span><span>{bilet.tiklanma} tık</span>{!bilet.gorselUrl && <span className="warn">Otomatik görsel</span>}{bilet.oneCikan && <span>Öne çıkan</span>}
                    </div>
                  </div>
                  <div className="admin12-row-actions">
                    <button onClick={() => duzenle(bilet)}>Düzenle</button>
                    <button onClick={() => aktiflikDegistir(bilet)}>{bilet.aktif ? "Pasifleştir" : "Aktifleştir"}</button>
                    <button onClick={() => metinKopyala(instagramMetni(bilet))}>Metin</button>
                    <a href={`/ucak-bileti/${bilet.detaySlug}`} target="_blank">Detay</a>
                    <button className="danger" onClick={() => sil(bilet.id)}>Sil</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {aktifSekme === "icerik" && (
          <div className="admin12-panel admin12-content-grid">
            <div>
              <span>Sosyal medya asistanı</span>
              <h2>Fırsattan içerik üret</h2>
              <p>Her rota için Instagram açıklaması, story metni ve kısa duyuru metni hazırlayabilirsin.</p>
              <button onClick={() => metinKopyala(instagramMetni(form))}>Formdaki rota için Instagram metni kopyala</button>
            </div>
            <textarea readOnly value={instagramMetni(form)} />
          </div>
        )}

        {aktifSekme === "kalite" && (
          <div className="admin12-panel">
            <span>Kalite kontrol</span>
            <h2>Yayın öncesi eksikler</h2>
            <div className="admin12-quality-grid">
              <div><strong>{biletler.filter((b) => b.aktif && !b.gorselUrl).length}</strong><span>Aktif ama görselsiz fırsat</span></div>
              <div><strong>{biletler.filter((b) => b.aktif && !b.link).length}</strong><span>Partner linki eksik</span></div>
              <div><strong>{biletler.filter((b) => b.aktif && !b.aciklama).length}</strong><span>Açıklama eksik</span></div>
              <div><strong>{biletler.filter((b) => b.aktif && !b.detaySlug).length}</strong><span>Slug eksik</span></div>
            </div>
            <div className="admin12-checklist">
              <p>✅ Görsel URL varsa ana sayfa, fırsatlar ve detay sayfasında görünür.</p>
              <p>✅ Aktif olmayan fırsatlar kullanıcı tarafında gösterilmez.</p>
              <p>✅ Öne çıkan fırsatlar ana sayfada daha öncelikli görünür.</p>
              <p>✅ Son fiyat her zaman partner/havayolu sayfasında kontrol edilmelidir.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
