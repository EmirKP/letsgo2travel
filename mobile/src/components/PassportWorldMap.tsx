import { memo, type MouseEvent as ReactMouseEvent } from "react";
import worldPaths from "../data/worldMapPaths.json";
import { ALPHA3_TO_GEO_ID } from "../data/countryCodes";
import type { VisaStatus } from "../types";
import { useI18n } from "../lib/i18n";

// Geometri build sırasında üretilir; çalışma anında ağ isteği veya ağır
// harita kütüphanesi yoktur. Harita sabittir: ülkeye tek dokunuş ayrıntıyı
// açar, uygulama görünümünü büyüten pan/pinch/zoom davranışı bulunmaz.

type WorldPath = { id: string; name: string; d: string };

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

type PassportWorldMapProps = {
  statusFor: (alpha3: string | null) => MapStatus;
  isHighlighted: (alpha3: string | null) => boolean;
  selectedAlpha3: string | null;
  onSelectCountry: (alpha3: string) => void;
};

type WorldCountriesProps = {
  isHighlighted: PassportWorldMapProps["isHighlighted"];
  selectedGeoId: string;
  statusFor: PassportWorldMapProps["statusFor"];
};

// Arama/filtre değişmediği sürece yüzlerce SVG path'i yeniden üretilmez.
const WorldCountries = memo(function WorldCountries({
  isHighlighted,
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
  const selectedGeoId = selectedAlpha3 ? ALPHA3_TO_GEO_ID[selectedAlpha3] || "" : "";

  const selectCountry = (event: ReactMouseEvent<SVGSVGElement>) => {
    const target = event.target instanceof SVGPathElement ? event.target : null;
    const alpha3 = target?.dataset.countryId ? GEO_TO_ALPHA3[target.dataset.countryId] : "";
    if (alpha3) onSelectCountry(alpha3);
  };

  return (
    <div
      className="passport-map"
      data-no-gesture
      role="region"
      aria-label={copy("Vize durumuna göre renklendirilmiş dünya haritası", "World map coloured by visa status")}
      aria-describedby="passport-map-help"
    >
      <svg
        viewBox="0 0 800 400"
        role="img"
        aria-label={copy("Bir ülkeye dokunarak ayrıntısını açabileceğin dünya haritası", "World map where tapping a country opens its details")}
        aria-describedby="passport-map-help"
        onClick={selectCountry}
      >
        <title>{copy("Türkiye pasaportu vize haritası", "Turkish passport visa map")}</title>
        <desc>{copy("Renkler ülkelerin giriş koşullarını gösterir. Ülke ayrıntısına erişmek için haritaya dokunabilir veya aşağıdaki ülke listesini kullanabilirsin.", "Colours show entry requirements. Tap the map or use the country list below to open country details.")}</desc>
        <WorldCountries
          isHighlighted={isHighlighted}
          selectedGeoId={selectedGeoId}
          statusFor={statusFor}
        />
      </svg>
    </div>
  );
}
