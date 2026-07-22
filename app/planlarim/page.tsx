"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Compass, MapPin, Plane, Sparkles, Trash2 } from "lucide-react";
import { useTripStore } from "../store/tripStore";

const fallbackImages = [
  "/travel-images/route-saraybosna.jpg",
  "/travel-images/route-baku.jpg",
  "/travel-images/route-dubai.jpg",
  "/travel-images/route-roma.jpg",
];

export default function SavedPlansPage() {
  const [mounted, setMounted] = useState(false);
  const savedTrips = useTripStore((state) => state.savedTrips);
  const removeTrip = useTripStore((state) => state.removeTrip);
  const clearTrips = useTripStore((state) => state.clearTrips);

  useEffect(() => setMounted(true), []);

  return (
    <div className="l2t-v25-saved-page">
      <section className="l2t-v25-page-hero">
        <div className="l2t-wrap">
          <span className="l2t-v25-kicker"><Bookmark size={15} /> Planlarım</span>
          <h1>Seyahat panon</h1>
          <p>Kaydettiğin uçuşları, ülke rehberlerini ve Rota Asistanı planlarını tek ekranda yönet.</p>
        </div>
      </section>

      <section className="l2t-wrap l2t-v25-saved-content">
        {!mounted ? (
          <div className="l2t-v25-board-skeleton" />
        ) : savedTrips.length === 0 ? (
          <div className="l2t-v25-saved-empty">
            <span><Compass size={30} /></span>
            <h2>Panon henüz boş</h2>
            <p>Bir rota keşfet, uçuş fırsatını kaydet veya Rota Asistanı ile yeni plan oluştur.</p>
            <div>
              <Link href="/rota-asistani"><Sparkles size={18} /> Rota oluştur</Link>
              <Link href="/#bilet-ara"><Plane size={18} /> Uçuş ara</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="l2t-v25-saved-toolbar">
              <p><strong>{savedTrips.length}</strong> kayıtlı plan</p>
              <button type="button" onClick={clearTrips}><Trash2 size={16} /> Panoyu temizle</button>
            </div>
            <div className="l2t-v25-saved-grid">
              {savedTrips.map((trip, index) => (
                <article key={trip.id}>
                  <div className="l2t-v25-saved-image">
                    <Image src={trip.image || fallbackImages[index % fallbackImages.length]} alt="" fill sizes="(max-width: 720px) 92vw, 33vw" />
                    <span>{trip.type === "flight" ? <Plane size={15} /> : trip.type === "ai_plan" ? <Sparkles size={15} /> : <MapPin size={15} />} {trip.type === "flight" ? "Uçuş" : trip.type === "ai_plan" ? "Rota planı" : "Ülke rehberi"}</span>
                  </div>
                  <div className="l2t-v25-saved-card-body">
                    <h2>{trip.title}</h2>
                    <p>{trip.subtitle}</p>
                    <div>
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
