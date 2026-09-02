import { useMemo, useRef, useState } from "react";
import worldPaths from "../data/worldMapPaths.json";
import { ALPHA3_TO_GEO_ID } from "../data/countryCodes";
import type { VisaStatus } from "../types";

// Pasaport Gücü etkileşimli dünya haritası.
// - Geometri build sırasında üretilen statik SVG path'leridir
//   (world-atlas / Natural Earth, kamu malı): çalışma anında ağ veya
//   harita kütüphanesi yok — mobilde hızlı ve çevrimdışı çalışır.
// - Renkler vize durumunu gösterir; veri mevcut doğrulanmış sınıf
//   listesinden gelir, eşleşmeyen ülkeler "Bilinmiyor" olarak boyanır.
// - Pan: tek parmak sürükleme; zoom: iki parmak veya +/- düğmeleri.

type WorldPath = { id: string; name: string; d: string };

export type MapStatus = VisaStatus | "unknown";

const STATUS_FILL: Record<MapStatus, string> = {
  id_card: "#2E9BD6",
  free: "#2FA981",
  evisa: "#7A66C9",
  on_arrival: "#E2A93B",
  required: "#D96470",
  unknown: "#C7D2DB",
};

const GEO_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_TO_GEO_ID).map(([alpha3, geoId]) => [geoId, alpha3]),
);

const MIN_SCALE = 1;
const MAX_SCALE = 8;

type PassportWorldMapProps = {
  statusFor: (alpha3: string | null) => MapStatus;
  isHighlighted: (alpha3: string | null) => boolean;
  selectedAlpha3: string | null;
  onSelectCountry: (alpha3: string) => void;
};

export function PassportWorldMap({ statusFor, isHighlighted, selectedAlpha3, onSelectCountry }: PassportWorldMapProps) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: { scale: number; x: number; y: number }; origin: { x: number; y: number }; distance: number; moved: boolean } | null>(null);

  const paths = worldPaths as WorldPath[];
  const selectedGeoId = useMemo(
    () => (selectedAlpha3 ? ALPHA3_TO_GEO_ID[selectedAlpha3] || "" : ""),
    [selectedAlpha3],
  );

  const clampView = (next: { scale: number; x: number; y: number }) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    const maxPan = 400 * (scale - 1);
    return {
      scale,
      x: Math.min(maxPan, Math.max(-maxPan, next.x)),
      y: Math.min(maxPan / 2, Math.max(-maxPan / 2, next.y)),
    };
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const list = [...pointers.current.values()];
    gesture.current = {
      start: { ...view },
      origin: list.length >= 2
        ? { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 }
        : { x: event.clientX, y: event.clientY },
      distance: list.length >= 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const list = [...pointers.current.values()];
    const active = gesture.current;

    if (list.length >= 2) {
      const distance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      if (active.distance > 0) {
        const ratio = distance / active.distance;
        if (Math.abs(ratio - 1) > 0.02) active.moved = true;
        setView(clampView({ scale: active.start.scale * ratio, x: active.start.x, y: active.start.y }));
      }
      return;
    }

    const dx = event.clientX - active.origin.x;
    const dy = event.clientY - active.origin.y;
    if (Math.hypot(dx, dy) > 6) active.moved = true;
    setView(clampView({ scale: active.start.scale, x: active.start.x + dx, y: active.start.y + dy }));
  };

  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (!pointers.current.size) {
      window.setTimeout(() => { gesture.current = null; }, 0);
    }
  };

  const tapCountry = (geoId: string) => {
    if (gesture.current?.moved) return; // sürükleme/pinch dokunma sayılmaz
    const alpha3 = GEO_TO_ALPHA3[geoId];
    if (alpha3) onSelectCountry(alpha3);
  };

  const zoomBy = (factor: number) => setView((current) => clampView({ ...current, scale: current.scale * factor }));

  return (
    <div className="passport-map" aria-label="Vize durumuna göre renklendirilmiş dünya haritası">
      <svg
        viewBox="0 0 800 400"
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerEnd}
      >
        <g transform={`translate(${400 + view.x} ${200 + view.y}) scale(${view.scale}) translate(-400 -200)`}>
          {paths.map((country) => {
            const alpha3 = GEO_TO_ALPHA3[country.id] || null;
            const status = statusFor(alpha3);
            const highlighted = isHighlighted(alpha3);
            const isSelected = Boolean(selectedGeoId) && country.id === selectedGeoId;
            return (
              <path
                key={country.id}
                d={country.d}
                fill={STATUS_FILL[status]}
                fillOpacity={highlighted ? (status === "unknown" ? 0.55 : 0.92) : 0.16}
                stroke={isSelected ? "#071B33" : "#FFFFFF"}
                strokeWidth={isSelected ? 1.6 / view.scale : 0.4 / view.scale}
                onPointerUp={() => tapCountry(country.id)}
              />
            );
          })}
        </g>
      </svg>
      <div className="passport-map-controls" aria-hidden={false}>
        <button type="button" aria-label="Yakınlaştır" onClick={() => zoomBy(1.5)}>+</button>
        <button type="button" aria-label="Uzaklaştır" onClick={() => zoomBy(1 / 1.5)}>−</button>
        {view.scale > 1.01 && <button type="button" aria-label="Haritayı sıfırla" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>⟲</button>}
      </div>
    </div>
  );
}
