import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, TrendingUp } from "lucide-react";
import { formatFromPrice } from "@/lib/prices";
import styles from "./HomeDealsTicker.module.css";

type Deal = {
  id?: string | number;
  destination?: string;
  destination_code?: string;
  origin?: string;
  origin_code?: string;
  price?: number;
  visa_type?: string;
};

const flags: Record<string, string> = {
  Bakü: "🇦🇿",
  Tiflis: "🇬🇪",
  Saraybosna: "🇧🇦",
  Dubai: "🇦🇪",
  Roma: "🇮🇹",
  Belgrad: "🇷🇸",
};

function visaLabel(value?: string) {
  if (!value) return "Rota";
  const normalized = value.toLowerCase();
  if (normalized.includes("kim")) return "Kimlikle";
  if (normalized.includes("vizesiz")) return "Vizesiz";
  if (normalized.includes("e-vize") || normalized.includes("evisa")) return "e-Vize";
  if (normalized.includes("schengen")) return "Schengen";
  return value;
}

export default function HomeDealsTicker({ deals }: { deals: Deal[] }) {
  const items = (deals || []).slice(0, 4);

  return (
    <section className={`l2t-container ${styles.section}`} aria-label="Son taranan fırsatlar">
      <div className={styles.panel}>
        <div className={styles.head}>
          <div>
            <span className={styles.kicker}><TrendingUp size={15} /> Son taranan fırsatlar</span>
            <h2>Popüler rotalarda fiyat sinyalleri</h2>
          </div>
          <div className={styles.headMeta}>
            <span><Clock3 size={14} /> Yakın tarihli sinyaller</span>
            <Link href="/kampanyalar">Tüm fırsatlar <ArrowRight size={14} /></Link>
          </div>
        </div>

        {items.length > 0 ? (
          <div className={styles.grid}>
            {items.map((deal, index) => {
              const destination = deal.destination || "Rota";
              const price = deal.price ? `${deal.price.toLocaleString("tr-TR")} TL` : formatFromPrice(destination.toLowerCase());
              return (
                <Link href="/kampanyalar" className={styles.card} key={`${deal.id ?? destination}-${index}`}>
                  <span className={styles.flag}>{flags[destination] || "🌍"}</span>
                  <span className={styles.route}>
                    <strong>{destination}</strong>
                    <small>{deal.origin || deal.origin_code || "İstanbul"} çıkışlı</small>
                  </span>
                  <span className={styles.price}>{price}</span>
                  <span className={styles.visa}>{visaLabel(deal.visa_type)}</span>
                  <ArrowUpRight size={16} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>Fırsat verisi hazırlanıyor. Gerçek veri gelene kadar sahte fiyat gösterilmez.</div>
        )}
      </div>
    </section>
  );
}
