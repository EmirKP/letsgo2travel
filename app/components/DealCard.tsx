"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Flame, Heart, ThumbsUp, TrendingUp } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { FlightDeal } from "@/lib/types";
import { supabase } from "@/lib/supabase-client";
import styles from "./DealCard.module.css";

const campaignDestinationImages: Record<string, string[]> = {
  DXB: ["/destinations/dubai-marina.jpg", "/destinations/dubai-palm.jpg", "/destinations/dubai.jpg"],
  FCO: ["/destinations/italy/colosseum.jpg", "/destinations/italy/trevi-fountain.jpg", "/destinations/italy/venice.jpg"],
  SJJ: ["/destinations/bosnia/sarajevo.jpg", "/destinations/bosnia/mostar.jpg", "/destinations/bosnia/kravice.jpg"],
  GYD: ["/destinations/baku-oldcity.jpg", "/destinations/baku-flame.jpg", "/destinations/baku.jpg"],
  TBS: ["/destinations/georgia/tbilisi.jpg", "/destinations/georgia/peace-bridge.jpg", "/destinations/georgia/narikala.jpg"],
  PAR: ["/destinations/paris-eiffel.jpg", "/destinations/paris-louvre.jpg", "/destinations/paris.jpg"],
  LON: ["/destinations/london-eye.jpg", "/destinations/london-bridge.jpg", "/destinations/london.jpg"],
  BUD: ["/destinations/budapest/parliament.jpg", "/destinations/budapest/chain-bridge.jpg", "/destinations/budapest/fishermans-bastion.jpg"],
  PRG: ["/destinations/prague/charles-bridge.jpg", "/destinations/prague/astronomical-clock.jpg", "/destinations/prague/prague-castle.jpg"],
};

const defaultImage = "/destinations/prague/prague-castle.jpg";

type DealCardProps = {
  deal: FlightDeal;
  view?: "grid" | "list";
};

type Signal = {
  label: string;
  color: string;
  width: string;
  icon: typeof Flame;
};

function getPriceSignal(deal: FlightDeal): Signal {
  if (deal.is_estimate || !deal.created_at) {
    return { label: "Tahmini fiyat · canlı kontrol gerekli", color: "#5c7180", width: "50%", icon: TrendingUp };
  }

  const region = deal.region.toLocaleLowerCase("tr-TR");
  const thresholds = region.includes("orta doğu")
    ? { good: 4800, normal: 6500 }
    : region.includes("avrupa")
      ? { good: 3500, normal: 5200 }
      : { good: 3000, normal: 4300 };

  if (deal.price <= thresholds.good) {
    return { label: "Öne çıkan fiyat", color: "#168065", width: "82%", icon: Flame };
  }
  if (deal.price <= thresholds.normal) {
    return { label: "Normal seviye", color: "#b7791f", width: "58%", icon: ThumbsUp };
  }
  return { label: "Yüksek seviye", color: "#c44b59", width: "34%", icon: TrendingUp };
}

function formatCurrency(currency: string) {
  return !currency || currency.toUpperCase() === "TRY" ? "TL" : currency.toUpperCase();
}

function formatVisaLabel(value: string) {
  const labels: Record<string, string> = {
    kimlikle: "Kimlikle",
    vizesiz: "Vizesiz",
    "e-vize": "e-Vize",
    "kapida-vize": "Kapıda vize",
    schengen: "Schengen",
  };
  return labels[value] ?? value;
}

export default function DealCard({ deal, view = "grid" }: DealCardProps) {
  const router = useRouter();
  const [hoverIndex, setHoverIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const images = useMemo(
    () => campaignDestinationImages[deal.destination_code] ?? [deal.image_url || defaultImage],
    [deal.destination_code, deal.image_url],
  );
  const signal = getPriceSignal(deal);
  const SignalIcon = signal.icon;

  useEffect(() => {
    let mounted = true;

    const loadUserAndFavorite = async (currentUser: User | null) => {
      if (!mounted) return;
      setUser(currentUser);
      if (!currentUser) {
        setIsFavorite(false);
        return;
      }

      const { data } = await supabase
        .from("user_favorites")
        .select("bilet_id")
        .eq("user_id", currentUser.id)
        .eq("bilet_id", deal.id)
        .maybeSingle();

      if (mounted) setIsFavorite(Boolean(data));
    };

    void supabase.auth.getSession().then(({ data }) => loadUserAndFavorite(data.session?.user ?? null));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUserAndFavorite(session?.user ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [deal.id]);

  useEffect(() => {
    if (!isHovered || images.length < 2) {
      setHoverIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setHoverIndex((current) => (current + 1) % images.length);
    }, 1800);

    return () => window.clearInterval(interval);
  }, [images.length, isHovered]);

  const toggleFavorite = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const nextValue = !isFavorite;
    setIsFavorite(nextValue);

    const query = nextValue
      ? supabase.from("user_favorites").upsert(
          [{ user_id: user.id, bilet_id: deal.id }],
          { onConflict: "user_id,bilet_id" },
        )
      : supabase.from("user_favorites").delete().eq("user_id", user.id).eq("bilet_id", deal.id);

    const { error } = await query;
    if (error) setIsFavorite(!nextValue);
  };

  const checkedAt = deal.created_at
    ? new Date(deal.created_at).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Kontrol tarihi yok";

  return (
    <article
      className={`${styles.card} ${deal.active === false ? styles.expired : ""}`}
      data-view={view}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.imageWrap}>
        <Image
          className={styles.image}
          src={images[hoverIndex] || defaultImage}
          alt={`${deal.destination} uçuş fırsatı`}
          fill
          sizes={view === "list" ? "(max-width: 720px) 100vw, 32vw" : "(max-width: 720px) 100vw, (max-width: 1180px) 45vw, 24vw"}
        />
        <div className={styles.imageShade} />
        <button
          type="button"
          className={`${styles.favorite} ${isFavorite ? styles.favoriteActive : ""}`}
          onClick={() => void toggleFavorite()}
          aria-label={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={isFavorite}
        >
          <Heart size={19} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <div className={styles.imageLabel}>
          <small>{formatVisaLabel(deal.visa_type)}</small>
          <strong>{deal.destination}</strong>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.topline}>
          <span>{deal.region}</span>
          <span className={deal.active === false ? styles.expiredText : ""}>
            {deal.active === false ? "Süresi doldu" : deal.trip_type || "Gidiş dönüş"}
          </span>
        </div>

        <h3 className={styles.title}>{deal.title}</h3>
        <p className={styles.route}>
          {deal.origin_code} → {deal.destination_code} · {deal.travel_period || "Esnek tarih"}
        </p>

        <div
          className={styles.signal}
          style={{
            "--signal-color": signal.color,
            "--signal-width": signal.width,
          } as React.CSSProperties}
        >
          <span className={styles.signalLabel}><SignalIcon size={14} /> {signal.label}</span>
          <div className={styles.signalTrack} aria-hidden="true">
            <div className={styles.signalFill} />
          </div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.priceBlock}>
            <strong className={styles.price}>
              {deal.is_estimate || !deal.created_at ? "Tahmini " : ""}{deal.price.toLocaleString("tr-TR")} {formatCurrency(deal.currency)}
            </strong>
            <small className={styles.checkedAt}>Son kontrol: {checkedAt}</small>
          </div>

          <Link
            href={deal.active === false ? "#" : `/ucak-bileti/${deal.slug}`}
            className={`${styles.detail} ${deal.active === false ? styles.detailDisabled : ""}`}
            aria-disabled={deal.active === false}
            tabIndex={deal.active === false ? -1 : undefined}
          >
            {deal.active === false ? "Tükendi" : "Detay"}
            {deal.active !== false && <ArrowRight size={15} />}
          </Link>
        </div>
      </div>
    </article>
  );
}
