import type { Metadata } from "next";
import { BadgeDollarSign, Globe2, Layers3, PlaneTakeoff } from "lucide-react";
import { getFlightDeals } from "@/lib/data";
import KampanyalarClient from "../components/KampanyalarClient";
import styles from "./campaigns.module.css";

export const metadata: Metadata = {
  title: "Öne Çıkan Uçuş Fırsatları",
  description: "Yakın tarihli uçuş fırsatlarını, vize türünü ve son kontrol zamanını tek ekranda karşılaştır.",
};

const campaignNotes = [
  { title: "Esnek tarih", text: "1-2 gün tarih esnetmek aynı rotada ciddi fiyat farkı yaratabilir." },
  { title: "Alternatif havalimanı", text: "İstanbul için IST/SAW, varışta ise yakın şehir seçenekleri kontrol edilebilir." },
  { title: "Vize maliyeti", text: "Ucuz bilet tek başına yeterli değildir; vize ve şehir içi giderleri de hesaba katılmalı." },
];

export default async function CampaignsPage() {
  const deals = await getFlightDeals();
  const activeDeals = deals.filter((deal) => deal.active !== false);
  const cheap = activeDeals.filter((deal) => deal.price <= 4000);
  const visaFree = activeDeals.filter((deal) => ["vizesiz", "kimlikle"].includes(deal.visa_type));
  const regionCount = new Set(deals.map((deal) => deal.region)).size;

  const stats = [
    { icon: PlaneTakeoff, value: activeDeals.length, label: "Aktif fırsat" },
    { icon: BadgeDollarSign, value: cheap.length, label: "4.000 TL altı" },
    { icon: Globe2, value: visaFree.length, label: "Vizesiz / kimlikle" },
    { icon: Layers3, value: regionCount, label: "Bölge" },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker}>Kampanyalar</p>
          <h1>Öne çıkan uçuş fırsatları</h1>
          <p>Bölge ve vize türüne göre filtrele, fiyatları karşılaştır ve uygun rotaya devam et.</p>
        </header>

        <section className={styles.stats} aria-label="Fırsat özeti">
          {stats.map(({ icon: Icon, value, label }) => (
            <article className={styles.stat} key={label}>
              <span className={styles.statIcon}><Icon size={20} /></span>
              <div><strong>{value}</strong><span>{label}</span></div>
            </article>
          ))}
        </section>

        <KampanyalarClient deals={deals} />

        <section className={styles.notes} aria-label="Fiyat karşılaştırma ipuçları">
          {campaignNotes.map((note) => (
            <article className={styles.note} key={note.title}>
              <h3>{note.title}</h3>
              <p>{note.text}</p>
            </article>
          ))}
        </section>

        <div className={styles.disclaimer}>
          <strong>Fiyat notu:</strong> Ana sayfa ve kampanyalar artık aynı fırsat verisini kullanır. Fiyatlar dönemsel olarak değişebilir; son tutarı yönlendirilen canlı arama ekranında doğrula.
        </div>
      </div>
    </div>
  );
}
