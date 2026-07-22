"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import DealCard from "../components/DealCard";
import type { FlightDeal } from "@/lib/types";
import styles from "./KampanyalarClient.module.css";

const VISA_TYPES = [
  { label: "Tümü", value: "" },
  { label: "Vizesiz", value: "vizesiz" },
  { label: "Kimlikle", value: "kimlikle" },
  { label: "e-Vize", value: "e-vize" },
  { label: "Schengen", value: "schengen" },
];

export default function KampanyalarClient({ deals }: { deals: FlightDeal[] }) {
  const [region, setRegion] = useState("Tümü");
  const [visa, setVisa] = useState("");
  const [sort, setSort] = useState<"price" | "region">("price");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = useMemo(() => {
    const result = deals.filter((deal) => {
      if (region !== "Tümü" && deal.region !== region) return false;
      if (visa && deal.visa_type !== visa) return false;
      return true;
    });

    return [...result].sort((a, b) => {
      if (sort === "region") return a.region.localeCompare(b.region, "tr");
      return a.price - b.price;
    });
  }, [deals, region, visa, sort]);

  const availableRegions = ["Tümü", ...Array.from(new Set(deals.map((deal) => deal.region)))];

  return (
    <div className={styles.panel}>
      <div className={styles.filterBar}>
        <div className={styles.group}>
          <span className={styles.label}>Bölge</span>
          <div className={styles.chips}>
            {availableRegions.map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.chip} ${region === item ? styles.chipActive : ""}`}
                onClick={() => setRegion(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.group}>
          <span className={styles.label}>Vize türü</span>
          <div className={styles.chips}>
            {VISA_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.chip} ${visa === item.value ? styles.chipActive : ""}`}
                onClick={() => setVisa(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "price" | "region")}
            className={styles.select}
            aria-label="Fırsatları sırala"
          >
            <option value="price">Fiyata göre ↑</option>
            <option value="region">Bölgeye göre</option>
          </select>
          <button
            type="button"
            className={`${styles.viewButton} ${view === "grid" ? styles.viewActive : ""}`}
            onClick={() => setView("grid")}
            aria-label="Kart görünümü"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            className={`${styles.viewButton} ${view === "list" ? styles.viewActive : ""}`}
            onClick={() => setView("list")}
            aria-label="Liste görünümü"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <p className={styles.result}>
        <strong>{filtered.length} fırsat gösteriliyor</strong>
        {region !== "Tümü" && <> · {region}</>}
        {visa && <> · {VISA_TYPES.find((item) => item.value === visa)?.label}</>}
      </p>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>Bu filtreye uyan fırsat bulunamadı.</p>
          <button type="button" onClick={() => { setRegion("Tümü"); setVisa(""); }}>Filtreleri temizle</button>
        </div>
      ) : (
        <div className={view === "grid" ? styles.grid : styles.list}>
          {filtered.map((deal) => <DealCard key={deal.id} deal={deal} view={view} />)}
        </div>
      )}
    </div>
  );
}
