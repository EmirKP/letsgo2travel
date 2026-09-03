import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import worldPaths from "../data/worldMapPaths.json";
import { ALPHA3_TO_GEO_ID } from "../data/countryCodes";
import { Icon } from "./Icon";
import type { VisaStatus } from "../types";

// Geometri build sırasında üretilir; çalışma anında ağ isteği veya ağır
// harita kütüphanesi yoktur. Etkileşimler SVG koordinatında hesaplanır:
// farklı ekran yoğunluklarında pan/pinch aynı hız ve odakla çalışır.

type WorldPath = { id: string; name: string; d: string };
type Point = { x: number; y: number };
type View = { scale: number; x: number; y: number };

export type MapStatus = VisaStatus | "unknown";

const STATUS_FILL: Record<MapStatus, string> = {
  id_card: "#3A9ED4",
  free: "#39A982",
  evisa: "#7966C8",
  on_arrival: "#DDA638",
  required: "#D66A73",
  unknown: "#BBC8D3",
};

const GEO_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_TO_GEO_ID).map(([alpha3, geoId]) => [geoId, alpha3]),
);

const CENTER = { x: 400, y: 200 };
const MIN_SCALE = 1;
const MAX_SCALE = 16;

function clampView(next: View): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
  const maxPanX = CENTER.x * (scale - 1);
  const maxPanY = CENTER.y * (scale - 1);
  return {
    scale,
    x: Math.min(maxPanX, Math.max(-maxPanX, next.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, next.y)),
  };
}

type PassportWorldMapProps = {
  statusFor: (alpha3: string | null) => MapStatus;
  isHighlighted: (alpha3: string | null) => boolean;
  selectedAlpha3: string | null;
  onSelectCountry: (alpha3: string) => void;
};

type Gesture = {
  start: View;
  origin: Point;
  distance: number;
  moved: boolean;
};

export function PassportWorldMap({ statusFor, isHighlighted, selectedAlpha3, onSelectCountry }: PassportWorldMapProps) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(view);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const pathRefs = useRef(new Map<string, SVGPathElement>());

  const paths = worldPaths as WorldPath[];
  const selectedGeoId = useMemo(
    () => (selectedAlpha3 ? ALPHA3_TO_GEO_ID[selectedAlpha3] || "" : ""),
    [selectedAlpha3],
  );

  const commitView = useCallback((next: View) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    setView(clamped);
  }, []);

  const svgPoint = useCallback((clientX: number, clientY: number): Point => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return { x: CENTER.x, y: CENTER.y };
    return {
      x: (clientX - bounds.left) * (800 / bounds.width),
      y: (clientY - bounds.top) * (400 / bounds.height),
    };
  }, []);

  const beginGesture = useCallback(() => {
    const list = [...pointers.current.values()];
    if (!list.length) {
      gesture.current = null;
      return;
    }
    const origin = list.length >= 2
      ? { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 }
      : list[0];
    gesture.current = {
      start: { ...viewRef.current },
      origin,
      distance: list.length >= 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0,
      moved: false,
    };
  }, []);

  const zoomAt = useCallback((requestedScale: number, focus: Point = CENTER) => {
    const current = viewRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, requestedScale));
    const ratio = scale / current.scale;
    commitView({
      scale,
      x: focus.x - CENTER.x - ratio * (focus.x - CENTER.x - current.x),
      y: focus.y - CENTER.y - ratio * (focus.y - CENTER.y - current.y),
    });
  }, [commitView]);

  const focusCountry = useCallback((geoId: string) => {
    const path = pathRefs.current.get(geoId);
    if (!path) return;
    try {
      const bounds = path.getBBox();
      const scale = Math.min(11, Math.max(2.5, Math.min(660 / Math.max(20, bounds.width), 310 / Math.max(14, bounds.height))));
      const countryCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      commitView({
        scale,
        x: scale * (CENTER.x - countryCenter.x),
        y: scale * (CENTER.y - countryCenter.y),
      });
    } catch {
      // SVG ölçümü desteklenmiyorsa ülke detayı yine açılır.
    }
  }, [commitView]);

  useEffect(() => {
    if (selectedGeoId) focusCountry(selectedGeoId);
  }, [focusCountry, selectedGeoId]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, svgPoint(event.clientX, event.clientY));
    beginGesture();
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, svgPoint(event.clientX, event.clientY));
    const list = [...pointers.current.values()];
    const active = gesture.current;

    if (list.length >= 2) {
      const currentOrigin = { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 };
      const distance = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      if (active.distance > 0) {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, active.start.scale * (distance / active.distance)));
        const ratio = scale / active.start.scale;
        if (Math.abs(distance - active.distance) > 3 || Math.hypot(currentOrigin.x - active.origin.x, currentOrigin.y - active.origin.y) > 3) active.moved = true;
        commitView({
          scale,
          x: currentOrigin.x - CENTER.x - ratio * (active.origin.x - CENTER.x - active.start.x),
          y: currentOrigin.y - CENTER.y - ratio * (active.origin.y - CENTER.y - active.start.y),
        });
      }
      return;
    }

    const point = list[0];
    if (!point) return;
    const dx = point.x - active.origin.x;
    const dy = point.y - active.origin.y;
    if (Math.hypot(dx, dy) > 5) active.moved = true;
    commitView({ scale: active.start.scale, x: active.start.x + dx, y: active.start.y + dy });
  };

  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) beginGesture();
    else {
      // Path'in onPointerUp olayı önce çalışıp SVG'ye bubble eder; bu
      // noktada dokunma seçimi tamamlandığı için gesture güvenle kapanır.
      gesture.current = null;
      setDragging(false);
    }
  };

  const tapCountry = (geoId: string) => {
    if (gesture.current?.moved) return;
    const alpha3 = GEO_TO_ALPHA3[geoId];
    if (!alpha3) return;
    focusCountry(geoId);
    onSelectCountry(alpha3);
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomAt(viewRef.current.scale * (event.deltaY < 0 ? 1.28 : 1 / 1.28), svgPoint(event.clientX, event.clientY));
  };

  const reset = () => commitView({ scale: 1, x: 0, y: 0 });

  return (
    <div className={`passport-map ${dragging ? "dragging" : ""}`} data-no-gesture aria-label="Vize durumuna göre renklendirilmiş dünya haritası">
      <div className="passport-map-toolbar" aria-hidden="true">
        <span><Icon name="globe" size={16} /> Sürükle · iki parmakla yakınlaştır</span>
        <output>{view.scale.toFixed(view.scale < 10 ? 1 : 0)}×</output>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        role="img"
        aria-label="Etkileşimli pasaport gücü dünya haritası"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      >
        <g transform={`translate(${CENTER.x + view.x} ${CENTER.y + view.y}) scale(${view.scale}) translate(${-CENTER.x} ${-CENTER.y})`}>
          {paths.map((country) => {
            const alpha3 = GEO_TO_ALPHA3[country.id] || null;
            const status = statusFor(alpha3);
            const highlighted = isHighlighted(alpha3);
            const isSelected = Boolean(selectedGeoId) && country.id === selectedGeoId;
            return (
              <path
                ref={(node) => {
                  if (node) pathRefs.current.set(country.id, node);
                  else pathRefs.current.delete(country.id);
                }}
                key={country.id}
                d={country.d}
                fill={STATUS_FILL[status]}
                fillOpacity={highlighted ? (status === "unknown" ? 0.68 : 0.94) : 0.12}
                stroke={isSelected ? "#071B33" : "rgba(255,255,255,.92)"}
                strokeWidth={isSelected ? 2.2 / view.scale : 0.65 / view.scale}
                onPointerUp={() => tapCountry(country.id)}
              />
            );
          })}
        </g>
      </svg>
      <div className="passport-map-controls">
        <button type="button" aria-label="Yakınlaştır" disabled={view.scale >= MAX_SCALE - .01} onClick={() => zoomAt(viewRef.current.scale * 1.7)}>+</button>
        <button type="button" aria-label="Uzaklaştır" disabled={view.scale <= MIN_SCALE + .01} onClick={() => zoomAt(viewRef.current.scale / 1.7)}>−</button>
        <button type="button" className="map-reset" aria-label="Haritayı sıfırla" disabled={view.scale <= 1.01 && Math.abs(view.x) < 1 && Math.abs(view.y) < 1} onClick={reset}><Icon name="refresh" size={17} /></button>
      </div>
    </div>
  );
}
