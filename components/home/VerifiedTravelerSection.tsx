"use client";

import Link from "next/link";
import { Compass, KeyRound, Star } from "lucide-react";
import styles from "./VerifiedTravelerSection.module.css";

export default function VerifiedTravelerSection() {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2>Gerçekten gidenlerden gerçek seyahat bilgisi</h2>
        <p>
          Bir ülkeye gittiğini doğrulayan gezginler, o ülke hakkında soru cevaplayabilir, vize ve giriş deneyimlerini paylaşabilir. Böylece sadece resmi bilgiyi değil, sahada yaşanan gerçek tecrübeleri de görürsün.
        </p>
      </div>

      <div className="l2t-belgeli-gezgin-grid-3">
        <div className={`l2t-belgeli-gezgin-card ${styles.card}`}>
          <div className={`${styles.icon} ${styles.green}`}>
            <Compass />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">1. Ülkeni Doğrula</h3>
          <p className={`l2t-belgeli-gezgin-text ${styles.cardText}`}>Basit bir belge veya ikna edici fotoğrafla gittiğin ülkeyi doğrula.</p>
          <Link href="/profil/dogrulamalar" className={`l2t-belgeli-gezgin-btn ${styles.fullWidth}`}>Ülke Doğrula</Link>
        </div>

        <div className={`l2t-belgeli-gezgin-card ${styles.card}`}>
          <div className={`${styles.icon} ${styles.gold}`}>
            <KeyRound />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">2. Kilitleri Aç</h3>
          <p className={`l2t-belgeli-gezgin-text ${styles.cardText}`}>Onaylanınca ülke haritanda açılır ve o ülke hakkında yorum/cevap yazabilirsin.</p>
          <Link href="/forum/yeni" className={`l2t-belgeli-gezgin-btn-outline ${styles.fullWidth}`}>Forumda Soru Sor</Link>
        </div>

        <div className={`l2t-belgeli-gezgin-card ${styles.card}`}>
          <div className={`${styles.icon} ${styles.blue}`}>
            <Star />
          </div>
          <h3 className="l2t-belgeli-gezgin-title">3. Faydalı Bilgiyle Yüksel</h3>
          <p className={`l2t-belgeli-gezgin-text ${styles.cardText}`}>Gezginlere yardımcı olan cevaplar Kaşifler Ligi’nde seni öne çıkarır.</p>
          <Link href="/kasifler-ligi" className={`l2t-belgeli-gezgin-btn-outline ${styles.fullWidth}`}>Kaşifler Ligi'ni Gör</Link>
        </div>
      </div>
    </section>
  );
}
