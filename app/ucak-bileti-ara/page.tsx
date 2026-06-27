import type { Metadata } from "next";
import FlightSearchCard from "../components/FlightSearchCard";

export const metadata: Metadata = { title: "Uçak Bileti Ara", description: "Letsgo2Travel uçak bileti arama yönlendirme ekranı." };

export default function SearchFlightPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head"><p className="l2t-kicker">Uçuş arama</p><h1>Canlı fiyatları affiliate bağlantıyla kontrol et</h1></div>
      <FlightSearchCard />
    </section>
  );
}
