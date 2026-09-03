import { useEffect, useState } from "react";
import appIcon from "../assets/splash-mark.webp";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const leaveTimer = window.setTimeout(() => setLeaving(true), reducedMotion ? 40 : 680);
    const finishTimer = window.setTimeout(onFinish, reducedMotion ? 120 : 900);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div className={`animated-splash ${leaving ? "leaving" : ""}`} role="status" aria-label="LetsGo2Travel açılıyor">
      <div className="animated-splash-glow" aria-hidden="true" />
      <div className="animated-splash-logo">
        <span className="animated-splash-ring" aria-hidden="true" />
        <img src={appIcon} alt="" />
      </div>
      <div className="animated-splash-brand" aria-hidden="true">LetsGo<strong>2</strong>Travel</div>
      <span className="animated-splash-line" aria-hidden="true" />
    </div>
  );
}
