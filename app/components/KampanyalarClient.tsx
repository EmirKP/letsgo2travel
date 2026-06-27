"use client";

import { useState, useMemo } from "react";
import DealCard from "../components/DealCard";
import type { FlightDeal } from "@/lib/types";
import { LayoutGrid, List } from "lucide-react";

const REGIONS = ["Tümü", "Balkanlar", "Kafkasya", "Avrupa", "Orta Doğu"];
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
    let result = [...deals];
    if (region !== "Tümü") result = result.filter((d) => d.region === region);
    if (visa) result = result.filter((d) => d.visa_type === visa);
    if (sort === "price") result.sort((a, b) => a.price - b.price);
    return result;
  }, [deals, region, visa, sort]);

  const availableRegions = ["Tümü", ...Array.from(new Set(deals.map((d) => d.region)))];

  return (
    <div>
      {/* Filter Bar */}
      <div className="l2t-filter-bar">
        {/* Bölge filtreleme */}
        <div className="l2t-filter-group">
          <span className="l2t-filter-label">Bölge</span>
          <div className="l2t-filter-chips">
            {availableRegions.map((r) => (
              <button
                key={r}
                type="button"
                className={`l2t-chip${region === r ? " l2t-chip-active" : ""}`}
                onClick={() => setRegion(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Vize tipi */}
        <div className="l2t-filter-group">
          <span className="l2t-filter-label">Vize türü</span>
          <div className="l2t-filter-chips">
            {VISA_TYPES.map((v) => (
              <button
                key={v.value}
                type="button"
                className={`l2t-chip${visa === v.value ? " l2t-chip-active" : ""}`}
                onClick={() => setVisa(v.value)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sıralama + Görünüm */}
        <div className="l2t-filter-actions">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "price" | "region")}
            className="l2t-filter-select"
            aria-label="Sıralama"
          >
            <option value="price">Fiyata göre ↑</option>
            <option value="region">Bölgeye göre</option>
          </select>
          <button
            type="button"
            className={`l2t-view-btn${view === "grid" ? " l2t-view-btn-active" : ""}`}
            onClick={() => setView("grid")}
            aria-label="Grid görünüm"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            className={`l2t-view-btn${view === "list" ? " l2t-view-btn-active" : ""}`}
            onClick={() => setView("list")}
            aria-label="Liste görünüm"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Sonuç bilgisi */}
      <p className="l2t-filter-result">
        <strong>{filtered.length} fırsat toplam, {filtered.filter(d => d.active !== false).length} aktif</strong>

        {region !== "Tümü" && <> · {region}</>}
        {visa && <> · {VISA_TYPES.find((v) => v.value === visa)?.label}</>}
      </p>

      {/* Kartlar */}
      {filtered.length === 0 ? (
        <div className="l2t-empty-state">
          <p>Bu filtreye uyan fırsat bulunamadı.</p>
          <button
            type="button"
            className="l2t-btn l2t-btn-small"
            onClick={() => { setRegion("Tümü"); setVisa(""); }}
          >
            Filtreleri temizle
          </button>
        </div>
      ) : (
        <div className={view === "grid" ? "l2t-card-grid l2t-card-grid-4" : "l2t-deal-list"}>
          {filtered.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
