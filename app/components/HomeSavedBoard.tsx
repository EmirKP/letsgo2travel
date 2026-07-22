"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, MapPin, Trash2 } from "lucide-react";
import { useTripStore } from "../store/tripStore";
import styles from "./HomeSavedBoard.module.css";

const fallbackImages = [
  "/destinations/bosnia/sarajevo.jpg",
  "/destinations/baku.jpg",
  "/destinations/dubai-marina.jpg",
];

export default function HomeSavedBoard() {
  const [mounted, setMounted] = useState(false);
  const savedTrips = useTripStore((state) => state.savedTrips);
  const removeTrip = useTripStore((state) => state.removeTrip);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={styles.skeleton} aria-hidden="true" />;
  }

  return (
    <section className={`l2t-container ${styles.section}`} aria-labelledby="travel-board-title">
      <div className={styles.copy}>
        <span className={styles.kicker}><Bookmark size={15} /> Seyahat panosu</span>
        <h2 id="travel-board-title">Beğendiğin rotaları kaybetme.</h2>
        <p>Rota önerilerini, ülke rehberlerini ve uçuşları panona ekle. Web ve uygulamada planına kaldığın yerden devam et.</p>
        <Link href="/planlarim">Tüm planlarımı aç <ArrowRight size={17} /></Link>
      </div>

      <div className={styles.content}>
        {savedTrips.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyPhoto}>
              <Image src="/destinations/italy/venice.jpg" alt="Venedik seyahat rotası" fill sizes="(max-width: 700px) 92vw, 48vw" />
            </div>
            <div>
              <span><MapPin size={17} /> Henüz kayıtlı rota yok</span>
              <p>Yukarıdaki önerilerden kalp yerine pano simgesine dokunarak ilk planını oluştur.</p>
            </div>
          </div>
        ) : (
          <div className={styles.list}>
            {savedTrips.slice(0, 3).map((trip, index) => (
              <article key={trip.id}>
                <div className={styles.thumb}>
                  <Image src={trip.image || fallbackImages[index % fallbackImages.length]} alt="" fill sizes="84px" />
                </div>
                <div><small>{trip.type === "flight" ? "Uçuş" : trip.type === "ai_plan" ? "Rota planı" : "Keşif"}</small><h3>{trip.title}</h3><p>{trip.subtitle}</p></div>
                <div className={styles.actions}>
                  <Link href={trip.url} aria-label={`${trip.title} planını aç`}><ArrowRight size={18} /></Link>
                  <button type="button" onClick={() => removeTrip(trip.id)} aria-label={`${trip.title} planını sil`}><Trash2 size={16} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
