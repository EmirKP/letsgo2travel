"use client";

import { useState } from "react";
import { BellRing, CheckCircle2, X } from "lucide-react";
import styles from "./PriceAlertForm.module.css";

interface PriceAlertFormProps {
  originCode: string;
  originLabel: string;
  destinationCode: string;
  destinationLabel: string;
  departureDate: string;
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/flight-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originCode,
          originLabel,
          destinationCode,
          destinationLabel,
          departureDate,
          email,
          targetPrice: targetPrice ? Number(targetPrice) : null,
          userId: userId || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bir hata oluştu");

      setSuccess(true);
      window.setTimeout(() => onClose?.(), 3000);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.success} role="status">
        <CheckCircle2 size={44} />
        <h3>Alarm kuruldu</h3>
        <p>Fiyatlar düştüğünde e-posta ile haber vereceğiz.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {onClose && (
        <button type="button" onClick={onClose} className={styles.close} aria-label="Alarm formunu kapat"><X size={19} /></button>
      )}
      <div className={styles.heading}>
        <span><BellRing size={19} /></span>
        <div><h3>Fiyat düşünce haber ver</h3><p><strong>{originLabel} → {destinationLabel}</strong> rotasını takip edeceğiz.</p></div>
      </div>

      {errorMsg && <div className={styles.error} role="alert">{errorMsg}</div>}

      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          <span>E-posta adresiniz</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@mail.com" />
        </label>
        <label>
          <span>Hedef fiyat <small>Opsiyonel</small></span>
          <input type="number" min="0" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} placeholder="Örn. 2500" />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Kuruluyor..." : "Alarm kur"}</button>
      </form>

      <p className={styles.note}>Fiyatlar anlık değişebilir. Hedef fiyat boşsa anlamlı bir düşüş olduğunda bildirim gönderilir.</p>
    </div>
  );
}
