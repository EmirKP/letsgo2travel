import type { Metadata } from "next";
import FlightSearchCard from "../components/FlightSearchCard";
import FiyatAlarmClient from "../components/FiyatAlarmClient";

export const metadata: Metadata = { title: "Uçak Bileti Ara", description: "Letsgo2Travel uçak bileti arama yönlendirme ekranı." };

export default function SearchFlightPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Uçuş arama</p>
        <h1>Canlı fiyatları kontrol et, istersen fiyat alarmı kur.</h1>
        <p>Önce canlı uçuş araması yapabilir, alt bölümden rota ve e-posta girerek fiyat düşünce haber alabilirsin.</p>
      </div>
      <FlightSearchCard />
      <div className="l2t-flight-alert-section" id="fiyat-alarmi">
        <div className="l2t-section-head">
          <span className="l2t-kicker">Mail testi / fiyat alarmı</span>
          <h2>Fiyat düşünce e-posta almak için alarm kur</h2>
          <p>Bu form gerçek fiyat alarmı API'sine bağlıdır. Alarm kurulduğunda Resend üzerinden onay maili gönderilir.</p>
        </div>
        <FiyatAlarmClient />
      </div>
    </section>
  );
}
