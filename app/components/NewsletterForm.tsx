"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setMessage("Kaydediliyor...");
    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setMessage(data.message || data.error || (response.ok ? "İşlem tamamlandı." : "Kayıt tamamlanamadı."));
      if (response.ok) setEmail("");
    } catch {
      setMessage("Bağlantı kurulamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="l2t-newsletter" onSubmit={submit}>
      <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-posta adresin" />
      <button className="l2t-btn" disabled={isSubmitting}>{isSubmitting ? "Kaydediliyor..." : "Fırsatları gönder"}</button>
      {message ? <p aria-live="polite">{message}</p> : null}
    </form>
  );
}
