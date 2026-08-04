import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock3, Plane } from "lucide-react";
import type { FlightDeal } from "@/lib/types";
import styles from "./HomeDealPreview.module.css";

const images: Record<string, string> = {
  DXB: "/destinations/dubai-marina.jpg",
  FCO: "/destinations/italy/colosseum.jpg",
  ROM: "/destinations/italy/colosseum.jpg",
  SJJ: "/destinations/bosnia/sarajevo.jpg",
  GYD: "/destinations/baku-oldcity.jpg",
  TBS: "/destinations/georgia/tbilisi.jpg",
  PAR: "/destinations/paris-eiffel.jpg",
  BUD: "/destinations/budapest/parliament.jpg",
  PRG: "/destinations/prague/charles-bridge.jpg",
  BEG: "/destinations/serbia/belgrade-fortress.jpg",
};

function visaLabel(value: string) {
  if (value === "kimlikle") return "Kimlikle";
  if (value === "vizesiz") return "Vizesiz";
  if (value === "e-vize") return "e-Vize";
  if (value === "kapida-vize") return "Kapıda vize";
  if (value === "schengen") return "Schengen";
  return "Vize gerekli";
}

function displayCurrency(currency: string) {
  return !currency || currency.toUpperCase() === "TRY" ? "TL" : currency.toUpperCase();
}

export default function HomeDealPreview({ deal }: { deal: FlightDeal }) {
  const checkedAt = deal.created_at
    ? new Date(deal.created_at).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Kontrol tarihi yok · canlı fiyat değildir";

  return (
    <Link href={`/ucak-bileti/${deal.slug}`} className={styles.card}>
      <div className={styles.imageWrap}>
        <Image
          src={images[deal.destination_code] || deal.image_url || "/destinations/prague/prague-castle.jpg"}
          alt={`${deal.destination} uçuş fırsatı`}
          fill
          sizes="(max-width: 760px) 88vw, (max-width: 1100px) 44vw, 31vw"
        />
        <div className={styles.imageShade} />
        <span className={styles.visa}>{visaLabel(deal.visa_type)}</span>
        <div className={styles.destination}>
          <small>{deal.region}</small>
          <strong>{deal.destination}</strong>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.route}>
          <span><Plane size={15} /> {deal.origin_code}</span>
          <span className={styles.routeLine} />
          <span>{deal.destination_code}</span>
        </div>
        <h3>{deal.title}</h3>
        <p>{deal.travel_period || "Esnek seyahat tarihleri"} · {deal.trip_type || "Gidiş dönüş"}</p>
        <div className={styles.footer}>
          <div>
            <strong>{deal.is_estimate || !deal.created_at ? "Tahmini " : ""}{deal.price.toLocaleString("tr-TR")} {displayCurrency(deal.currency)}</strong>
            <small><Clock3 size={13} /> {checkedAt}</small>
          </div>
          <span className={styles.open}><ArrowUpRight size={18} /></span>
        </div>
      </div>
    </Link>
  );
}
