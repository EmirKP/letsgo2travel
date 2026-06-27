"use client";

import { motion } from "framer-motion";
import { Sparkles, Map, ChevronRight, Compass } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RouteWizardPage() {
  const router = useRouter();

  const [budget, setBudget] = useState("");
  const [visa, setVisa] = useState("");
  const [days, setDays] = useState("");

  const handleFastSearch = () => {
    router.push(`/akilli-plan?budget=${encodeURIComponent(budget)}&visa=${encodeURIComponent(visa)}&days=${encodeURIComponent(days)}`);
  };

  return (
    <div className="l2t-page l2t-wrap" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="glass-panel" 
        style={{ width: "100%", maxWidth: "600px", padding: "50px 40px", borderRadius: "24px", background: "rgba(10, 31, 74, 0.95)", color: "#fff", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}
      >
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "rgba(245, 158, 11, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <Compass size={40} color="#F59E0B" />
        </div>
        
        <h1 style={{ fontSize: "2.5rem", marginBottom: "16px", fontWeight: "800", color: "#fff" }}>Hızlı Rota Bul</h1>
        <p style={{ fontSize: "1.1rem", color: "#cbd5e1", marginBottom: "32px", lineHeight: "1.6" }}>
          Birkaç seçim yap, sana uygun rotaları hemen görelim. Detayları Akıllı Rota Danışmanı halledecek.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "32px", textAlign: "left" }}>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "0.95rem", color: "#94a3b8" }}>Bütçen Nasıl?</label>
            <select className="l2t-input" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
              <option value="" disabled style={{color: "#000"}}>Seçiniz...</option>
              <option value="10.000 TL altı" style={{color: "#000"}}>Düşük (10.000 TL altı)</option>
              <option value="15.000 TL - 25.000 TL arası" style={{color: "#000"}}>Orta (15.000 - 25.000 TL)</option>
              <option value="Bütçe önemli değil" style={{color: "#000"}}>Yüksek (Bütçe önemli değil)</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "0.95rem", color: "#94a3b8" }}>Vize Durumu</label>
            <select className="l2t-input" value={visa} onChange={(e) => setVisa(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
              <option value="" disabled style={{color: "#000"}}>Seçiniz...</option>
              <option value="Sadece vizesiz" style={{color: "#000"}}>Sadece Vizesiz / Kimlikle</option>
              <option value="Schengen vizem var" style={{color: "#000"}}>Schengen vizem var</option>
              <option value="Fark etmez, vize alabilirim" style={{color: "#000"}}>Fark etmez, vize alabilirim</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "600", fontSize: "0.95rem", color: "#94a3b8" }}>Seyahat Süresi</label>
            <select className="l2t-input" value={days} onChange={(e) => setDays(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
              <option value="" disabled style={{color: "#000"}}>Seçiniz...</option>
              <option value="2-3 gün (Hafta sonu)" style={{color: "#000"}}>2-3 gün (Hafta sonu)</option>
              <option value="1 hafta" style={{color: "#000"}}>1 hafta</option>
              <option value="Daha uzun" style={{color: "#000"}}>Daha uzun</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <button 
            className="l2t-btn" 
            onClick={handleFastSearch}
            disabled={!budget || !visa || !days}
            style={{ fontSize: "1.2rem", padding: "18px 40px", width: "100%", background: "#F59E0B", color: "var(--l2t-navy)", border: "none", boxShadow: "0 4px 15px rgba(245, 158, 11, 0.4)", borderRadius: "100px", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", opacity: (!budget || !visa || !days) ? 0.5 : 1, cursor: (!budget || !visa || !days) ? "not-allowed" : "pointer" }}
          >
            Hızlı Öneri Al <ChevronRight size={20} />
          </button>
          
          <Link href="/akilli-plan" style={{ color: "#94a3b8", fontSize: "0.95rem", textDecoration: "underline" }}>
            Veya daha detaylı planla (Akıllı Asistan)
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
