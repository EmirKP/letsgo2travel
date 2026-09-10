"use client";

import { useId, useState } from "react";
import styles from "./support.module.css";

export function SupportAddress({ email }: { email: string }) {
  const [notice, setNotice] = useState("");
  const addressId = useId();
  const validEmail = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(email);
      setNotice("Adres kopyalandı.");
    } catch {
      setNotice("Adres alanına dokunup metni seçerek kopyalayabilirsin.");
    }
  }
  return <div className={styles.address}>
    <label htmlFor={addressId}>E-posta / Email</label>
    <input id={addressId} value={email} readOnly onFocus={(event) => event.currentTarget.select()} />
    <div className={styles.actions}>
      {validEmail && <a className="l2t-btn" href={`mailto:${email}?subject=LetsGo2Travel%20destek%20talebi`}>E-posta uygulamasında aç</a>}
      <button className="l2t-btn l2t-btn-outline" onClick={() => void copyAddress()}>Adresi kopyala / Copy</button>
    </div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
