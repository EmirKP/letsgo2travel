import type { Metadata } from "next";
import Link from "next/link";
import { SupportAddress } from "./SupportAddress";
import styles from "./support.module.css";

export const metadata: Metadata = {
  title: "Destek | LetsGo2Travel",
  description: "LetsGo2Travel uygulama desteği, sorun bildirimi ve hesap işlemleri.",
  alternates: { canonical: "/destek" },
};

export default function SupportPage() {
  // Match the mobile support recipient without exposing private configuration.
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@letsgo2travel.com.tr";
  return <main className={`l2t-wrap ${styles.page}`}>
    <h1>LetsGo2Travel destek</h1>
    <p>Uygulamayla ilgili sorunlarını ve önerilerini bize e-posta ile iletebilirsin.</p>
    <section className={styles.card} aria-labelledby="support-contact">
      <h2 id="support-contact">Destek ekibine yaz</h2>
      <SupportAddress email={email} />
      <p>Hangi ekranda sorun yaşadığını ve uygulama sürümünü belirtmen yeterli. Şifre, rezervasyon kodu veya kimlik belgesi gönderme.</p>
      <p>E-posta uygulaman açılmazsa adresi kopyalayıp kullandığın web posta hizmetinden bize yazabilirsin. Bu sayfa otomatik mesaj göndermez.</p>
    </section>
    <section className={styles.card} aria-labelledby="support-account">
      <h2 id="support-account">Hesap ve veri işlemleri</h2>
      <p>Hesap silme ve diğer veri taleplerini uygulamadaki hesap bölümünden veya aşağıdaki sayfadan iletebilirsin.</p>
      <Link href="/veri-silme-ve-hak-talebi" className="l2t-btn">Hesap ve veri talepleri</Link>
    </section>
    <p lang="en">For support in English, email the address above. Include the affected screen and app version. If a mail app is unavailable, copy the address into your webmail service.</p>
  </main>;
}
