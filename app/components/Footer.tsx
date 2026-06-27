import Link from "next/link";
import { siteSettings } from "@/lib/affiliate";

export default function Footer() {
  return (
    <footer className="l2t-footer">
      <div className="l2t-wrap l2t-footer-grid">
        <div>
          <img src="/logo.png" alt="Letsgo2Travel" className="l2t-footer-logo" />
          <p className="l2t-muted" style={{ marginBottom: "12px" }}>
            Istanbul to ✈️ World. Uçak bileti fırsatları, vizesiz rotalar, otel, eSIM ve aktiviteleri tek yerde toplayan modern seyahat asistanı.
          </p>
          <p className="l2t-disclaimer" style={{ marginTop: "12px", padding: "12px", background: "rgba(0,0,0,0.05)", borderRadius: "8px", fontSize: "0.8rem", lineHeight: "1.5" }}>
            🔗 LetsGo2Travel bazı bağlantılardan komisyon kazanabilir. Bu, kullanıcıya ek maliyet oluşturmaz.
          </p>
        </div>
        <div>
          <h3>Hızlı Menü</h3>
          <Link href="/">Bilet Ara</Link>
          <Link href="/kampanyalar">Fırsatlar</Link>
          <Link href="/vizesiz-ulkeler">Vizesiz Ülkeler</Link>
          <Link href="/pasaport-gucu">Pasaport Gücü</Link>
          <Link href="/akilli-plan">AI Planlayıcı</Link>
          <Link href="/forum">Forum</Link>
          <Link href="/blog">Blog</Link>
        </div>
        <div>
          <h3>Yasal & Kurumsal</h3>
          <Link href="/kvkk-aydinlatma-metni">KVKK Aydınlatma Metni</Link>
          <Link href="/acik-riza-metni">Açık Rıza Metni</Link>
          <Link href="/gizlilik-politikasi">Gizlilik Politikası</Link>
          <Link href="/kullanim-sartlari">Kullanım Şartları</Link>
          <Link href="/topluluk-kurallari">Topluluk Kuralları</Link>
          <Link href="/veri-silme-ve-hak-talebi">Veri Silme ve Hak Talebi</Link>
          <Link href="/isletme-itiraz-formu">İşletme İtiraz Formu</Link>
          <Link href="/hakkimizda">Hakkımızda</Link>
          <a href={`mailto:${siteSettings.supportEmail}`}>İletişim</a>
        </div>
        <div>
          <h3>Partnerler</h3>
          <a href={siteSettings.bookingAffiliateUrl} target="_blank" rel="noreferrer">Oteller (Booking)</a>
          <a href={siteSettings.airaloAffiliateUrl} target="_blank" rel="noreferrer">eSIM (Airalo)</a>
          <a href={siteSettings.getYourGuideAffiliateUrl} target="_blank" rel="noreferrer">Tur & Aktivite</a>
          <Link href="/sitemap.xml">Sitemap</Link>
          <Link href="/rss.xml">RSS Feed</Link>
        </div>
      </div>
      <div className="l2t-wrap" style={{ paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", fontSize: "0.8rem", color: "var(--l2t-muted)" }}>
        <span>© {new Date().getFullYear()} LetsGo2Travel. Tüm hakları saklıdır.</span>
        <span>Fiyatlar ve vize bilgileri bilgilendirme amaçlıdır, resmi kaynaklardan kontrol ediniz.</span>
      </div>
    </footer>
  );
}
