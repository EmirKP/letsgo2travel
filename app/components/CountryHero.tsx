"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SaveTripButton from "./SaveTripButton";

// Dummy local image structure. We map slugs to images if available.
const countryHeroImages: Record<string, string[]> = {
  "sirbistan": [
    "/destinations/serbia/belgrade-fortress.jpg",
    "/destinations/serbia/saint-sava.jpg",
    "/destinations/serbia/novi-sad.jpg",
    "/destinations/serbia/knez-mihailova.jpg"
  ],
  "italya": [
    "/destinations/italy/colosseum.jpg",
    "/destinations/italy/venice.jpg",
    "/destinations/italy/trevi-fountain.jpg"
  ],
  "gurcistan": [
    "/destinations/georgia/tbilisi.jpg",
    "/destinations/georgia/narikala.jpg",
    "/destinations/georgia/peace-bridge.jpg"
  ],
  "bosna-hersek": [
    "/destinations/bosnia/mostar.jpg",
    "/destinations/bosnia/sarajevo.jpg",
    "/destinations/bosnia/kravice.jpg"
  ]
};

interface CountryData {
  slug: string;
  country_name: string;
  emoji: string;
  region: string;
  visa_note: string;
  hero_image_url?: string;
}

export default function CountryHero({ country }: { country: CountryData }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Mix user provided fallback hero with local list
  const fallbackList = country.hero_image_url ? [country.hero_image_url] : [];
  const images = countryHeroImages[country.slug] || fallbackList;

  useEffect(() => {
    if (images.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [images.length]);

  const hasImages = images.length > 0;

  return (
    <div className="bento-hero glow-card" style={{ position: "relative", overflow: "hidden" }}>
      {/* Background Layer */}
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
                backgroundImage: `linear-gradient(to top, rgba(6,20,51,0.95), rgba(6,20,51,0.4)), url('${images[currentIndex]}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </AnimatePresence>
        ) : (
          <div style={{ 
            position: "absolute", 
            inset: 0, 
            background: "linear-gradient(135deg, #0B1D35 0%, #112B52 100%)" 
          }}>
            {/* World Map Silhouette Fallback effect */}
            <div style={{ 
              position: "absolute", inset: 0, opacity: 0.1, 
              background: "url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"><circle cx=\"50\" cy=\"50\" r=\"40\" fill=\"white\"/></svg>') center/cover" 
            }} />
          </div>
        )}
      </div>

      <div className="bento-hero-inner" style={{ position: "relative", zIndex: 1 }}>
        <span className="bento-badge" style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "#06B6D4", border: "1px solid rgba(6, 182, 212, 0.3)" }}>
          {country.region}
        </span>
        <h1 style={{ textShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          {country.emoji} {country.country_name}
        </h1>
        <p style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>{country.visa_note}</p>
        <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
          <SaveTripButton 
            trip={{
              type: "country",
              title: country.country_name,
              subtitle: country.region,
              url: `/ulke-rehberi/${country.slug}`
            }} 
          />
        </div>
      </div>
    </div>
  );
}
