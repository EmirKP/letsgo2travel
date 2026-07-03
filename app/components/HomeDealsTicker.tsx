import Link from "next/link";
import { ArrowUpRight, Clock3, TrendingUp } from "lucide-react";
import { formatFromPrice } from "@/lib/prices";

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
  if (normalized.includes("e")) return "e-Vize";
  return value;
}

export default function HomeDealsTicker({ deals }: { deals: Deal[] }) {
  const items = (deals || []).slice(0, 4);

  return (
    <section className="l2t-wrap l2t-live-deals-section" aria-label="Son taranan fırsatlar">
      <div className="l2t-live-deals-panel">
        <div className="l2t-live-deals-head">
          <div>
            <span className="l2t-live-kicker"><TrendingUp size={15} /> Son taranan fırsatlar</span>
            <h2>Popüler rotalarda fiyat sinyalleri</h2>
          </div>
          <span className="l2t-live-update"><Clock3 size={14} /> Cache / mevcut veri</span>
        </div>

        {items.length > 0 ? (
          <div className="l2t-live-deals-grid">
            {items.map((deal, index) => {
              const destination = deal.destination || "Rota";
              const price = deal.price ? `${deal.price.toLocaleString("tr-TR")} TL` : formatFromPrice(destination.toLowerCase());
              return (
                <Link href="/kampanyalar" className="l2t-live-deal-card" key={`${deal.id ?? destination}-${index}`}>
                  <span className="l2t-live-flag">{flags[destination] || "🌍"}</span>
                  <span className="l2t-live-route">
                    <strong>{destination}</strong>
                    <small>{deal.origin || deal.origin_code || "İstanbul"} çıkışlı</small>
                  </span>
                  <span className="l2t-live-price">{price}</span>
                  <span className="l2t-live-visa">{visaLabel(deal.visa_type)}</span>
                  <ArrowUpRight size={16} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="l2t-live-empty">
            Fırsat verisi hazırlanıyor. Gerçek veri gelene kadar sahte fiyat gösterilmez.
          </div>
        )}
      </div>
    </section>
  );
}
