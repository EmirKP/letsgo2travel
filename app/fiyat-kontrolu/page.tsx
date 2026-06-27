import type { Metadata } from "next";
import FiyatAlarmClient from "../components/FiyatAlarmClient";

export const metadata: Metadata = {
  title: "Fiyat Alarmı — Ucuz Bilet Çıkınca Haberdar Ol",
  description: "İstanbul çıkışlı uçuşlarda hedef fiyat belirle, fırsat çıktığında e-posta al.",
};

export default function PriceCheckPage() {
  return (
    <section className="l2t-page l2t-wrap">
      <div className="l2t-page-head">
        <p className="l2t-kicker">Fiyat alarmı</p>
        <h1>Bilet fiyatı düşünce haberdar ol</h1>
        <p>
          Gitmeyi planladığın rotayı seç, hedef bütçeni belirle — fırsat çıktığında sana haber verelim.
        </p>
      </div>
      <FiyatAlarmClient />
    </section>
  );
}
