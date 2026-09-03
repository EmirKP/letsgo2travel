import { useEffect, useState } from "react";
import appIcon from "../../../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 1050);
    const finishTimer = window.setTimeout(onFinish, 1380);
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
