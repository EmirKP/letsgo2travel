"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import Cockpit from "@/app/components/cockpit/Cockpit";
import type {
  ChecklistItem,
  CreateTripInput,
  Trip,
  TripStatus,
} from "@/app/components/cockpit/types";
import { createDefaultChecklist } from "@/lib/cockpit/destinationInfo";
import { supabase } from "@/lib/supabase-client";

import styles from "./CockpitPage.module.css";

type PageState = "loading" | "ready" | "signed-out" | "error";

interface TripRow {
  id: string;
  user_id: string;
  destination_country: string;
  destination_code: string;
  destination_city: string | null;
  start_date: string;
  end_date: string;
  departure_at: string | null;
  flight_pnr: string | null;
  checklist_items: ChecklistItem[] | null;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

function mapTrip(row: TripRow): Trip {
  return {
    id: row.id,
    userId: row.user_id,
    destinationCountry: row.destination_country,
    destinationCode: row.destination_code,
    destinationCity: row.destination_city,
    startDate: row.start_date,
    endDate: row.end_date,
    departureAt: row.departure_at,
    flightPnr: row.flight_pnr,
    checklistItems: Array.isArray(row.checklist_items)
      ? row.checklist_items
      : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortTrips(trips: Trip[]) {
  return [...trips].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

export default function CockpitPageClient() {
  const [state, setState] = useState<PageState>("loading");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const airaloUrl =
    process.env.NEXT_PUBLIC_AIRALO_AFFILIATE_URL || "/partnerler";
  const transferUrl =
    process.env.NEXT_PUBLIC_TRANSFER_AFFILIATE_URL || "/partnerler";

  const loadTrips = useCallback(async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw new Error(`Oturum kontrol edilemedi: ${authError.message}`);
      }

      if (!user) {
        setTrips([]);
        setState("signed-out");
        return;
      }

      const { data, error } = await supabase
        .from("trips")
        .select(
          [
            "id",
            "user_id",
            "destination_country",
            "destination_code",
            "destination_city",
            "start_date",
            "end_date",
            "departure_at",
            "flight_pnr",
            "checklist_items",
            "status",
            "created_at",
            "updated_at",
          ].join(","),
        )
        .eq("user_id", user.id)
        .neq("status", "cancelled")
        .order("start_date", { ascending: true });

      if (error) {
        throw new Error(`Seyahatler yüklenemedi: ${error.message}`);
      }

      setTrips(sortTrips(((data ?? []) as unknown as TripRow[]).map(mapTrip)));
      setState("ready");
    } catch (error) {
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
    void loadTrips();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setTrips([]);
        setState("signed-out");
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(() => void loadTrips(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadTrips]);

  const activeTripId = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      trips.find((trip) => trip.endDate >= today)?.id ?? trips[0]?.id ?? null
    );
  }, [trips]);

  const handleCreateTrip = useCallback(async (input: CreateTripInput) => {
    setIsSaving(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Seyahat eklemek için hesabına giriş yapmalısın.");
      }

      const departureAt = input.departureTime
        ? new Date(`${input.startDate}T${input.departureTime}:00`).toISOString()
        : null;

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
        .select(
          [
            "id",
            "user_id",
            "destination_country",
            "destination_code",
            "destination_city",
            "start_date",
            "end_date",
            "departure_at",
            "flight_pnr",
            "checklist_items",
            "status",
            "created_at",
            "updated_at",
          ].join(","),
        )
        .single();

      if (error) {
        throw new Error(`Seyahat kaydedilemedi: ${error.message}`);
      }

      const createdTrip = mapTrip(data as unknown as TripRow);
      setTrips((current) => sortTrips([...current, createdTrip]));
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleUpdateChecklist = useCallback(
    async (tripId: string, checklistItems: ChecklistItem[]) => {
      const previousTrips = trips;
      const nextUpdatedAt = new Date().toISOString();

      setTrips((current) =>
        current.map((trip) =>
          trip.id === tripId
            ? { ...trip, checklistItems, updatedAt: nextUpdatedAt }
            : trip,
        ),
      );

      const { error } = await supabase
        .from("trips")
        .update({
          checklist_items: checklistItems,
          updated_at: nextUpdatedAt,
        })
        .eq("id", tripId);

      if (error) {
        setTrips(previousTrips);
        throw new Error(`Kontrol listesi kaydedilemedi: ${error.message}`);
      }
    },
    [trips],
  );

  const handleDeleteTrip = useCallback(async (tripId: string) => {
    const { error } = await supabase.from("trips").delete().eq("id", tripId);

    if (error) {
      throw new Error(`Seyahat silinemedi: ${error.message}`);
    }

    setTrips((current) => current.filter((trip) => trip.id !== tripId));
  }, []);

  if (state === "loading") {
    return (
      <main className={styles.feedbackPage}>
        <div className={styles.feedbackCard} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <h1>Seyahat Kokpitin hazırlanıyor</h1>
          <p>Seyahatlerin ve hazırlık listen yükleniyor.</p>
        </div>
      </main>
    );
  }

  if (state === "signed-out") {
    return (
      <main className={styles.feedbackPage}>
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
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className={styles.feedbackPage}>
        <div className={styles.feedbackCard}>
          <span className={styles.errorIcon} aria-hidden="true">
            !
          </span>
          <h1>Seyahat Kokpiti yüklenemedi</h1>
          <p>{errorMessage}</p>
          <button type="button" onClick={loadTrips} className={styles.retryButton}>
            Tekrar dene
          </button>
        </div>
      </main>
    );
  }

  return (
    <Cockpit
      trips={trips}
      activeTripId={activeTripId}
      airaloUrl={airaloUrl}
      transferUrl={transferUrl}
      isSaving={isSaving}
      onCreateTrip={handleCreateTrip}
      onUpdateChecklist={handleUpdateChecklist}
      onDeleteTrip={handleDeleteTrip}
    />
  );
}
