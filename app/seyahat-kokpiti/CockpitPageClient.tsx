"use client";

import { wallTimeToUtc, zonedParts, validTimeZone } from "@/lib/zoned-time";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Cockpit from "@/app/components/cockpit/Cockpit";
import type {
  ChecklistItem,
  CreateTripInput,
  Trip,
  TripPersonalUpdate,
} from "@/app/components/cockpit/types";
import { WEB_TRIP_FIELDS, readWebTrips, webTrip, patchWebTrip, personalTripPatch, deleteWebTrip } from "@/lib/cockpit/web-data";
import { createDefaultChecklist } from "@/lib/cockpit/destinationInfo";
import { supabase } from "@/lib/supabase-client";

import styles from "./CockpitPage.module.css";

type PageState = "loading" | "ready" | "signed-out" | "error";

function sortTrips(trips: Trip[]) {
  return [...trips].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

function localIsoDate(daysFromNow = 0, now: Date = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function CockpitPageClient() {
  const [state, setState] = useState<PageState>("loading");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const account = useRef<string | null>(null), generation = useRef(0);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const airaloUrl =
    process.env.NEXT_PUBLIC_AIRALO_AFFILIATE_URL || "/partnerler";
  const transferUrl =
    process.env.NEXT_PUBLIC_TRANSFER_AFFILIATE_URL || "/partnerler";

  const loadTrips = useCallback(async (owner: string | null = account.current) => {
    const current = ++generation.current;
    if (!owner) { setTrips([]); setState("signed-out"); return; }
    setErrorMessage("");
    try {
      const rows = await readWebTrips(supabase, owner);
      if (current !== generation.current || account.current !== owner) return;
      setTrips(sortTrips(rows));
      setState("ready");
    } catch (error) {
      if (current !== generation.current || account.current !== owner) return;
      console.error("Seyahat Kokpiti yüklenemedi", error);
      setTrips([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Seyahat Kokpiti yüklenirken bilinmeyen bir hata oluştu.",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    const initial = generation.current;
    const changeAccount = (owner: string | null) => {
      generation.current++; account.current = owner; setOwnerId(owner); setTrips([]); setIsSaving(false);
      setState(owner ? "loading" : "signed-out");
      if (owner) void loadTrips(owner);
    };
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (initial !== generation.current) return;
      if (error) { setErrorMessage("Oturum kontrol edilemedi."); setState("error"); return; }
      changeAccount(session?.user.id || null);
    }).catch(() => { if (initial === generation.current) { setErrorMessage("Oturum kontrol edilemedi."); setState("error"); } });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id || null) !== account.current) changeAccount(session?.user.id || null);
    });
    const invalidate = () => { generation.current++; account.current = null; };
    return () => { invalidate(); subscription.unsubscribe(); };
  }, [loadTrips]);

  const activeTripId = useMemo(() => {
    const today = localIsoDate();
    return (
      trips.find((trip) => trip.endDate >= today)?.id ?? trips[0]?.id ?? null
    );
  }, [trips]);

  const handleCreateTrip = useCallback(async (input: CreateTripInput) => {
    const owner = account.current, version = generation.current;
    if (!owner) throw new Error("Seyahat eklemek için giriş yapmalısın.");
    setIsSaving(true);

    try {
      const today = input.departureTime && validTimeZone(input.departureTimeZone) ? zonedParts(Date.now(), input.departureTimeZone).date : localIsoDate();
      const latest = localIsoDate(730);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
        || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)
        || input.startDate < today
        || input.startDate > latest
        || input.endDate < input.startDate
        || input.endDate > latest) {
        throw new Error("Seyahat tarihleri geçmişte olamaz ve geçerli sırada olmalıdır.");
      }

      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError || !session || session.user.id !== owner || version !== generation.current) {
        throw new Error("Seyahat eklemek için hesabına giriş yapmalısın.");
      }

      const user = session.user;

      let departureAt: string | null = null;
      if (input.departureTime) {
        const result = wallTimeToUtc(input.startDate, input.departureTime, input.departureTimeZone || "");
        departureAt = result.ok ? result.iso : result.reason === "ambiguous" && result.candidates?.includes(input.departureUtc || "") ? input.departureUtc! : null;
        if (!departureAt) throw new Error("Kalkışın yerel saatini ve saat dilimini doğrula.");
      }

      if (departureAt && Date.parse(departureAt) <= Date.now()) {
        throw new Error("Uçuş tarihi ve saati geçmişte olamaz.");
      }

      const { data, error } = await supabase
        .from("trips")
        .insert({
          user_id: user.id,
          destination_country: input.destinationCountry,
          destination_code: input.destinationCode,
          destination_city: input.destinationCity ?? null,
          start_date: input.startDate,
          end_date: input.endDate,
          departure_at: departureAt,
          flight_pnr: input.flightPnr ?? null,
          checklist_items: createDefaultChecklist(),
          status: "upcoming",
        })
        .select(WEB_TRIP_FIELDS)
        .single();

      if (error) {
        throw new Error(`Seyahat kaydedilemedi: ${error.message}`);
      }

      if (version !== generation.current || account.current !== owner) return;
      const createdTrip = webTrip(data as unknown as Record<string, unknown>, owner);
      setTrips((current) => sortTrips([...current, createdTrip]));
    } finally {
      if (version === generation.current) setIsSaving(false);
    }
  }, []);

  const handleUpdateChecklist = useCallback(
    async (tripId: string, checklistItems: ChecklistItem[]) => {
      const trip = trips.find(item => item.id === tripId), owner = account.current, version = generation.current;
      if (!owner || !trip || trip.userId !== owner) throw new Error("Kontrol listesini kaydetmek için giriş yapmalısın.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== owner || version !== generation.current) throw new Error("Oturum değişti. Tekrar giriş yap.");
      const saved = await patchWebTrip(supabase, trip, { checklist_items: checklistItems });
      if (version === generation.current && account.current === owner) setTrips(current => current.map(item => item.id === saved.id ? saved : item));
    },
    [trips],
  );

  const handleSaveTrip = useCallback(async (trip: Trip, input: TripPersonalUpdate) => {
    const owner = account.current, version = generation.current;
    const { data: { session } } = await supabase.auth.getSession();
    if (!owner || trip.userId !== owner || session?.user.id !== owner || version !== generation.current) throw new Error("Oturum değişti. Tekrar giriş yap.");
    const saved = await patchWebTrip(supabase, trip, personalTripPatch(trip, input));
    if (version === generation.current && account.current === owner) setTrips(current => sortTrips(current.map(item => item.id === saved.id ? saved : item)));
  }, []);

  const handleReloadTrip = useCallback(async (tripId: string) => {
    const owner = account.current, version = generation.current;
    if (!owner) throw new Error("Tekrar giriş yapmalısın.");
    const rows = await readWebTrips(supabase, owner);
    if (version !== generation.current || account.current !== owner) throw new Error("Oturum değişti.");
    setTrips(sortTrips(rows));
    const trip = rows.find(row => row.id === tripId);
    if (!trip) throw new Error("Seyahat başka bir cihazda silinmiş. Değişiklikler kaydedilmedi.");
    return trip;
  }, []);

  const handleDeleteTrip = useCallback(async (tripId: string) => {
    const owner = account.current, version = generation.current, trip = trips.find(item => item.id === tripId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!owner || !trip || session?.user.id !== owner || version !== generation.current) throw new Error("Seyahati silmek için giriş yapmalısın.");
    await deleteWebTrip(supabase, trip);
    if (version === generation.current && account.current === owner) setTrips((current) => current.filter((trip) => trip.id !== tripId));
  }, [trips]);

  if (state === "loading") {
    return (
      <div className={styles.feedbackPage}>
        <div className={styles.feedbackCard} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <h1>Seyahat Kokpitin hazırlanıyor</h1>
          <p>Seyahatlerin ve hazırlık listen yükleniyor.</p>
        </div>
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <div className={styles.feedbackPage}>
        <div className={styles.feedbackCard}>
          <span className={styles.icon} aria-hidden="true">
            ✈
          </span>
          <h1>Kişisel Seyahat Kokpitini aç</h1>
          <p>
            Seyahatlerin ve kontrol listen hesabına özel saklanır. Devam etmek
            için giriş yap veya yeni hesap oluştur.
          </p>
          <div className={styles.actions}>
            <Link
              href="/auth/login?next=/seyahat-kokpiti"
              className={styles.primaryLink}
            >
              Giriş yap
            </Link>
            <Link href="/auth/register" className={styles.secondaryLink}>
              Hesap oluştur
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={styles.feedbackPage}>
        <div className={styles.feedbackCard}>
          <span className={styles.errorIcon} aria-hidden="true">
            !
          </span>
          <h1>Seyahat Kokpiti yüklenemedi</h1>
          <p>{errorMessage}</p>
          <button type="button" onClick={() => void loadTrips()} className={styles.retryButton}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <Cockpit
      key={ownerId}
      trips={trips}
      activeTripId={activeTripId}
      airaloUrl={airaloUrl}
      transferUrl={transferUrl}
      isSaving={isSaving}
      onCreateTrip={handleCreateTrip}
      onUpdateChecklist={handleUpdateChecklist}
      onDeleteTrip={handleDeleteTrip}
      onSaveTrip={handleSaveTrip}
      onReloadTrip={handleReloadTrip}
    />
  );
}
