"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bookmark, Compass, MapPin, Plane, Sparkles, Trash2 } from "lucide-react";
import { useTripStore } from "../store/tripStore";
import { supabase } from "@/lib/supabase-client";
import type { SavedTrip } from "../store/tripStore";
import styles from "./plans.module.css";

const fallbackImages = [
  "/travel-images/route-saraybosna.jpg",
  "/travel-images/route-baku.jpg",
  "/travel-images/route-dubai.jpg",
  "/travel-images/route-roma.jpg",
];

type SyncedTrip = SavedTrip & { remoteId: number | string };

function isSyncedTrip(trip: SavedTrip | SyncedTrip): trip is SyncedTrip {
  return "remoteId" in trip && (typeof trip.remoteId === "number" || typeof trip.remoteId === "string");
}

export default function SavedPlansPage() {
  const savedTrips = useTripStore((state) => state.savedTrips);
  const hasHydrated = useTripStore((state) => state.hasHydrated);
  const removeTrip = useTripStore((state) => state.removeTrip);
  const clearTrips = useTripStore((state) => state.clearTrips);
  const [syncedTrips, setSyncedTrips] = useState<SyncedTrip[]>([]);
  const [syncLoading, setSyncLoading] = useState(true);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) {
        if (active) setSyncLoading(false);
        return;
      }
      const { data: rows, error } = await supabase
        .from("user_trips")
        .select("id,title,destination,trip_data,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        setSyncError("Hesabındaki planlar şu an yüklenemedi.");
        setSyncLoading(false);
        return;
      }
      setSyncedTrips((rows || []).flatMap((row) => {
        const tripData = row.trip_data && typeof row.trip_data === "object" && !Array.isArray(row.trip_data)
          ? row.trip_data as Record<string, unknown>
          : {};
        const mobileKind = typeof tripData.mobile_kind === "string" ? tripData.mobile_kind : "";
        const title = typeof row.title === "string" ? row.title.slice(0, 160) : "Seyahat planı";
        const subtitle = typeof row.destination === "string" ? row.destination.slice(0, 220) : "Hesabınla eşitlenen kayıt";
        return [{
          id: `remote-${row.id}`,
          remoteId: row.id,
          type: mobileKind === "flight_search" ? "flight" as const : "ai_plan" as const,
          title,
          subtitle,
          url: mobileKind === "flight_search" ? "/#ucus-ara" : "/rota-asistani",
          savedAt: Date.parse(row.created_at || "") || Date.now(),
        }];
      }));
      setSyncLoading(false);
    }).catch(() => {
      if (active) {
        setSyncError("Hesap bağlantısı kurulamadı.");
        setSyncLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const allTrips = useMemo(() => {
    const syncedSignatures = new Set(syncedTrips.map((trip) =>
      `${trip.type}|${trip.title.trim().toLocaleLowerCase("tr-TR")}|${trip.subtitle.trim().toLocaleLowerCase("tr-TR")}`,
    ));
    const deviceOnly = savedTrips.filter((trip) => !syncedSignatures.has(
      `${trip.type}|${trip.title.trim().toLocaleLowerCase("tr-TR")}|${trip.subtitle.trim().toLocaleLowerCase("tr-TR")}`,
    ));
    return [...syncedTrips, ...deviceOnly];
  }, [savedTrips, syncedTrips]);

  const removeSyncedTrip = async (trip: SyncedTrip) => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return setSyncError("Bu kaydı silmek için yeniden giriş yapmalısın.");
    const { error } = await supabase.from("user_trips").delete().eq("id", trip.remoteId).eq("user_id", userId);
    if (error) return setSyncError("Hesap kaydı silinemedi.");
    setSyncedTrips((items) => items.filter((item) => item.remoteId !== trip.remoteId));
  };


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
        {syncError && <div role="alert" className={styles.emptyCopy}><p>{syncError}</p></div>}
        {!hasHydrated || syncLoading ? <div className={styles.empty}><div className={styles.emptyCopy}><h2>Planların yükleniyor</h2><p>Cihaz ve hesap kayıtların birleştiriliyor.</p></div></div>
        : allTrips.length === 0 ? (
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
              <p><strong>{allTrips.length}</strong> kayıtlı plan</p>
              {savedTrips.length > 0 && <button type="button" onClick={clearTrips}><Trash2 size={16} /> Cihaz panosunu temizle</button>}
            </div>
            <div className={styles.grid}>
              {allTrips.map((trip, index) => (
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
                      <button type="button" onClick={() => isSyncedTrip(trip) ? void removeSyncedTrip(trip) : removeTrip(trip.id)} aria-label={`${trip.title} planını sil`}><Trash2 size={17} /></button>
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
