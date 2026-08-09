import type { Metadata } from "next";
import { Suspense } from "react";
import FlightSearchExperience from "../components/FlightSearchExperience";

export const metadata: Metadata = {
  title: "Uçuş Karşılaştır",
  description: "Yetkili bilet kaynaklarını tek aramada karşılaştıran LetsGo2Travel uçuş meta-arama altyapısı.",
  alternates: { canonical: "/ucak-bileti-ara" },
};

export default function SearchFlightPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <header className="l2t-page-head">
        <p className="l2t-kicker">Uçuş meta-arama</p>
        <h1>Aynı uçuşu farklı satıcılarda karşılaştır</h1>
        <p>Canlı fiyatı, bagajı ve tarife koşullarını karşılaştır; seçtiğin teklif için doğrudan bilet sitesine git.</p>
      </header>
      <Suspense fallback={<p role="status">Uçuş arama ekranı hazırlanıyor…</p>}>
        <FlightSearchExperience />
      </Suspense>
    </section>
  );
}
