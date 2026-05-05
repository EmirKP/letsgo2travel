"use client";

import { useEffect, useRef } from "react";

export default function TravelpayoutsWidget() {
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetRef.current) return;

    widgetRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.async = true;
    script.charset = "utf-8";
    script.src =
      "https://tpemd.com/content?currency=try&trs=525614&shmarker=725223.letsgo2travel_widget&show_hotels=true&powered_by=true&locale=tr&searchUrl=search.jetradar.com&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100";

    widgetRef.current.appendChild(script);
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">
        Ucuz Uçak Bileti Ara
      </h2>

      <div ref={widgetRef} />
    </section>
  );
}