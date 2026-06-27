"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import type { FlightDeal } from "@/lib/types";
import { Heart, Flame, ThumbsUp } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

const campaignDestinationImages: Record<string, string[]> = {
  DXB: ["/destinations/dubai.jpg", "/destinations/dubai-marina.jpg", "/destinations/dubai-palm.jpg"],
  FCO: ["/destinations/rome.jpg", "/destinations/rome-colosseum.jpg", "/destinations/rome-trevi.jpg"],
  SJJ: ["/destinations/sarajevo.jpg", "/destinations/sarajevo-bascarsija.jpg", "/destinations/sarajevo-sebilj.jpg"],
  GYD: ["/destinations/baku.jpg", "/destinations/baku-flame.jpg", "/destinations/baku-oldcity.jpg"],
  TBS: ["/destinations/tbilisi.jpg", "/destinations/tbilisi-bridge.jpg", "/destinations/tbilisi-old.jpg"],
  PAR: ["/destinations/paris.jpg", "/destinations/paris-eiffel.jpg", "/destinations/paris-louvre.jpg"],
  LON: ["/destinations/london.jpg", "/destinations/london-bridge.jpg", "/destinations/london-eye.jpg"]
};

export default function DealCard({ deal }: { deal: FlightDeal }) {
  const [hoverIndex, setHoverIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const [isTorn, setIsTorn] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [user, setUser] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUserAndFav = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        const { data } = await supabase
          .from('user_favorites')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('bilet_id', deal.id)
          .maybeSingle();
        if (data) setIsFavorite(true);
      }
    };
    checkUserAndFav();
  }, [deal.id]);

  const images = campaignDestinationImages[deal.destination_code] || [deal.image_url || "/travel-images/route-generic.jpg"];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isHovered && images.length > 1) {
      interval = setInterval(() => {
        setHoverIndex(prev => (prev + 1) % images.length);
      }, 1500);
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
      await supabase.from('user_favorites').delete().eq('user_id', user.id).eq('bilet_id', deal.id);
      setIsFavorite(false);
    } else {
      await supabase.from('user_favorites').insert([{ user_id: user.id, bilet_id: deal.id }]);
      setIsFavorite(true);
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#ef4444', '#fca5a5']
      });
    }
  };

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsTorn(true);
    
    // Confetti effect
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#1476f2', '#FFD15C', '#10B981']
    });

    // Simulate navigation after animation
    setTimeout(() => {
      window.location.href = `/ucak-bileti/${deal.slug}`;
    }, 1000);
  };

  return (
    <article className={`l2t-card l2t-deal-card ${isTorn ? 'ticket-torn' : ''} ${deal.active === false ? 'expired-deal' : ''}`} style={{ transition: "all 0.5s ease", transform: isTorn ? "scale(0.95)" : "scale(1)", opacity: isTorn ? 0.8 : (deal.active === false ? 0.7 : 1), filter: deal.active === false ? "grayscale(1)" : "none" }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="l2t-card-image" style={{ position: "relative", backgroundColor: "var(--l2t-navy)", overflow: "hidden" }}>
        {images.map((img, idx) => (
          <div 
            key={idx}
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundImage: `url(${img})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: hoverIndex === idx ? 1 : 0,
              transition: "opacity 0.8s ease-in-out",
              zIndex: hoverIndex === idx ? 2 : 1
            }}
          />
        ))}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)", zIndex: 3, pointerEvents: "none" }} />
        
        <button 
          onClick={toggleFavorite}
          style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(255,255,255,0.9)", border: "none", borderRadius: "50%", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 5, transition: "all 0.2s", transform: isFavorite ? "scale(1.1)" : "scale(1)" }}
        >
          <Heart size={20} color={isFavorite ? "#ef4444" : "#94a3b8"} fill={isFavorite ? "#ef4444" : "transparent"} />
        </button>
      </div>
      <div className="l2t-card-body">
        <div className="l2t-card-topline">
          <span>{deal.region}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {deal.active === false ? <span style={{ color: "#EF4444", fontWeight: "700" }}>Süresi Doldu</span> : (deal.trip_type || "Gidiş dönüş")}
          </span>
        </div>
        <h3>{deal.title}</h3>
        <p>{deal.origin_code} → {deal.destination_code} · {deal.travel_period || "Esnek tarih"}</p>
        
        {/* Fiyat Trendi Barı */}
        <div style={{ marginTop: "12px", background: "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "10px", border: "1px solid rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px", fontWeight: "700" }}>
            <span style={{ color: deal.price < 2500 ? "#10B981" : deal.price < 4500 ? "#F59E0B" : "#EF4444", display: "flex", alignItems: "center", gap: "4px" }}>
              {deal.price < 2500 ? <><Flame size={14} /> Harika Fiyat (Al!)</> : deal.price < 4500 ? <><ThumbsUp size={14} /> Normal Seviye</> : "Ortalamanın Üzeri"}
            </span>
          </div>
          <div style={{ width: "100%", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden", display: "flex" }}>
            <div style={{ flex: deal.price < 2500 ? "3" : deal.price < 4500 ? "2" : "1", height: "100%", background: deal.price < 2500 ? "#10B981" : deal.price < 4500 ? "#F59E0B" : "#EF4444", borderRadius: "3px" }}></div>
            <div style={{ flex: deal.price < 2500 ? "1" : deal.price < 4500 ? "2" : "3", height: "100%" }}></div>
          </div>
        </div>

        <div className="l2t-deal-bottom" style={{ marginTop: "16px", position: "relative" }}>
          {isTorn && (
            <div style={{ position: "absolute", top: "50%", left: "0", width: "100%", borderTop: "2px dashed #94a3b8", zIndex: 10, animation: "tear 0.5s forwards" }}></div>
          )}
          <strong style={{ fontSize: "1.4rem", color: "var(--l2t-navy)" }}>{deal.price.toLocaleString("tr-TR")} {deal.currency}</strong>
          <button onClick={handleBuyClick} disabled={deal.active === false} className="l2t-btn l2t-btn-small" style={{ background: deal.active === false ? "#94a3b8" : (deal.price < 2500 ? "#10B981" : "var(--l2t-blue)"), border: "none", position: "relative", zIndex: 11, cursor: deal.active === false ? "not-allowed" : "pointer" }}>
            {isTorn ? "Bilet Yırtıldı!" : (deal.active === false ? "Tükendi" : "Detay")}
          </button>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes tear {
          0% { transform: scaleX(0); opacity: 0; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        .ticket-torn {
          filter: drop-shadow(0 10px 15px rgba(0,0,0,0.1));
        }
        .ticket-torn .l2t-card-body {
          clip-path: polygon(0 0, 100% 0, 100% 100%, 95% 98%, 90% 100%, 85% 98%, 80% 100%, 75% 98%, 70% 100%, 65% 98%, 60% 100%, 55% 98%, 50% 100%, 45% 98%, 40% 100%, 35% 98%, 30% 100%, 25% 98%, 20% 100%, 15% 98%, 10% 100%, 5% 98%, 0 100%);
        }
      `}</style>
    </article>
  );
}
