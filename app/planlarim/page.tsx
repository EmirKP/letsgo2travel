"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bookmark, Compass, MapPin, Plane, Sparkles, Trash2 } from "lucide-react";
import { useTripStore } from "../store/tripStore";
import styles from "./plans.module.css";

const fallbackImages = [
  "/travel-images/route-saraybosna.jpg",
  "/travel-images/route-baku.jpg",
  "/travel-images/route-dubai.jpg",
  "/travel-images/route-roma.jpg",
];

export default function SavedPlansPage() {
  const savedTrips = useTripStore((state) => state.savedTrips);
  const hasHydrated = useTripStore((state) => state.hasHydrated);
  const removeTrip = useTripStore((state) => state.removeTrip);
  const clearTrips = useTripStore((state) => state.clearTrips);


  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.kicker}><Bookmark size={15} /> Planlarım</span>
          <h1>Seyahat panon</h1>
          <p>Kaydettiğin uçuşları, ülke rehberlerini ve Rota Asistanı planlarını tek ekranda yönet.</p>
        </div>
      </section>

      <section className={styles.content}>
        {!hasHydrated || savedTrips.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyCopy}>
              <span className={styles.emptyIcon}><Compass size={32} /></span>
              <h2>Henüz kayıtlı planın yok</h2>
              <p>Bir rota keşfet, uçuş fırsatını kaydet veya Rota Asistanı ile yeni bir seyahat planı oluştur. Kaydettiklerin burada görünür.</p>
              <div className={styles.emptyActions}>
                <Link href="/rota-asistani" className={styles.primary}><Sparkles size={18} /> Rota oluştur</Link>
                <Link href="/#ucus-ara" className={styles.secondary}><Plane size={18} /> Uçuş ara</Link>
              </div>
            </div>
            <div className={styles.emptyVisual} aria-hidden="true">
              <div className={styles.routeMockup}>
                <span className={styles.routeLine} />
                <span className={styles.routePlane}><Plane size={24} /></span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.toolbar}>
              <p><strong>{savedTrips.length}</strong> kayıtlı plan</p>
              <button type="button" onClick={clearTrips}><Trash2 size={16} /> Panoyu temizle</button>
            </div>
            <div className={styles.grid}>
              {savedTrips.map((trip, index) => (
                <article key={trip.id} className={styles.card}>
                  <div className={styles.image}>
                    <Image
                      src={trip.image || fallbackImages[index % fallbackImages.length]}
                      alt={`${trip.title} seyahat görseli`}
                      fill
                      sizes="(max-width: 720px) 92vw, 33vw"
                    />
                    <span>{trip.type === "flight" ? <Plane size={15} /> : trip.type === "ai_plan" ? <Sparkles size={15} /> : <MapPin size={15} />} {trip.type === "flight" ? "Uçuş" : trip.type === "ai_plan" ? "Rota planı" : "Ülke rehberi"}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <h2>{trip.title}</h2>
                    <p>{trip.subtitle}</p>
                    <div className={styles.cardActions}>
                      <Link href={trip.url}>Planı aç <ArrowRight size={16} /></Link>
                      <button type="button" onClick={() => removeTrip(trip.id)} aria-label={`${trip.title} planını sil`}><Trash2 size={17} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
