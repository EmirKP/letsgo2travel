"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Kaydediliyor...");
    const response = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { message?: string; error?: string };
    setMessage(data.message || data.error || "İşlem tamamlandı.");
    if (response.ok) setEmail("");
  }

  return (
    <form className="l2t-newsletter" onSubmit={submit}>
      <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-posta adresin" />
      <button className="l2t-btn">Fırsatları gönder</button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
