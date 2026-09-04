import { useCallback, useEffect, useRef, useState } from "react";
import appIcon from "../assets/splash-mark.webp";
import launchPoster from "../assets/launch-travel-poster.webp";
import launchVideo from "../assets/launch-travel.mp4";
import { useI18n } from "../lib/i18n";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { copy } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const exitStarted = useRef(false);
  const finishTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const beginExit = useCallback(() => {
    if (exitStarted.current) return;
    exitStarted.current = true;
    setLeaving(true);
    finishTimer.current = window.setTimeout(onFinish, reducedMotion ? 80 : 360);
  }, [onFinish, reducedMotion]);

  useEffect(() => {
    // Video oynatılamaz veya `ended` olayı gelmezse kullanıcı açılışta kalmaz.
    const fallbackTimer = window.setTimeout(beginExit, reducedMotion ? 180 : 4_400);
    if (!reducedMotion) {
      const playback = videoRef.current?.play();
      if (playback) void playback.catch(beginExit);
    }
    return () => {
      window.clearTimeout(fallbackTimer);
      if (finishTimer.current) window.clearTimeout(finishTimer.current);
    };
  }, [beginExit, reducedMotion]);

  return (
    <div className={`animated-splash ${leaving ? "leaving" : ""}`} role="status" aria-label={copy("LetsGo2Travel açılıyor", "LetsGo2Travel is opening")}>
      {reducedMotion
        ? <img className="animated-splash-static" src={appIcon} alt="" />
        : <video
          ref={videoRef}
          className="animated-splash-media"
          src={launchVideo}
          poster={launchPoster}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={beginExit}
          onError={beginExit}
          aria-hidden="true"
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
