"use client";

import { useEffect } from "react";

export default function TravelpayoutsDrive() {
  useEffect(() => {
    const scriptId = "travelpayouts-drive-script";

    if (document.getElementById(scriptId)) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.src = "https://emrldtp.cc/NTI1NjE0.js?t=525614";

    script.setAttribute("nowprocket", "");
    script.setAttribute("data-noptimize", "1");
    script.setAttribute("data-cfasync", "false");
    script.setAttribute("data-wpfc-render", "false");
    script.setAttribute("seraph-accel-crit", "1");
    script.setAttribute("data-no-defer", "1");

    document.head.appendChild(script);

    return () => {
      const existingScript = document.getElementById(scriptId);
      existingScript?.remove();
    };
  }, []);

  return null;
}