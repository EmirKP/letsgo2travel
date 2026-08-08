import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { destinationArtwork } from "../data/artwork";
import { randomRoute } from "../data/routes";
import { hapticSuccess } from "../lib/native";
import type { RouteSuggestion } from "../types";

export function SurpriseScreen({ initialRoute, onSelect, onBuildRoute, onFlightSearch, onNotice }: {
  initialRoute?: RouteSuggestion | null;
  onSelect: (route: RouteSuggestion) => void;
  onBuildRoute: (route: RouteSuggestion) => void;
  onFlightSearch: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const [route, setRoute] = useState<RouteSuggestion>(() => initialRoute || randomRoute());
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!initialRoute) return;
    setRoute(initialRoute);
  }, [initialRoute]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const surpriseMe = () => {
    if (spinning) return;
    setSpinning(true);
    timer.current = window.setTimeout(() => {
      const next = randomRoute();
      setRoute(next);
      onSelect(next);
      setSpinning(false);
      timer.current = null;
      void hapticSuccess();
      onNotice(`${next.name} senin için seçildi.`);
    }, 720);
  };

  return <div className="screen surprise-screen">
    <section className="surprise-stage">
      <div className="surprise-kicker"><Icon name="sparkles" size={15} /> KARARINI DÜNYAYA BIRAK</div>
      <h1>Kararsızsan dünyayı döndür.</h1>
      <p>Her dokunuşta sana yeni ve gerçek bir rota seçelim.</p>
      <button
        className={`world-die ${spinning ? "spinning" : ""}`}
        type="button"
        onClick={surpriseMe}
        disabled={spinning}
        aria-label={spinning ? "Yeni rota seçiliyor" : "Dünyayı döndür ve yeni rota seç"}
      >
        <span className="world-grid" aria-hidden="true" />
        <span className="world-pin"><Icon name="compass" size={28} /></span>
        <span className="world-orbit" aria-hidden="true"><i /></span>
      </button>
      <small>{spinning ? "Dünya dönüyor…" : "Döndürmek için dünyaya dokun"}</small>
    </section>

    <article className="surprise-result">
      <div className="surprise-photo" style={{ backgroundImage: `linear-gradient(180deg, transparent 18%, rgba(4,20,37,.84)), url(${destinationArtwork(route.destinationCode)})` }}>
        <span>{route.visaStatus}</span>
        <div><small>SÜRPRİZ ROTAN</small><h2>{route.name}</h2><p>{route.country}</p></div>
      </div>
      <div className="surprise-copy">
        <p>{route.why}</p>
        <div className="surprise-tags"><span><Icon name="wallet" size={15} />{route.estimatedBudget}</span><span><Icon name="calendar" size={15} />{route.idealDuration}</span><span><Icon name="compass" size={15} />{route.difficulty}</span></div>
        <button className="primary-wide" onClick={() => onBuildRoute(route)}><Icon name="route" size={19} /> Rotaya dönüştür</button>
        <button className="secondary-wide" onClick={() => onFlightSearch(route)}><Icon name="plane" size={18} /> Uçuşlara bak</button>
        <button className="surprise-again" onClick={surpriseMe} disabled={spinning}><Icon name="refresh" size={18} /> Tekrar şaşırt</button>
      </div>
    </article>
  </div>;
}
