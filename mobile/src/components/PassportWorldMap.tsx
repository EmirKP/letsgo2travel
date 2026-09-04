import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import worldPaths from "../data/worldMapPaths.json";
import kosovoFlag from "../assets/flags/kosovo.svg";
import { Icon } from "./Icon";
import { ALPHA3_TO_GEO_ID } from "../data/countryCodes";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import type { VisaStatus } from "../types";
import { useI18n } from "../lib/i18n";

type WorldPath = { id: string; name: string; d: string; x: number | null; y: number | null; area: number };
type MapTransform = { scale: number; x: number; y: number };
type TouchPoint = { x: number; y: number };

export type MapStatus = VisaStatus | "unknown";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STATUS_FILL: Record<MapStatus, string> = {
  id_card: "#397FD1",
  free: "#28A47B",
  evisa: "#745FC5",
  on_arrival: "#DCA936",
  required: "#D76472",
  unknown: "#D6DCE5",
};
const PINNED_FLAGS = new Set(["USA", "CAN", "BRA", "ARG", "GBR", "FRA", "DEU", "TUR", "RUS", "CHN", "IND", "JPN", "AUS", "ZAF", "EGY", "SAU", "ARE", "IDN", "XKK"]);

const GEO_TO_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_TO_GEO_ID).filter(([alpha3]) => alpha3 !== "XKK").map(([alpha3, geoId]) => [geoId, alpha3]),
);
const WORLD_PATHS = worldPaths as WorldPath[];

function alpha3ForCountry(country: WorldPath): string | null {
  if (country.name === "Kosovo") return "XKK";
  // Natural Earth, resmî ISO kodu olmayan üç bölgeyi 000 ile verir.
  // Yalnız Kosova yukarıda açıkça eşlenir; diğerleri Kosova sanılmaz.
  if (country.id === "000") return null;
  return GEO_TO_ALPHA3[country.id] || null;
}

function distance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type PassportWorldMapProps = {
  statusFor: (alpha3: string | null) => MapStatus;
  isHighlighted: (alpha3: string | null) => boolean;
  selectedAlpha3: string | null;
  onSelectCountry: (alpha3: string) => void;
};

type WorldCountriesProps = Pick<PassportWorldMapProps, "isHighlighted" | "selectedAlpha3" | "statusFor">;

const WorldCountries = memo(function WorldCountries({ isHighlighted, selectedAlpha3, statusFor }: WorldCountriesProps) {
  return WORLD_PATHS.map((country) => {
    const alpha3 = alpha3ForCountry(country);
    const status = statusFor(alpha3);
    const highlighted = isHighlighted(alpha3);
    const isSelected = Boolean(alpha3) && alpha3 === selectedAlpha3;
    return <path
      aria-hidden="true"
      key={`${country.id}-${country.name}`}
      d={country.d}
      fill={STATUS_FILL[status]}
      fillOpacity={highlighted ? (status === "unknown" ? 0.68 : 0.94) : 0.12}
      stroke={isSelected ? "#111111" : "rgba(255,255,255,.94)"}
      strokeWidth={isSelected ? 2.2 : 0.65}
      vectorEffect="non-scaling-stroke"
      data-country-alpha3={alpha3 || undefined}
    />;
  });
});

export function PassportWorldMap({ statusFor, isHighlighted, selectedAlpha3, onSelectCountry }: PassportWorldMapProps) {
  const { copy } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<MapTransform>({ scale: 1, x: 0, y: 0 });
  const gestureRef = useRef<{ distance: number; midpoint: TouchPoint; transform: MapTransform } | null>(null);
  const singleTouchRef = useRef<{ point: TouchPoint; transform: MapTransform } | null>(null);
  const mouseRef = useRef<{ point: TouchPoint; transform: MapTransform } | null>(null);
  const suppressClickRef = useRef(false);
  const [transform, setTransform] = useState<MapTransform>({ scale: 1, x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 400 });

  const commitTransform = (next: MapTransform) => {
    const viewport = viewportRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (!viewport || scale === MIN_SCALE) {
      const reset = { scale, x: 0, y: 0 };
      transformRef.current = reset;
      setTransform(reset);
      return;
    }
    const maxX = viewport.clientWidth * (scale - 1) / 2;
    const maxY = viewport.clientHeight * (scale - 1) / 2;
    const bounded = { scale, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
    transformRef.current = bounded;
    setTransform(bounded);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const point = (touch: Touch) => ({ x: touch.clientX, y: touch.clientY });
    const start = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        event.preventDefault();
        const first = point(event.touches[0]);
        const second = point(event.touches[1]);
        gestureRef.current = { distance: distance(first, second), midpoint: midpoint(first, second), transform: transformRef.current };
        singleTouchRef.current = null;
      } else if (event.touches.length === 1 && transformRef.current.scale > 1) {
        singleTouchRef.current = { point: point(event.touches[0]), transform: transformRef.current };
      }
    };
    const move = (event: TouchEvent) => {
      const rect = viewport.getBoundingClientRect();
      if (event.touches.length >= 2) {
        event.preventDefault();
        const first = point(event.touches[0]);
        const second = point(event.touches[1]);
        const currentMidpoint = midpoint(first, second);
        const gesture = gestureRef.current;
        if (!gesture) return;
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.transform.scale * distance(first, second) / Math.max(1, gesture.distance)));
        const startLocalX = gesture.midpoint.x - rect.left - rect.width / 2 - gesture.transform.x;
        const startLocalY = gesture.midpoint.y - rect.top - rect.height / 2 - gesture.transform.y;
        commitTransform({
          scale: nextScale,
          x: currentMidpoint.x - rect.left - rect.width / 2 - startLocalX * nextScale / gesture.transform.scale,
          y: currentMidpoint.y - rect.top - rect.height / 2 - startLocalY * nextScale / gesture.transform.scale,
        });
        suppressClickRef.current = true;
      } else if (event.touches.length === 1 && transformRef.current.scale > 1 && singleTouchRef.current) {
        event.preventDefault();
        const current = point(event.touches[0]);
        const origin = singleTouchRef.current;
        if (Math.hypot(current.x - origin.point.x, current.y - origin.point.y) > 4) suppressClickRef.current = true;
        commitTransform({ ...origin.transform, x: origin.transform.x + current.x - origin.point.x, y: origin.transform.y + current.y - origin.point.y });
      }
    };
    const end = (event: TouchEvent) => {
      gestureRef.current = null;
      singleTouchRef.current = event.touches.length === 1 && transformRef.current.scale > 1
        ? { point: point(event.touches[0]), transform: transformRef.current }
        : null;
      window.setTimeout(() => { suppressClickRef.current = false; }, 120);
    };
    viewport.addEventListener("touchstart", start, { passive: false });
    viewport.addEventListener("touchmove", move, { passive: false });
    viewport.addEventListener("touchend", end, { passive: true });
    viewport.addEventListener("touchcancel", end, { passive: true });
    return () => {
      viewport.removeEventListener("touchstart", start);
      viewport.removeEventListener("touchmove", move);
      viewport.removeEventListener("touchend", end);
      viewport.removeEventListener("touchcancel", end);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    document.body.classList.add("passport-map-open");
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.classList.remove("passport-map-open");
      window.removeEventListener("keydown", close);
    };
  }, [fullscreen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      setViewportSize((current) => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const flags = useMemo(() => WORLD_PATHS.flatMap((country) => {
    const alpha3 = alpha3ForCountry(country);
    if (!alpha3 || country.x === null || country.y === null) return [];
    const alpha2 = alpha2FromAlpha3(alpha3);
    if (!alpha2) return [];
    const level = PINNED_FLAGS.has(alpha3) || country.area >= 430 ? 1 : country.area >= 70 ? 2 : 3;
    return [{ ...country, alpha3, alpha2, level }];
  }), []);

  const selectCountry = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (suppressClickRef.current) return;
    const target = event.target instanceof Element ? event.target.closest<SVGElement>("[data-country-alpha3]") : null;
    const alpha3 = target?.dataset.countryAlpha3 || "";
    if (alpha3) onSelectCountry(alpha3);
  };

  const mouseDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || transform.scale <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    mouseRef.current = { point: { x: event.clientX, y: event.clientY }, transform };
  };
  const mouseMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = mouseRef.current;
    if (!origin || event.pointerType !== "mouse") return;
    if (Math.hypot(event.clientX - origin.point.x, event.clientY - origin.point.y) > 4) suppressClickRef.current = true;
    commitTransform({ ...origin.transform, x: origin.transform.x + event.clientX - origin.point.x, y: origin.transform.y + event.clientY - origin.point.y });
  };
  const mouseUp = () => {
    mouseRef.current = null;
    window.setTimeout(() => { suppressClickRef.current = false; }, 80);
  };
  const zoom = (delta: number) => commitTransform({ ...transformRef.current, scale: transformRef.current.scale + delta });
  const translateX = transform.x * 800 / viewportSize.width;
  const translateY = transform.y * 400 / viewportSize.height;
  const groupTransform = `translate(${400 + translateX} ${200 + translateY}) scale(${transform.scale}) translate(-400 -200)`;

  return <div className={`passport-map ${fullscreen ? "fullscreen" : ""}`} data-no-gesture role={fullscreen ? "dialog" : "region"} aria-modal={fullscreen || undefined} aria-label={copy("Vize durumuna göre renklendirilmiş, yakınlaştırılabilir dünya haritası", "Zoomable world map coloured by visa status")} aria-describedby="passport-map-help">
    <div ref={viewportRef} className={`passport-map-viewport ${transform.scale > 1 ? "zoomed" : ""}`} onPointerDown={mouseDown} onPointerMove={mouseMove} onPointerUp={mouseUp} onPointerCancel={mouseUp}>
      <svg
        viewBox="0 0 800 400"
        role="img"
        aria-label={copy("İki parmakla yakınlaştırıp sürükleyebileceğin dünya haritası", "World map you can pinch to zoom and drag")}
        aria-describedby="passport-map-help"
        onClick={selectCountry}
      >
        <title>{copy("Türkiye pasaportu vize haritası", "Turkish passport visa map")}</title>
        <desc>{copy("Renkler giriş koşullarını gösterir. Haritayı iki parmakla yakınlaştırabilir, sürükleyebilir ve ülkeye dokunabilirsin.", "Colours show entry requirements. Pinch to zoom, drag the map and tap a country.")}</desc>
        <rect width="800" height="400" fill="#F4F8FD" />
        <g transform={groupTransform}>
          <WorldCountries isHighlighted={isHighlighted} selectedAlpha3={selectedAlpha3} statusFor={statusFor} />
        </g>
        <g className={`passport-map-flags flag-level-${transform.scale >= 4.25 ? 3 : transform.scale >= 2.25 ? 2 : 1}`} aria-hidden="true">
          {flags.map((country) => {
            const x = 400 + ((country.x || 0) - 400) * transform.scale + translateX;
            const y = 200 + ((country.y || 0) - 200) * transform.scale + translateY;
            return country.alpha3 === "XKK" ? <image
              key={`flag-${country.id}-${country.name}`}
              href={kosovoFlag}
              x={x - 11}
              y={y - 8}
              width={22}
              height={16}
              className={`passport-map-flag passport-map-kosovo-flag map-flag-level-${country.level} ${selectedAlpha3 === country.alpha3 ? "selected" : ""}`}
              data-country-alpha3={country.alpha3}
              preserveAspectRatio="xMidYMid meet"
            />
            : <text
              key={`flag-${country.id}-${country.name}`}
              x={x}
              y={y}
              className={`passport-map-flag map-flag-level-${country.level} ${selectedAlpha3 === country.alpha3 ? "selected" : ""}`}
              fontSize={19}
              data-country-alpha3={country.alpha3}
            >{flagEmoji(country.alpha2)}</text>;
          })}
        </g>
      </svg>
    </div>
    <div className="passport-map-controls" aria-label={copy("Harita yakınlaştırma kontrolleri", "Map zoom controls")}>
      <button type="button" disabled={transform.scale >= MAX_SCALE} onClick={() => zoom(1)} aria-label={copy("Haritayı yakınlaştır", "Zoom map in")}>+</button>
      <button type="button" disabled={transform.scale <= MIN_SCALE} onClick={() => zoom(-1)} aria-label={copy("Haritayı uzaklaştır", "Zoom map out")}>−</button>
      <button type="button" onClick={() => { commitTransform({ scale: 1, x: 0, y: 0 }); setFullscreen((value) => !value); }} aria-pressed={fullscreen} aria-label={fullscreen ? copy("Tam ekrandan çık", "Exit full screen") : copy("Haritayı tam ekran aç", "Open map full screen")}><span className="sr-only">{fullscreen ? copy("Tam ekrandan çık", "Exit full screen") : copy("Tam ekran", "Full screen")}</span><Icon name={fullscreen ? "close" : "expand"} size={19} /></button>
      <button type="button" className="passport-map-reset" disabled={transform.scale <= MIN_SCALE} onClick={() => commitTransform({ scale: 1, x: 0, y: 0 })}>{copy("Sıfırla", "Reset")}</button>
    </div>
    <output className="sr-only" aria-live="polite">{copy(`Harita yüzde ${Math.round(transform.scale * 100)} yakınlıkta`, `Map zoom ${Math.round(transform.scale * 100)} percent`)}</output>
  </div>;
}
