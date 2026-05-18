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
    <main className="letsgo-page">
      <header className="letsgo-header">
        <div className="letsgo-container letsgo-header-inner">
          <a href="/" className="letsgo-logo">
            <img src="/logo.png" alt="Letsgo 2 Travel" />
            <span className="letsgo-logo-title">Letsgo 2 Travel</span>
          </a>

          <nav className="letsgo-nav">
            <a href="/">Ana Sayfa</a>
            <a href="/arama">Uçuş Ara</a>
            <a href="#partner-arama">Partner Arama</a>
            <a href="/admin/dashboard">Admin</a>
          </nav>

          <a href="/arama" className="letsgo-header-cta">
            Aramaya Dön
          </a>
        </div>
      </header>

      <section className="letsgo-hero">
        <div className="letsgo-container">
          <div className="letsgo-hero-grid">
            <div>
              <p className="letsgo-hero-badge">✈️ Canlı uçuş fiyat detayı</p>

              <h1 className="letsgo-hero-title">
                {detay.nereden} → {detay.nereye}
              </h1>

              <p className="letsgo-hero-text">
                Bu fiyat Travelpayouts / Aviasales cache verisinden alınmıştır.
                Fiyatlar değişebilir. Satın almadan önce partner arama
                kutusundan güncel fiyatı kontrol et.
              </p>

              <div className="letsgo-hero-actions">
                <a href="#partner-arama" className="letsgo-primary-button">
                  Partnerde Ara
                </a>

                <button
                  onClick={() =>
                    kopyala(tumBilgi, "Tüm uçuş bilgileri kopyalandı")
                  }
                  className="letsgo-secondary-button"
                >
                  Bilgileri Kopyala
                </button>
              </div>
            </div>

            <div className="letsgo-plane-box">
              <div className="letsgo-hero-price">
                <p className="letsgo-hero-price-label">Gösterilen cache fiyat</p>
                <p className="letsgo-hero-price-value">
                  {fiyatYaz(detay.fiyat)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div className="letsgo-stats-grid">
            <StatCard title="Kalkış" value={detay.nereden || "—"} />
            <StatCard title="Varış" value={detay.nereye || "—"} />
            <StatCard title="Gidiş" value={tarihYaz(detay.gidis)} />
            <StatCard
              title="Dönüş"
              value={detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi"}
            />
          </div>
        </div>
      </section>

      <section className="letsgo-section">
        <div className="letsgo-container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 360px",
              gap: 28,
              alignItems: "start",
            }}
            className="canli-detail-grid"
          >
            <div style={{ display: "grid", gap: 24 }}>
              <div className="letsgo-card" style={{ padding: 28 }}>
                <div className="letsgo-section-header">
                  <div>
                    <p className="letsgo-eyebrow">Rota bilgisi</p>
                    <h2 className="letsgo-section-title">
                      {detay.nereden} → {detay.nereye}
                    </h2>
                  </div>

                  <span className="letsgo-badge">{detay.aktarma}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 14,
                  }}
                  className="canli-info-grid"
                >
                  <InfoCard title="Kalkış" value={detay.nereden} />
                  <InfoCard title="Varış" value={detay.nereye} />
                  <InfoCard title="Gidiş tarihi" value={tarihYaz(detay.gidis)} />
                  <InfoCard
                    title="Dönüş tarihi"
                    value={
                      detay.donus
                        ? tarihYaz(detay.donus)
                        : "Tek yön / belirtilmedi"
                    }
                  />
                  <InfoCard title="Havayolu" value={detay.havayolu} />
                  <InfoCard title="Kaynak" value={detay.kaynak} />
                </div>
              </div>

              <div className="letsgo-card" style={{ padding: 28 }}>
                <p className="letsgo-eyebrow">Partner arama rehberi</p>
                <h2 className="letsgo-section-title">
                  Widget’a şu bilgileri gir
                </h2>

                <p
                  style={{
                    marginTop: 10,
                    color: "#64748b",
                    lineHeight: 1.7,
                    fontWeight: 700,
                  }}
                >
                  Partner arama kutusunda aynı rota ve tarihleri girerek güncel
                  fiyatı kontrol et. Aşağıdaki alanları tek tek
                  kopyalayabilirsin.
                </p>

                <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
                  <CopyRow
                    label="Kalkış"
                    value={detay.nereden}
                    onCopy={() =>
                      kopyala(detay.nereden, "Kalkış bilgisi kopyalandı")
                    }
                  />

                  <CopyRow
                    label="Varış"
                    value={detay.nereye}
                    onCopy={() =>
                      kopyala(detay.nereye, "Varış bilgisi kopyalandı")
                    }
                  />

                  <CopyRow
                    label="Gidiş"
                    value={tarihYaz(detay.gidis)}
                    onCopy={() =>
                      kopyala(tarihYaz(detay.gidis), "Gidiş tarihi kopyalandı")
                    }
                  />

                  <CopyRow
                    label="Dönüş"
                    value={
                      detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi"
                    }
                    onCopy={() =>
                      kopyala(
                        detay.donus ? tarihYaz(detay.donus) : "Belirtilmedi",
                        "Dönüş tarihi kopyalandı"
                      )
                    }
                  />
                </div>

                {kopyaMesaji && <p className="letsgo-message">{kopyaMesaji}</p>}
              </div>

              <div className="letsgo-alert-box">
                <div>
                  <p className="letsgo-alert-eyebrow">Aracı site notu</p>

                  <h2 className="letsgo-alert-title">
                    Bilet satışı partner tarafta yapılır
                  </h2>

                  <p className="letsgo-alert-text">
                    Letsgo 2 Travel bu fiyatı karşılaştırma ve yönlendirme
                    amacıyla gösterir. Partner sitede fiyat, bagaj ve müsaitlik
                    değişebilir. Satın almadan önce son kontrolü mutlaka yap.
                  </p>
                </div>

                <div
                  style={{
                    borderRadius: 28,
                    background: "#f1f5f9",
                    padding: 22,
                  }}
                >
                  <p style={{ color: "#64748b", fontWeight: 950 }}>
                    Gösterilen fiyat
                  </p>

                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 40,
                      fontWeight: 950,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {fiyatYaz(detay.fiyat)}
                  </p>

                  <p
                    style={{
                      marginTop: 10,
                      color: "#64748b",
                      lineHeight: 1.6,
                      fontWeight: 700,
                    }}
                  >
                    Bu tutar cache veridir. Partner arama kutusunda güncel
                    fiyatı tekrar kontrol et.
                  </p>
                </div>
              </div>
            </div>

            <aside className="letsgo-card" style={{ padding: 24 }}>
              <p className="letsgo-stat-label">Cache fiyat</p>

              <p
                style={{
                  marginTop: 8,
                  fontSize: 44,
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: "-0.04em",
                }}
              >
                {fiyatYaz(detay.fiyat)}
              </p>

              <div style={{ marginTop: 22, display: "grid", gap: 12 }}>
                <button
                  onClick={() =>
                    kopyala(tumBilgi, "Tüm uçuş bilgileri kopyalandı")
                  }
                  className="letsgo-yellow-button"
                  style={{ width: "100%" }}
                >
                  Tüm Bilgileri Kopyala
                </button>

                <a
                  href="#partner-arama"
                  className="letsgo-primary-button"
                  style={{ width: "100%" }}
                >
                  Partner Arama Kutusuna Git
                </a>

                <a
                  href="/arama"
                  className="letsgo-secondary-button"
                  style={{ width: "100%" }}
                >
                  Başka Uçuş Ara
                </a>
              </div>

              <div
                style={{
                  marginTop: 22,
                  borderRadius: 22,
                  background: "#eaf5ff",
                  padding: 16,
                  color: "#061733",
                  fontSize: 14,
                  lineHeight: 1.7,
                  fontWeight: 750,
                }}
              >
                Bu sayfa bilet satışı yapmaz. Fiyatlar yönlendirme ve
                karşılaştırma amaçlıdır.
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="partner-arama" className="letsgo-section">
        <div className="letsgo-container">
          <div className="letsgo-card" style={{ padding: 28 }}>
            <div className="letsgo-section-header">
              <div>
                <p className="letsgo-eyebrow">Travelpayouts / Aviasales</p>
                <h2 className="letsgo-section-title">Partner Arama Kutusu</h2>
              </div>
            </div>

            <p
              style={{
                maxWidth: 760,
                color: "#64748b",
                lineHeight: 1.8,
                fontWeight: 700,
              }}
            >
              Aşağıdaki partner arama kutusundan rota ve tarihleri girerek
              güncel fiyatı kontrol edebilirsin. Widget açılır menü veya takvim
              genişlerse kutu içinde kaydırma yapılabilir.
            </p>

            <div
              style={{
                marginTop: 22,
                width: "100%",
                maxWidth: "100%",
                overflow: "auto",
                borderRadius: 28,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                padding: 14,
                minHeight: 220,
              }}
            >
              <div ref={widgetRef} />
            </div>
          </div>
        </div>
      </section>

      <footer className="letsgo-footer">
        <div className="letsgo-container">
          <div className="letsgo-footer-grid">
            <div>
              <div className="letsgo-footer-logo">
                <img src="/logo.png" alt="Letsgo 2 Travel" />
                <h2 className="letsgo-footer-title">Letsgo 2 Travel</h2>
              </div>

              <p className="letsgo-footer-text">
                Uygun uçuş fırsatlarını ve partner fiyatlarını tek yerde takip
                etmene yardımcı olur.
              </p>
            </div>

            <FooterLinks
              title="Keşfet"
              links={[
                ["Ana Sayfa", "/"],
                ["Uçuş Ara", "/arama"],
                ["Partner Arama", "#partner-arama"],
              ]}
            />

            <FooterLinks
              title="Yönetim"
              links={[
                ["Dashboard", "/admin/dashboard"],
                ["Bilet Admin", "/admin"],
                ["Fiyat Alarmları", "/admin/fiyat-alarmlari"],
              ]}
            />

            <div>
              <p className="letsgo-footer-heading">Bilgilendirme</p>
              <p className="letsgo-footer-text">
                Bilet fiyatları değişebilir. Satın almadan önce son fiyatı,
                bagaj şartlarını ve müsaitliği partner sitede kontrol edin.
              </p>

              <div className="letsgo-footer-pills">
                <span className="letsgo-footer-pill">Partner fiyatları</span>
                <span className="letsgo-footer-pill">Cache veri</span>
                <span className="letsgo-footer-pill">Aracı sayfa</span>
              </div>
            </div>
          </div>

          <div className="letsgo-footer-bottom">
            © 2026 Letsgo 2 Travel. Tüm hakları saklıdır.
          </div>
        </div>
      </footer>

      <style jsx>{`
        @media (max-width: 1100px) {
          .canli-detail-grid {
            grid-template-columns: 1fr !important;
          }

          .canli-info-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="letsgo-stat-card">
      <p className="letsgo-stat-label">{title}</p>
      <p className="letsgo-stat-value">{value}</p>
    </div>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 20,
        background: "#f1f5f9",
        padding: 18,
      }}
    >
      <p style={{ color: "#64748b", fontSize: 13, fontWeight: 950 }}>{title}</p>
      <p style={{ marginTop: 8, fontSize: 20, fontWeight: 950 }}>{value}</p>
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
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "center",
        justifyContent: "space-between",
        borderRadius: 20,
        background: "#f1f5f9",
        padding: 16,
      }}
    >
      <div>
        <p
          style={{
            color: "#64748b",
            fontSize: 12,
            fontWeight: 950,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>

        <p style={{ marginTop: 4, fontSize: 20, fontWeight: 950 }}>{value}</p>
      </div>

      <button
        onClick={onCopy}
        className="letsgo-primary-button"
        style={{ padding: "11px 16px", borderRadius: 14 }}
      >
        Kopyala
      </button>
    </div>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="letsgo-footer-heading">{title}</p>

      <div className="letsgo-footer-links">
        {links.map(([label, href]) => (
          <a key={label} href={href}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}