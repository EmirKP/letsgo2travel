"use client";

import React, { memo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker
} from "react-simple-maps";
import { Plane, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// We can map some country ISO strings to our database slugs or data
const highlights: Record<string, { name: string; slug: string; price: string; visa: string; coords: [number, number] }> = {
  "688": { name: "Sırbistan", slug: "sirbistan", price: "1.200 TL", visa: "Vizesiz", coords: [20.4489, 44.7866] },
  "268": { name: "Gürcistan", slug: "gurcistan", price: "1.600 TL", visa: "Kimlikle", coords: [43.3569, 42.3154] },
  "031": { name: "Azerbaycan", slug: "azerbaycan", price: "1.800 TL", visa: "Kimlikle", coords: [47.5769, 40.1431] },
  "784": { name: "Dubai (BAE)", slug: "dubai-bae", price: "2.400 TL", visa: "E-Vize", coords: [55.2708, 25.2048] },
  "380": { name: "İtalya", slug: "italya", price: "2.900 TL", visa: "Schengen", coords: [12.5674, 41.8719] },
  "499": { name: "Karadağ", slug: "karadag", price: "1.500 TL", visa: "Vizesiz", coords: [19.2594, 42.7087] },
};

const MapChart = ({ setTooltipContent }: { setTooltipContent: (c: string) => void }) => {
  const router = useRouter();

  return (
    <ComposableMap
      projectionConfig={{
        rotate: [-10, 0, 0],
        scale: 160
      }}
      width={800}
      height={400}
      style={{ width: "100%", height: "100%" }}
    >
      <ZoomableGroup zoom={1} minZoom={1} maxZoom={4} translateExtent={[[-100, -100], [900, 500]]}>
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const countryCode = geo.id; // ISO code
              const isHighlighted = highlights[countryCode];

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => {
                    if (isHighlighted) {
                      router.push(`/ulke-rehberi/${isHighlighted.slug}`);
                    }
                  }}
                  onMouseEnter={() => {
                    if (isHighlighted) {
                      setTooltipContent(countryCode);
                    }
                  }}
                  onMouseLeave={() => {
                    setTooltipContent("");
                  }}
                  style={{
                    default: {
                      fill: isHighlighted ? "rgba(20, 118, 242, 0.4)" : "rgba(255, 255, 255, 0.05)",
                      stroke: "rgba(255, 255, 255, 0.15)",
                      strokeWidth: 0.5,
                      outline: "none",
                      transition: "all 0.3s"
                    },
                    hover: {
                      fill: isHighlighted ? "rgba(255, 209, 92, 0.8)" : "rgba(255, 255, 255, 0.1)",
                      stroke: "rgba(255, 255, 255, 0.3)",
                      strokeWidth: 1,
                      outline: "none",
                      cursor: isHighlighted ? "pointer" : "default"
                    },
                    pressed: {
                      fill: "rgba(255, 209, 92, 1)",
                      outline: "none",
                    }
                  }}
                />
              );
            })
          }
        </Geographies>

        {/* Pin Markers */}
        {Object.entries(highlights).map(([iso, data]) => (
          <Marker key={iso} coordinates={data.coords}>
            <circle r={3} fill="#FFD15C" />
          </Marker>
        ))}
      </ZoomableGroup>
    </ComposableMap>
  );
};

export default memo(MapChart);
export { highlights };
