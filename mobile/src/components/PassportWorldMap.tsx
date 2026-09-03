import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import worldPaths from "../data/worldMapPaths.json";
import { ALPHA3_TO_GEO_ID } from "../data/countryCodes";
import { Icon } from "./Icon";
import type { VisaStatus } from "../types";
import { useI18n } from "../lib/i18n";

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
const WORLD_PATHS = worldPaths as WorldPath[];

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

type WorldCountriesProps = {
  isHighlighted: PassportWorldMapProps["isHighlighted"];
  pathRefs: React.MutableRefObject<Map<string, SVGPathElement>>;
  selectedGeoId: string;
  statusFor: PassportWorldMapProps["statusFor"];
};

// Pan ve pinch sırasında yalnız <g> dönüşümü değişir. Ülke geometrilerini
// ayrı memo katmanında tutmak, yüzlerce SVG path'inin her parmak hareketinde
// React tarafından yeniden oluşturulmasını engeller.
const WorldCountries = memo(function WorldCountries({
  isHighlighted,
  pathRefs,
  selectedGeoId,
  statusFor,
}: WorldCountriesProps) {
  return WORLD_PATHS.map((country) => {
    const alpha3 = GEO_TO_ALPHA3[country.id] || null;
    const status = statusFor(alpha3);
    const highlighted = isHighlighted(alpha3);
    const isSelected = Boolean(selectedGeoId) && country.id === selectedGeoId;
    return (
      <path
        aria-hidden="true"
        ref={(node) => {
          if (node) pathRefs.current.set(country.id, node);
          else pathRefs.current.delete(country.id);
        }}
        key={country.id}
        d={country.d}
        fill={STATUS_FILL[status]}
        fillOpacity={highlighted ? (status === "unknown" ? 0.68 : 0.94) : 0.12}
        stroke={isSelected ? "#071B33" : "rgba(255,255,255,.92)"}
        strokeWidth={isSelected ? 2.2 : 0.65}
        vectorEffect="non-scaling-stroke"
        data-country-id={country.id}
      />
    );
  });
});

export function PassportWorldMap({ statusFor, isHighlighted, selectedAlpha3, onSelectCountry }: PassportWorldMapProps) {
  const { copy } = useI18n();
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(view);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const pointerCountries = useRef(new Map<number, string>());
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  const pendingView = useRef<View | null>(null);
  const viewFrame = useRef<number | null>(null);
  const selectedGeoId = useMemo(
    () => (selectedAlpha3 ? ALPHA3_TO_GEO_ID[selectedAlpha3] || "" : ""),
    [selectedAlpha3],
  );

  const commitView = useCallback((next: View) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    pendingView.current = clamped;
    if (viewFrame.current !== null) return;
    viewFrame.current = window.requestAnimationFrame(() => {
      viewFrame.current = null;
      if (pendingView.current) setView(pendingView.current);
    });
  }, []);

  useEffect(() => () => {
    if (viewFrame.current !== null) window.cancelAnimationFrame(viewFrame.current);
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
    const target = event.target instanceof SVGPathElement ? event.target : null;
    pointerCountries.current.set(event.pointerId, target?.dataset.countryId || "");
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

  const tapCountry = useCallback((geoId: string) => {
    const alpha3 = GEO_TO_ALPHA3[geoId];
    if (!alpha3) return;
    focusCountry(geoId);
    onSelectCountry(alpha3);
  }, [focusCountry, onSelectCountry]);

  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>, allowTap = true) => {
    // Pointer capture nedeniyle pointerup hedefi SVG'ye dönüşebilir. Ülkeyi
    // pointerdown anında sakla ve yalnız tek parmak hareket etmediyse seç.
    const candidate = pointerCountries.current.get(event.pointerId) || "";
    const shouldTap = allowTap && pointers.current.size === 1 && !gesture.current?.moved && Boolean(candidate);
    pointerCountries.current.delete(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (shouldTap) tapCountry(candidate);
    if (pointers.current.size) beginGesture();
    else {
      gesture.current = null;
      setDragging(false);
    }
  };

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    zoomAt(viewRef.current.scale * (event.deltaY < 0 ? 1.28 : 1 / 1.28), svgPoint(event.clientX, event.clientY));
  };

  const reset = () => commitView({ scale: 1, x: 0, y: 0 });

  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const current = viewRef.current;
    const panStep = Math.max(18, 54 / current.scale);

    switch (event.key) {
      case "ArrowLeft":
        commitView({ ...current, x: current.x + panStep });
        break;
      case "ArrowRight":
        commitView({ ...current, x: current.x - panStep });
        break;
      case "ArrowUp":
        commitView({ ...current, y: current.y + panStep });
        break;
      case "ArrowDown":
        commitView({ ...current, y: current.y - panStep });
        break;
      case "+":
      case "=":
        zoomAt(current.scale * 1.35);
        break;
      case "-":
      case "_":
        zoomAt(current.scale / 1.35);
        break;
      case "0":
      case "Home":
        reset();
        break;
      default:
        return;
    }

    event.preventDefault();
  };

  return (
    <div
      className={`passport-map ${dragging ? "dragging" : ""}`}
      data-no-gesture
      role="region"
      aria-label={copy("Vize durumuna göre renklendirilmiş dünya haritası", "World map coloured by visa status")}
      aria-describedby="passport-map-help"
    >
      <div className="passport-map-toolbar" aria-hidden="true">
        <output>{view.scale.toFixed(view.scale < 10 ? 1 : 0)}×</output>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 800 400"
        role="group"
        tabIndex={0}
        aria-label={copy("Etkileşimli harita alanı", "Interactive map area")}
        aria-describedby="passport-map-help passport-map-keyboard-help"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - Home"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerEnd(event)}
        onPointerCancel={(event) => onPointerEnd(event, false)}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        <title>{copy("Türkiye pasaportu vize haritası", "Turkish passport visa map")}</title>
        <desc>{copy("Renkler ülkelerin giriş koşullarını gösterir. Ülke ayrıntısına erişmek için aşağıdaki arama ve ülke listesi de kullanılabilir.", "Colours show entry requirements. You can also use the search and country list below to open country details.")}</desc>
        <g transform={`translate(${CENTER.x + view.x} ${CENTER.y + view.y}) scale(${view.scale}) translate(${-CENTER.x} ${-CENTER.y})`}>
          <WorldCountries
            isHighlighted={isHighlighted}
            pathRefs={pathRefs}
            selectedGeoId={selectedGeoId}
            statusFor={statusFor}
          />
        </g>
      </svg>
      <div className="passport-map-controls">
        <button type="button" aria-label={copy("Haritayı yakınlaştır", "Zoom in")} aria-keyshortcuts="+" disabled={view.scale >= MAX_SCALE - .01} onClick={() => zoomAt(viewRef.current.scale * 1.7)}>+</button>
        <button type="button" aria-label={copy("Haritayı uzaklaştır", "Zoom out")} aria-keyshortcuts="-" disabled={view.scale <= MIN_SCALE + .01} onClick={() => zoomAt(viewRef.current.scale / 1.7)}>−</button>
        <button type="button" className="map-reset" aria-label={copy("Haritayı başlangıç görünümüne döndür", "Reset map view")} aria-keyshortcuts="Home" disabled={view.scale <= 1.01 && Math.abs(view.x) < 1 && Math.abs(view.y) < 1} onClick={reset}><Icon name="refresh" size={17} /></button>
      </div>
    </div>
  );
}
