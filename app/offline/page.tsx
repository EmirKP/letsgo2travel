import Link from "next/link";
import { Plane, RotateCcw } from "lucide-react";

export const metadata = { title: "Bağlantı Yok" };

export default function OfflinePage() {
  return (
    <section className="l2t-offline-page">
      <div className="l2t-offline-card">
        <span className="l2t-offline-icon"><Plane size={30} /></span>
        <h1>Şu anda çevrimdışısın</h1>
        <p>İnternet bağlantını kontrol et. Daha önce açtığın bazı sayfalar uygulama önbelleğinden kullanılabilir.</p>
        <Link href="/"><RotateCcw size={17} /> Tekrar dene</Link>
      </div>
    </section>
  );
}
