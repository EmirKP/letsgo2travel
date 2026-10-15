import { useEffect, useState } from "react";
import appIcon from "../assets/splash-mark.webp";
import launchPoster from "../assets/launch-travel-poster.webp";
import { useI18n } from "../lib/i18n";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { copy } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    let exiting = false;
    let frame: number | null = null;
    let finishTimer: number | null = null;
    const beginExit = () => {
      if (exiting) return;
      exiting = true;
      setLeaving(true);
      finishTimer = window.setTimeout(onFinish, reducedMotion ? 0 : 180);
    };
    // The app has committed beneath the splash. Allow its first paint, then
    // reveal it without waiting for animation/media playback or network data.
    const fallbackTimer = window.setTimeout(beginExit, reducedMotion ? 0 : 600);
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(beginExit);
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      if (finishTimer !== null) window.clearTimeout(finishTimer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [onFinish, reducedMotion]);

  return (
    <div className={`animated-splash ${leaving ? "leaving" : ""}`} role="status" aria-label={copy("LetsGo2Travel açılıyor", "LetsGo2Travel is opening")}>
      {reducedMotion
        ? <img className="animated-splash-static" src={appIcon} alt="" />
        : <img
          className="animated-splash-media"
          src={launchPoster}
          alt=""
        />}
      <div className="animated-splash-scrim" aria-hidden="true" />
      <div className="animated-splash-copy" aria-hidden="true">
        <div className="animated-splash-brand">LetsGo<strong>2</strong>Travel</div>
        <p>{copy("Yeni rotan burada başlıyor.", "Your next journey starts here.")}</p>
        <span className="animated-splash-line" />
      </div>
    </div>
  );
}
