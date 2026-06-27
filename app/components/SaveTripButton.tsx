"use client";

import { useTripStore } from "../store/tripStore";
import { Bookmark } from "lucide-react";
import { useState } from "react";

export default function SaveTripButton({
  trip
}: {
  trip: { type: "flight" | "country" | "ai_plan"; title: string; subtitle: string; url: string; }
}) {
  const { addTrip } = useTripStore();
  const [saved, setSaved] = useState(false);

  return (
    <button
      className="l2t-btn"
      style={{
        background: saved ? "var(--l2t-gold)" : "rgba(255,255,255,.1)",
        color: saved ? "#000" : "#fff",
        border: "1px solid rgba(255,255,255,.2)",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }}
      onClick={() => {
        addTrip(trip);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
    >
      <Bookmark size={18} />
      {saved ? "Kaydedildi" : "Panoya Ekle"}
    </button>
  );
}
