import Link from "next/link";
import { Mail, Plane } from "lucide-react";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";

const productLinks = [
  ["Pasaport Gücü", "/pasaport-gucu"],
  ["Rota Asistanı", "/rota-asistani"],
  ["Uçuş Fırsatları", "/kampanyalar"],
  ["Gezgin Topluluğu", "/forum"],
  ["Ülke Rehberleri", "/ulke-rehberi"],
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
    <footer className="l2t-footer l2t-footer-v24">
      <div className="l2t-wrap l2t-footer-main-v24">
        <div className="l2t-footer-brand-v24">
          <Link href="/" className="l2t-brand-v24"><span>Letsgo</span><b>2</b><span>Travel</span><Plane size={19} /></Link>
          <p>Pasaport gücü, rota planlama, fiyat takibi ve gerçek gezgin deneyimleri tek seyahat platformunda.</p>
          <a href={`mailto:${siteSettings.supportEmail}`}><Mail size={16} /> {siteSettings.supportEmail}</a>
        </div>
        <div className="l2t-footer-column-v24"><h3>Keşfet</h3>{productLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
        <div className="l2t-footer-column-v24"><h3>Yasal</h3>{legalLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
        <div className="l2t-footer-column-v24"><h3>Partnerler</h3>
          <a href={trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "footer_v24" })} target="_blank" rel="nofollow sponsored noreferrer">Booking · Otel</a>
          <a href={trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "footer_v24" })} target="_blank" rel="nofollow sponsored noreferrer">Airalo · eSIM</a>
          <a href={trackedAffiliateUrl({ provider: "getyourguide", url: siteSettings.getYourGuideAffiliateUrl, sourcePage: "footer_v24" })} target="_blank" rel="nofollow sponsored noreferrer">GetYourGuide · Tur</a>
        </div>
      </div>
      <div className="l2t-wrap l2t-footer-bottom-v24">
        <span>© {new Date().getFullYear()} LetsGo2Travel</span>
        <span>Fiyat ve vize bilgilerini seyahat öncesinde resmi kaynaklardan doğrulayın.</span>
      </div>
    </footer>
  );
}
