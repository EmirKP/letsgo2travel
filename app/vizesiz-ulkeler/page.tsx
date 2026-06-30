"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plane, Clock, MapPin, Search, MessageCircle, ShieldCheck, BellRing } from "lucide-react";

const VISA_GROUPS = [
  { id: "all", label: "Tümü" },
  { id: "vizesiz", label: "✅ Vizesiz" },
  { id: "kimlikle", label: "🪪 Kimlikle" },
  { id: "kapida-vize", label: "🔵 Kapıda Vize" },
  { id: "e-vize", label: "💻 e-Vize" },
];

const REGION_GROUPS = [
  { id: "all-region", label: "Tüm Bölgeler" },
  { id: "Balkanlar", label: "Balkanlar" },
  { id: "Kafkasya", label: "Kafkasya" },
  { id: "Orta Doğu", label: "Orta Doğu" },
  { id: "Kuzey Afrika", label: "Afrika" },
  { id: "Uzak Doğu", label: "Asya" },
  { id: "Akdeniz", label: "Akdeniz" },
];

const VISA_COLORS: Record<string, string> = {
  vizesiz: "#10B981",
  kimlikle: "#1476F2",
  "kapida-vize": "#F59E0B",
  "e-vize": "#8B5CF6",
  "vize-gerekli": "#EF4444",
};

const VISA_LABELS: Record<string, string> = {
  vizesiz: "Vizesiz",
  kimlikle: "Kimlikle",
  "kapida-vize": "Kapıda Vize",
  "e-vize": "e-Vize",
  "vize-gerekli": "Vize Gerekli",
};

const COUNTRIES = [
  { id: 1, name: "Bosna Hersek", slug: "bosna-hersek", region: "Balkanlar", emoji: "🇧🇦", visa: "vizesiz", duration: "1s 50dk", stay: "30 gün", price: 1200, img: "/travel-images/route-saraybosna.jpg" },
  { id: 2, name: "Karadağ", slug: "karadag", region: "Balkanlar", emoji: "🇲🇪", visa: "vizesiz", duration: "1s 45dk", stay: "30 gün", price: 2200, img: "/travel-images/route-generic.jpg" },
  { id: 3, name: "Sırbistan", slug: "sirbistan", region: "Balkanlar", emoji: "🇷🇸", visa: "vizesiz", duration: "1s 40dk", stay: "30 gün", price: 1400, img: "/travel-images/route-generic.jpg" },
  { id: 4, name: "Üsküp", slug: "uskup", region: "Balkanlar", emoji: "🇲🇰", visa: "vizesiz", duration: "1s 35dk", stay: "90 gün", price: 1000, img: "/travel-images/route-generic.jpg" },
  { id: 5, name: "Gürcistan", slug: "gurcistan", region: "Kafkasya", emoji: "🇬🇪", visa: "kimlikle", duration: "2s 10dk", stay: "365 gün", price: 1600, img: "/travel-images/route-baku.jpg" },
  { id: 6, name: "Azerbaycan", slug: "azerbaycan", region: "Kafkasya", emoji: "🇦🇿", visa: "kimlikle", duration: "2s 45dk", stay: "90 gün", price: 1800, img: "/travel-images/route-baku.jpg" },
  { id: 7, name: "KKTC", slug: "kktc", region: "Akdeniz", emoji: "🇨🇾", visa: "kimlikle", duration: "1s 30dk", stay: "Sınırsız", price: 1200, img: "/travel-images/route-summer.jpg" },
  { id: 8, name: "Mısır", slug: "misir", region: "Kuzey Afrika", emoji: "🇪🇬", visa: "kapida-vize", duration: "2s 15dk", stay: "30 gün", price: 3500, img: "/travel-images/route-generic.jpg" },
  { id: 9, name: "BAE (Dubai)", slug: "bae", region: "Orta Doğu", emoji: "🇦🇪", visa: "e-vize", duration: "4s 10dk", stay: "30 gün", price: 2400, img: "/travel-images/route-dubai.jpg" },
  { id: 10, name: "Japonya", slug: "japonya", region: "Uzak Doğu", emoji: "🇯🇵", visa: "vizesiz", duration: "11s 30dk", stay: "90 gün", price: 18000, img: "/travel-images/route-generic.jpg" },
  { id: 11, name: "Maldivler", slug: "maldivler", region: "Uzak Doğu", emoji: "🇲🇻", visa: "kapida-vize", duration: "8s", stay: "30 gün", price: 14000, img: "/travel-images/route-summer.jpg" },
];

export default function VisaFreePage() {
  const [visaFilter, setVisaFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all-region");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return COUNTRIES.filter(c => {
      const matchVisa = visaFilter === "all" || c.visa === visaFilter;
      const matchRegion = regionFilter === "all-region" || c.region === regionFilter;
      const matchSearch = search === "" || c.name.toLowerCase().includes(search.toLowerCase());
      return matchVisa && matchRegion && matchSearch;
    });
  }, [visaFilter, regionFilter, search]);

  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "80vh", paddingBottom: "80px" }}>
      <div className="l2t-page-head" style={{ marginBottom: "24px" }}>
        <p className="l2t-kicker">Vizesiz seyahat</p>
        <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.5rem)", marginBottom: "12px" }}>Türk vatandaşları için kolay rotalar</h1>
        <p style={{ color: "var(--l2t-soft)", fontSize: "1.05rem" }}>Vize istemeyen, kimlikle gidilebilen veya daha kolay giriş imkanı sunan ülkeleri keşfet.</p>
      </div>

      <div className="l2t-visa-conversion-band">
        <div>
          <p className="l2t-kicker">Hızlı karar</p>
          <h2>Vizesiz rotayı seç, biletini ve gezgin yorumlarını hemen kontrol et.</h2>
          <p>Bu sayfadaki her karttan direkt rehbere, foruma veya uçak bileti aramaya geçebilirsin.</p>
        </div>
        <div className="l2t-visa-conversion-actions">
          <Link href="/pasaport-gucu"><ShieldCheck size={16} /> Pasaport gücünü gör</Link>
          <Link href="/fiyat-kontrolu"><BellRing size={16} /> Fiyat alarmı kur</Link>
          <Link href="/forum"><MessageCircle size={16} /> Gezginlere sor</Link>
        </div>
      </div>

      {/* Arama */}
      <div style={{ position: "relative", marginBottom: "20px", maxWidth: "480px" }}>
        <Search size={18} color="#94a3b8" style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Ülke ara..."
          style={{ width: "100%", padding: "12px 16px 12px 44px", borderRadius: "100px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "1rem", outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Vize Filtreleri */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "8px", marginBottom: "12px", WebkitOverflowScrolling: "touch" }}>
        {VISA_GROUPS.map(g => (
          <button key={g.id} onClick={() => setVisaFilter(g.id)} style={{ padding: "8px 18px", borderRadius: "100px", border: visaFilter === g.id ? "1px solid var(--l2t-blue)" : "1px solid #e2e8f0", background: visaFilter === g.id ? "var(--l2t-blue)" : "#fff", color: visaFilter === g.id ? "#fff" : "var(--l2t-navy)", fontWeight: "600", fontSize: "0.9rem", whiteSpace: "nowrap", cursor: "pointer" }}>{g.label}</button>
        ))}
      </div>

      {/* Bölge Filtreleri */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "16px", marginBottom: "24px", WebkitOverflowScrolling: "touch" }}>
        {REGION_GROUPS.map(g => (
          <button key={g.id} onClick={() => setRegionFilter(g.id)} style={{ padding: "6px 14px", borderRadius: "100px", border: regionFilter === g.id ? "1px solid #F59E0B" : "1px solid #e2e8f0", background: regionFilter === g.id ? "#FFF7ED" : "#f8fafc", color: regionFilter === g.id ? "#92400E" : "#64748B", fontWeight: "600", fontSize: "0.85rem", whiteSpace: "nowrap", cursor: "pointer" }}>{g.label}</button>
        ))}
      </div>

      {/* Kart Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--l2t-soft)" }}>
          <Search size={40} color="#e2e8f0" style={{ marginBottom: "16px" }} />
          <p style={{ fontSize: "1.1rem", fontWeight: "600" }}>Sonuç bulunamadı</p>
          <p>Farklı bir arama veya filtre deneyin.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "24px" }}>
          {filtered.map(c => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: "20px", overflow: "hidden", border: "1px solid #e2e8f0", transition: "all 0.2s" }} className="hover-tilt">
              <Link href={`/ulke-rehberi/${c.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ position: "relative", height: "180px", overflow: "hidden" }}>
                  <img
                    src={c.img}
                    alt={c.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(11,29,53,0.2), rgba(11,29,53,0.05))", pointerEvents: "none" }} />
                  <span style={{ position: "absolute", top: "12px", right: "12px", background: VISA_COLORS[c.visa] || "#64748B", color: "#fff", padding: "4px 10px", borderRadius: "100px", fontSize: "0.75rem", fontWeight: "800" }}>
                    {VISA_LABELS[c.visa] || c.visa}
                  </span>
                  <span style={{ position: "absolute", top: "12px", left: "12px", fontSize: "1.5rem" }}>{c.emoji}</span>
                </div>
                <div style={{ padding: "16px 20px 8px" }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "1.15rem", color: "var(--l2t-navy)", fontWeight: "800" }}>{c.name}</h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748B", display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={12} /> {c.region} • {c.stay} kalış</span>
                </div>
                <div style={{ display: "flex", gap: "16px", padding: "0 20px 12px", borderTop: "1px dashed #e2e8f0", paddingTop: "12px", marginTop: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: "var(--l2t-navy)", fontWeight: "700" }}><Clock size={14} color="#94a3b8" /> {c.duration}</div>
                  <div style={{ marginLeft: "auto", fontSize: "0.85rem", color: "var(--l2t-navy)", fontWeight: "700" }}>~{c.price.toLocaleString("tr-TR")} ₺+</div>
                </div>
              </Link>
              <div className="l2t-visa-card-actions">
                <Link href={`/ucak-bileti-ara?to=${encodeURIComponent(c.name)}`} className="l2t-btn">
                  <Plane size={14} /> Bilet Ara
                </Link>
                <Link href={`/ulke-rehberi/${c.slug}`}>Rehber</Link>
                <Link href={`/forum/ulke/${c.slug}`}><MessageCircle size={14} /> Yorumlar</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "32px", padding: "20px 24px", background: "#FFFBEB", border: "1px solid #FEF08A", borderRadius: "16px" }}>
        <p style={{ margin: 0, color: "#92400E", fontSize: "0.9rem", lineHeight: 1.6 }}>
          <strong>⚠️ Önemli:</strong> Vize ve giriş şartları değişebilir. Seyahatten önce resmi konsolosluk, havayolu ve sınır kapısı kurallarını kontrol etmek gerekmektedir. Bu sayfa bilgilendirme amaçlıdır.
        </p>
      </div>
    </section>
  );
}
