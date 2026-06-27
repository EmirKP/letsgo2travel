"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCountryGuides } from "@/lib/data";
import { Dices } from "lucide-react";

const CITIES = ["Tokyo...", "Paris...", "Roma...", "Dubai...", "Londra...", "Bakü...", "Madrid...", "Beni Şaşırt!"];

export default function SurpriseButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("Beni Şaşırt!");
  const [isRolling, setIsRolling] = useState(false);

  const handleSurprise = async () => {
    if (loading) return;
    setLoading(true);
    setIsRolling(true);
    
    // Yüklenirken isimleri hızlı hızlı değiştir (Slot makinesi efekti)
    let count = 0;
    const interval = setInterval(() => {
      setText(CITIES[Math.floor(Math.random() * (CITIES.length - 1))]);
      count++;
      if (count > 10) clearInterval(interval);
    }, 100);

    const countries = await getCountryGuides();
    const random = countries[Math.floor(Math.random() * countries.length)];
    
    setTimeout(() => {
      clearInterval(interval);
      setText(random.country_name + "!");
      
      setTimeout(() => {
        router.push(`/ulke-rehberi/${random.slug}`);
      }, 500);
    }, 1200);
  };

  return (
    <button 
      onClick={handleSurprise} 
      disabled={loading}
      className={`l2t-btn l2t-btn-surprise ${isRolling ? 'rolling' : ''}`}
      style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "160px", justifyContent: "center", transition: "all 0.3s" }}
    >
      <Dices size={18} className={isRolling ? "spin-animation" : ""} /> {text}
      <style jsx>{`
        .spin-animation {
          animation: spin 0.5s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
