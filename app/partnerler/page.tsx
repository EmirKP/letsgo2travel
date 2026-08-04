import type { Metadata } from "next";
import Link from "next/link";
import { BedDouble, MapPinned, Plane, Wifi } from "lucide-react";
import { siteSettings, trackedAffiliateUrl } from "@/lib/affiliate";

export const metadata: Metadata = {
  title: "Seyahat Partnerleri",
  description: "Uçuş, konaklama, eSIM ve aktivite hizmetlerinde yönlendirilen bağımsız sağlayıcılar.",
  alternates: { canonical: "/partnerler" },
};

const partners = [
  {
    name: "Booking.com",
    text: "Konaklama seçeneklerini sağlayıcının sitesinde karşılaştır.",
    icon: BedDouble,
    url: trackedAffiliateUrl({ provider: "booking", url: siteSettings.bookingAffiliateUrl, sourcePage: "partners" }),
  },
  {
    name: "Airalo",
    text: "Seyahat öncesinde eSIM paketlerini sağlayıcının sitesinde incele.",
    icon: Wifi,
    url: trackedAffiliateUrl({ provider: "airalo", url: siteSettings.airaloAffiliateUrl, sourcePage: "partners" }),
  },
  {
    name: "GetYourGuide",
    text: "Tur ve etkinlik seçeneklerini sağlayıcının sitesinde kontrol et.",
    icon: MapPinned,
    url: trackedAffiliateUrl({ provider: "getyourguide", url: siteSettings.getYourGuideAffiliateUrl, sourcePage: "partners" }),
  },
];

export default function PartnersPage() {
  return (
    <section className="l2t-page l2t-wrap" style={{ minHeight: "70vh", paddingBottom: "72px" }}>
      <div className="l2t-page-head">
        <span className="l2t-kicker"><Plane size={16} /> Bağımsız sağlayıcılar</span>
        <h1>Seyahat partnerleri</h1>
        <p>LetsGo2Travel ödeme almaz ve bilet düzenlemez. Seçtiğin hizmetin fiyatı, koşulları, değişikliği ve iadesi ilgili sağlayıcı tarafından yönetilir.</p>
      </div>
      <div className="l2t-card-grid l2t-card-grid-3">
        {partners.map(({ name, text, icon: Icon, url }) => (
          <a className="l2t-card l2t-affiliate-card" href={url} target="_blank" rel="nofollow sponsored noreferrer" key={name}>
            <div className="l2t-card-icon"><Icon size={24} /></div>
            <h2>{name}</h2>
            <p>{text}</p>
            <span className="l2t-btn l2t-btn-small">Sağlayıcıya git →</span>
          </a>
        ))}
      </div>
      <p className="l2t-disclaimer" style={{ marginTop: "24px" }}>Bu bağlantılardan yapılan uygun işlemler LetsGo2Travel’a komisyon kazandırabilir; kullanıcıya ek ücret yansıtılmaz.</p>
      <Link href="/" className="l2t-text-link">← Ana sayfaya dön</Link>
    </section>
  );
}
