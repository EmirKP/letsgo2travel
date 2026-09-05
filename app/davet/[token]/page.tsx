import type { Metadata } from "next";
import Link from "next/link";
import { InviteActions } from "./InviteActions";
import styles from "./invite.module.css";

export const metadata: Metadata = {
  title: "Ortak seyahat daveti · LetsGo2Travel",
  description: "Arkadaşının LetsGo2Travel ortak seyahat davetini aç.",
  robots: { index: false, follow: false },
};

export default async function TripInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").trim();
  const valid = /^[A-Za-z0-9_-]{20,200}$/.test(token);


  return <main className={styles.page}>
    <section className={styles.card}>
      <div className={styles.brand}>LetsGo<strong>2</strong>Travel</div>
      <span className={styles.icon} aria-hidden="true">✈️</span>
      <small>ORTAK SEYAHAT DAVETİ</small>
      <h1>{valid ? "Birlikte planlamaya davetlisin" : "Bu davet bağlantısı geçersiz"}</h1>
      <p>{valid ? "Seyahate katılmak, önerileri oylamak ve ortak masrafları takip etmek için hesabına giriş yap veya daveti uygulamada aç." : "Bağlantı eksik veya bozulmuş olabilir. Daveti gönderen kişiden yeni bağlantı iste."}</p>
      {valid && <InviteActions token={token} />}
      <Link className={styles.secondary} href="/">LetsGo2Travel ana sayfası</Link>
      <p className={styles.note}>Davetler 7 gün geçerlidir ve yalnız davet bağlantısına sahip kişiler tarafından kullanılabilir.</p>
    </section>
  </main>;
}
