"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { AiRouteResult } from "../akilli-plan/page";

const destinationImages: Record<string, string[]> = {
  prag: ["/destinations/prague/charles-bridge.jpg", "/destinations/prague/astronomical-clock.jpg", "/destinations/prague/prague-castle.jpg"],
  budapeste: ["/destinations/budapest/parliament.jpg", "/destinations/budapest/chain-bridge.jpg", "/destinations/budapest/fishermans-bastion.jpg"],
  venedik: ["/destinations/venice/canals.jpg", "/destinations/venice/rialto.jpg", "/destinations/venice/gondola.jpg"],
  saraybosna: ["/destinations/bosnia/sarajevo.jpg", "/destinations/bosnia/mostar.jpg"],
  belgrad: ["/destinations/serbia/belgrade-fortress.jpg", "/destinations/serbia/knez-mihailova.jpg"],
};

// Turkish character to english
const slugify = (text: string) => {
  return text.toString().toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
};

export default function AiDestinationCard({ route, onClick }: { route: AiRouteResult, onClick: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const citySlug = slugify(route.name);
  const images = destinationImages[citySlug] || [];
  const hasImages = images.length > 0;

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div 
      onClick={onClick}
      style={{
        borderRadius: "24px",
        overflow: "hidden",
        position: "relative",
        height: "440px",
        cursor: "pointer",
        boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: "460px",
        margin: "0 auto",
        width: "100%"
      }}
      className="glow-card hover-tilt"
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        {hasImages ? (
          <AnimatePresence mode="popLayout">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `linear-gradient(to top, rgba(6,20,51,0.95) 0%, rgba(6,20,51,0.4) 50%, transparent 100%), url('${images[currentIndex]}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </AnimatePresence>
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0B1D35 0%, #112B52 100%)" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.05, background: "url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"white\"/></svg>') center/cover" }} />
            <div style={{ position: "absolute", bottom: "0", left: "0", right: "0", height: "60%", background: "linear-gradient(to top, rgba(6,20,51,0.95), transparent)" }} />
          </div>
        )}
      </div>

      <div style={{ position: "relative", zIndex: 1, padding: "28px", color: "white" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <span style={{ display: "inline-block", background: "rgba(245, 158, 11, 0.2)", color: "#F59E0B", padding: "6px 12px", borderRadius: "100px", fontSize: "0.85rem", fontWeight: "700", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
            {route.country}
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <span style={{ background: "rgba(255,255,255,0.1)", padding: "4px 10px", borderRadius: "100px", fontSize: "0.8rem", backdropFilter: "blur(4px)" }}>
              ⭐ {route.scores?.overall || 90}/100
            </span>
          </div>
        </div>

        <h3 style={{ fontSize: "2rem", fontWeight: "800", marginBottom: "12px", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>{route.name}</h3>
        
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          <span style={{ background: "rgba(16, 185, 129, 0.2)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "4px 10px", borderRadius: "8px", fontSize: "0.8rem", color: "#6EE7B7", display: "flex", alignItems: "center", gap: "4px" }}>
            {route.visaStatus}
          </span>
          <span style={{ background: "rgba(255, 255, 255, 0.1)", padding: "4px 10px", borderRadius: "8px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px" }}>
            ⏱ {route.idealDuration}
          </span>
          <span style={{ background: "rgba(255, 255, 255, 0.1)", padding: "4px 10px", borderRadius: "8px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "4px" }}>
            💰 {route.estimatedBudget}
          </span>
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
          {route.firstTimeFriendly && <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px", color: "rgba(255,255,255,0.8)" }}>İlk Kez Uygun</span>}
          <span style={{ fontSize: "0.75rem", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: "4px", color: "rgba(255,255,255,0.8)" }}>Zorluk: {route.difficulty}</span>
        </div>

        <p style={{ fontSize: "0.95rem", lineHeight: "1.5", opacity: 0.85, marginBottom: "20px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {route.why}
        </p>

        <button className="l2t-btn" style={{ width: "100%", padding: "14px", fontSize: "1rem", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Rotayı İncele</span>
          <span style={{ opacity: 0.6 }}>→</span>
        </button>
      </div>
    </div>
  );
}
