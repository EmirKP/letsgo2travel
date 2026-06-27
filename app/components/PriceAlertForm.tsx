"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, X } from "lucide-react";

interface PriceAlertFormProps {
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  departureDate: string; // YYYY-MM-DD
  userId?: string | null;
  onClose?: () => void;
}

export default function PriceAlertForm({
  originCode,
  originLabel,
  destinationCode,
  destinationLabel,
  departureDate,
  userId,
  onClose,
}: PriceAlertFormProps) {
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      console.log("[PriceAlertForm] Form submit başladı.");
      
      const payload = {
        originCode,
        originLabel,
        destinationCode,
        destinationLabel,
        departureDate,
        email,
        targetPrice: targetPrice ? Number(targetPrice) : null,
        userId: userId || null,
      };
      console.log("[PriceAlertForm] Payload hazırlandı:", payload);

      const res = await fetch("/api/flight-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      console.log("[PriceAlertForm] Response status:", res.status);
      const data = await res.json();
      console.log("[PriceAlertForm] Response body:", data);

      if (!res.ok) {
        throw new Error(data.error || "Bir hata oluştu");
      }

      setSuccess(true);
      // Automatically hide success message and close after 3 seconds if modal
      setTimeout(() => {
        if (onClose) onClose();
      }, 3000);
    } catch (err: any) {
      console.error("[PriceAlertForm] Catch error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="glass-panel" style={{ padding: "24px", borderRadius: "16px", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
        <CheckCircle2 size={48} color="#059669" style={{ margin: "0 auto 16px" }} />
        <h3 style={{ margin: "0 0 8px", color: "var(--l2t-navy)", fontSize: "1.2rem" }}>Alarm Kuruldu!</h3>
        <p style={{ margin: 0, color: "var(--l2t-soft)", fontSize: "0.95rem" }}>
          Fiyatlar düştüğünde size haber vereceğiz.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: "24px", borderRadius: "16px", position: "relative" }}>
      {onClose && (
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer", color: "var(--l2t-muted)" }}>
          <X size={20} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ padding: "8px", background: "rgba(14, 165, 233, 0.1)", borderRadius: "12px" }}>
          <BellRing size={20} color="#0ea5e9" />
        </div>
        <h3 style={{ margin: 0, color: "var(--l2t-navy)", fontSize: "1.1rem" }}>Fiyat Düşünce Haber Ver</h3>
      </div>
      
      <p style={{ margin: "0 0 20px", color: "var(--l2t-soft)", fontSize: "0.9rem", lineHeight: 1.5 }}>
        <strong>{originLabel} → {destinationLabel}</strong> rotası için fiyatları takip edeceğiz.
      </p>

      {errorMsg && (
        <div style={{ padding: "12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", fontSize: "0.85rem", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "6px", fontWeight: "600" }}>E-posta Adresiniz</label>
          <input 
            type="email" 
            required 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@mail.com"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--l2t-border)", background: "white", outline: "none" }}
          />
        </div>
        
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", color: "var(--l2t-soft)", marginBottom: "6px", fontWeight: "600" }}>Hedef Fiyat (Opsiyonel)</label>
          <input 
            type="number" 
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="Örn: 2500 ₺ (Boş bırakırsanız ~%5 düşünce haber veririz)"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--l2t-border)", background: "white", outline: "none" }}
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          style={{ width: "100%", padding: "14px", background: "var(--l2t-gold)", color: "#1e293b", fontWeight: "700", border: "none", borderRadius: "12px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Kuruluyor..." : "Alarm Kur"}
        </button>
      </form>

      <p style={{ margin: "16px 0 0", color: "var(--l2t-muted)", fontSize: "0.75rem", textAlign: "center" }}>
        Fiyatlar anlık değişebilir. LetsGo2Travel izinli API sağlayıcılarından aldığı en uygun fiyatı sizin için takip eder.
      </p>
    </div>
  );
}
