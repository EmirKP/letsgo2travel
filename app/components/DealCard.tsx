"use client";

import { useState, useEffect } from "react";
import type { FlightDeal } from "@/lib/types";
import { Heart, Flame, ThumbsUp } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

const campaignDestinationImages: Record<string, string[]> = {
  DXB: ["/destinations/dubai-marina.jpg", "/destinations/dubai-palm.jpg", "/destinations/dubai.jpg"],
  FCO: ["/destinations/italy/colosseum.jpg", "/destinations/italy/trevi-fountain.jpg", "/destinations/italy/venice.jpg"],
  SJJ: ["/destinations/bosnia/sarajevo.jpg", "/destinations/bosnia/mostar.jpg", "/destinations/bosnia/kravice.jpg"],
  GYD: ["/destinations/baku-oldcity.jpg", "/destinations/baku-flame.jpg", "/destinations/baku.jpg"],
  TBS: ["/destinations/georgia/tbilisi.jpg", "/destinations/georgia/peace-bridge.jpg", "/destinations/georgia/narikala.jpg"],
  PAR: ["/destinations/paris-eiffel.jpg", "/destinations/paris-louvre.jpg", "/destinations/paris.jpg"],
  LON: ["/destinations/london-eye.jpg", "/destinations/london-bridge.jpg", "/destinations/london.jpg"],
  TIA: ["/destinations/serbia/novi-sad.jpg", "/destinations/bosnia/mostar.jpg", "/destinations/serbia/belgrade-fortress.jpg"],
  BUD: ["/destinations/budapest/parliament.jpg", "/destinations/budapest/chain-bridge.jpg", "/destinations/budapest/fishermans-bastion.jpg"],
  PRG: ["/destinations/prague/charles-bridge.jpg", "/destinations/prague/astronomical-clock.jpg", "/destinations/prague/prague-castle.jpg"],
};

let currentUserPromise: Promise<any> | null = null;

async function getCurrentUserOnce() {
  if (!currentUserPromise) {
    currentUserPromise = supabase.auth.getSession().then(({ data }) => data.session?.user ?? null);
  }
  return currentUserPromise;
}

type ConfettiOptions = Parameters<typeof import("canvas-confetti")>[0];

async function runConfetti(options: ConfettiOptions) {
  const confetti = (await import("canvas-confetti")) as unknown as typeof import("canvas-confetti");
  confetti(options);
}

export default function DealCard({ deal }: { deal: FlightDeal }) {
  const [hoverIndex, setHoverIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTorn, setIsTorn] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    getCurrentUserOnce().then((currentUser) => {
      if (active && currentUser) setUser(currentUser);
    });
    return () => {
      active = false;
    };
  }, []);

  const images = campaignDestinationImages[deal.destination_code] || [deal.image_url || "/destinations/prague/prague-castle.jpg"];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isHovered && images.length > 1) {
      interval = setInterval(() => {
        setHoverIndex((prev) => (prev + 1) % images.length);
      }, 1800);
    } else {
      setHoverIndex(0);
    }
    return () => clearInterval(interval);
  }, [isHovered, images.length]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (isFavorite) {
      await supabase.from("user_favorites").delete().eq("user_id", user.id).eq("bilet_id", deal.id);
      setIsFavorite(false);
    } else {
      await supabase.from("user_favorites").upsert([{ user_id: user.id, bilet_id: deal.id }], { onConflict: "user_id,bilet_id" });
      setIsFavorite(true);
      runConfetti({
        particleCount: 36,
        spread: 56,
        origin: { y: 0.8 },
        colors: ["#0b2239", "#c89a3d", "#4f89a8"],
      });
    }
  };

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTorn(true);

    runConfetti({
      particleCount: 80,
      spread: 64,
      origin: { y: 0.6 },
      colors: ["#0b2239", "#c89a3d", "#4f89a8"],
    });

    setTimeout(() => {
      router.push(`/ucak-bileti/${deal.slug}`);
    }, 900);
  };

  const trendColor = deal.price < 2500 ? "#178A68" : deal.price < 4500 ? "#C47A21" : "#C94A55";
  const trendLabel = deal.price < 2500 ? (
    <>
      <Flame size={14} /> Öne çıkan fiyat
    </>
  ) : deal.price < 4500 ? (
    <>
      <ThumbsUp size={14} /> Normal seviye
    </>
  ) : (
    "Ortalamanın üzeri"
  );

  return (
    <article
      className={`l2t-card l2t-deal-card ${isTorn ? "ticket-torn" : ""} ${deal.active === false ? "expired-deal" : ""}`}
      style={{
        transition: "all 0.45s ease",
        transform: isTorn ? "scale(0.97)" : "scale(1)",
        opacity: isTorn ? 0.85 : 1,
        filter: "none",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="l2t-card-image" style={{ position: "relative", backgroundColor: "#0b2239", overflow: "hidden" }}>
        {images.map((img, idx) => (
          <div
            key={idx}
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${img})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: hoverIndex === idx ? 1 : 0,
              transition: "opacity 0.75s ease-in-out",
              zIndex: hoverIndex === idx ? 2 : 1,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(4,17,28,0.08) 0%, rgba(4,17,28,0.1) 40%, rgba(4,17,28,0.68) 100%)",
            zIndex: 3,
            pointerEvents: "none",
          }}
        />

        <button
          onClick={toggleFavorite}
          aria-label={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "rgba(255,255,255,0.94)",
            border: "1px solid rgba(11,34,57,0.08)",
            borderRadius: "50%",
            width: "38px",
            height: "38px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
            zIndex: 5,
            transition: "all 0.2s",
            transform: isFavorite ? "scale(1.08)" : "scale(1)",
          }}
        >
          <Heart size={19} color={isFavorite ? "#c94a55" : "#607887"} fill={isFavorite ? "#c94a55" : "transparent"} />
        </button>
        <div className="l2t-deal-image-label">
          <small>{deal.visa_type || deal.region}</small>
          <strong>{deal.destination}</strong>
        </div>
      </div>

      <div className="l2t-card-body">
        <div className="l2t-card-topline">
          <span>{deal.region}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {deal.active === false ? <span style={{ color: "#C94A55", fontWeight: 700 }}>Süresi doldu</span> : deal.trip_type || "Gidiş dönüş"}
          </span>
        </div>
        <h3>{deal.title}</h3>
        <p>
          {deal.origin_code} → {deal.destination_code} · {deal.travel_period || "Esnek tarih"}
        </p>

        <div style={{ marginTop: "12px", background: "#f7f9fb", borderRadius: "10px", padding: "10px", border: "1px solid #e5ebf0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px", fontWeight: 700 }}>
            <span style={{ color: trendColor, display: "flex", alignItems: "center", gap: "4px" }}>{trendLabel}</span>
          </div>
          <div style={{ width: "100%", height: "6px", background: "#dfe6eb", borderRadius: "3px", overflow: "hidden", display: "flex" }}>
            <div style={{ flex: deal.price < 2500 ? "3" : deal.price < 4500 ? "2" : "1", height: "100%", background: trendColor, borderRadius: "3px" }} />
            <div style={{ flex: deal.price < 2500 ? "1" : deal.price < 4500 ? "2" : "3", height: "100%" }} />
          </div>
        </div>

        <div className="l2t-deal-bottom" style={{ marginTop: "16px", position: "relative", alignItems: "center" }}>
          {isTorn && <div style={{ position: "absolute", top: "50%", left: 0, width: "100%", borderTop: "2px dashed #94a3b8", zIndex: 10, animation: "tear 0.5s forwards" }} />}
          <div>
            <strong style={{ fontSize: "1.4rem", color: "#0b2239", display: "block" }}>
              {deal.price.toLocaleString("tr-TR")} {deal.currency}
            </strong>
            <small style={{ color: "#5f7080", fontSize: "0.72rem", marginTop: "3px", display: "block", lineHeight: 1.4 }}>
              Son kontrol: {deal.created_at ? new Date(deal.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Yakın tarihli fiyat sinyali"}
            </small>
          </div>
          <button
            onClick={handleBuyClick}
            disabled={deal.active === false}
            className="l2t-btn l2t-btn-small"
            style={{
              background: deal.active === false ? "#9aa7b4" : "#0b2239",
              color: "#fff",
              border: "none",
              position: "relative",
              zIndex: 11,
              cursor: deal.active === false ? "not-allowed" : "pointer",
              boxShadow: deal.active === false ? "none" : "0 10px 18px rgba(11,34,57,0.18)",
            }}
          >
            {isTorn ? "Açılıyor" : deal.active === false ? "Tükendi" : "Detay"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes tear {
          0% {
            transform: scaleX(0);
            opacity: 0;
          }
          100% {
            transform: scaleX(1);
            opacity: 1;
          }
        }
        .ticket-torn {
          filter: drop-shadow(0 10px 15px rgba(0, 0, 0, 0.1));
        }
        .ticket-torn .l2t-card-body {
          clip-path: polygon(0 0, 100% 0, 100% 100%, 95% 98%, 90% 100%, 85% 98%, 80% 100%, 75% 98%, 70% 100%, 65% 98%, 60% 100%, 55% 98%, 50% 100%, 45% 98%, 40% 100%, 35% 98%, 30% 100%, 25% 98%, 20% 100%, 15% 98%, 10% 100%, 5% 98%, 0 100%);
        }
      `}</style>
    </article>
  );
}
