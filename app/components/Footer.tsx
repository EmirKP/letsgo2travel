import Link from "next/link";
import { Mail, Plane } from "lucide-react";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";
import styles from "./Footer.module.css";

const productLinks = [
  ["Pasaport Gücü", "/pasaport-gucu"],
  ["Rota Asistanı", "/rota-asistani"],
  ["Vize Randevu Asistanı", "/vize-randevu"],
  ["Uçuş Fırsatları", "/kampanyalar"],
  ["Gezgin Topluluğu", "/forum"],
  ["Ülke Rehberleri", "/ulke-rehberi"],
  ["Seyahat Blogu", "/blog"],
  ["Bütçe Hesapla", "/butce-hesapla"],
  ["Seyahat Panom", "/planlarim"],
];

const legalLinks = [
  ["Gizlilik Politikası", "/gizlilik-politikasi"],
  ["Kullanım Şartları", "/kullanim-sartlari"],
  ["KVKK Aydınlatma", "/kvkk-aydinlatma-metni"],
  ["Veri Silme Talebi", "/veri-silme-ve-hak-talebi"],
  ["Hakkımızda", "/hakkimizda"],
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.main}>
        <div className={styles.brandBlock}>
          <Link href="/" className={styles.brand}>
            <span>LetsGo</span><b>2</b><span>Travel</span><Plane size={19} />
          </Link>
          <p>Pasaport gücü, rota planlama, fiyat takibi ve gerçek gezgin deneyimleri tek seyahat platformunda.</p>
          <a href={`mailto:${siteSettings.supportEmail}`}><Mail size={16} /> {siteSettings.supportEmail}</a>
        </div>
        <div className={styles.column}>
          <h3>Keşfet</h3>
          {productLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </div>
        <div className={styles.column}>
          <h3>Yasal</h3>
          {legalLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </div>
        <div className={styles.column}>
          <h3>Partnerler</h3>
          <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "footer_sprint3" })} target="_blank" rel="nofollow sponsored noreferrer">Booking · Otel</a>
          <a href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "footer_sprint3" })} target="_blank" rel="nofollow sponsored noreferrer">Airalo · eSIM</a>
          <a href={trackedAffiliateUrl({ provider: "getyourguide", url: siteSettings.getYourGuideAffiliateUrl, sourcePage: "footer_sprint3" })} target="_blank" rel="nofollow sponsored noreferrer">GetYourGuide · Tur</a>
        </div>
      </div>
      <div className={styles.bottom}>
        <span>© {new Date().getFullYear()} LetsGo2Travel</span>
        <span>Fiyat ve vize bilgilerini seyahat öncesinde resmi kaynaklardan doğrulayın.</span>
      </div>
    </footer>
  );
}
