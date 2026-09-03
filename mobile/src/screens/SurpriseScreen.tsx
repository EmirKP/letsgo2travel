import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "../components/Icon";
import { destinationArtwork } from "../data/artwork";
import { randomRouteFor, routeByDestinationCode } from "../data/routes";
import { useI18n } from "../lib/i18n";
import { hapticSuccess } from "../lib/native";
import type { RouteSuggestion } from "../types";

type Budget = "economy" | "balanced" | "premium";
type Entry = "easy" | "all";
type Pace = "easy" | "balanced" | "adventure";

export function SurpriseScreen({ initialRoute, onSelect, onBuildRoute, onNotice }: {
  initialRoute?: RouteSuggestion | null;
  onSelect: (route: RouteSuggestion) => void;
  onBuildRoute: (route: RouteSuggestion) => void;
  onNotice: (message: string) => void;
}) {
  const { copy, locale } = useI18n();
  const [route, setRoute] = useState<RouteSuggestion | null>(() => initialRoute || null);
  const [budget, setBudget] = useState<Budget>("balanced");
  const [entry, setEntry] = useState<Entry>("easy");
  const [pace, setPace] = useState<Pace>("balanced");
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (initialRoute) setRoute(initialRoute);
  }, [initialRoute]);

  useEffect(() => {
    if (!route?.destinationCode) return;
    const localizedRoute = routeByDestinationCode(route.destinationCode, locale);
    if (localizedRoute) setRoute(localizedRoute);
  }, [locale, route?.destinationCode]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const surpriseMe = () => {
    if (spinning) return;
    setSpinning(true);
    timer.current = window.setTimeout(() => {
      const next = randomRouteFor({ budget, entry, pace }, locale);
      setRoute(next);
      onSelect(next);
      setSpinning(false);
      timer.current = null;
      void hapticSuccess();
      onNotice(copy(`${next.name} tercihlerin için seçildi.`, `${next.name} was picked for your preferences.`));
    }, 560);
  };

  const choice = <T extends Budget | Entry | Pace>(value: T, current: T, set: Dispatch<SetStateAction<T>>, tr: string, en: string) => <button type="button" className={value === current ? "active" : ""} aria-pressed={value === current} onClick={() => set(value)}>{copy(tr, en)}</button>;

  return <div className="screen surprise-screen surprise-v14">
    <section className="surprise-v14-hero">
      <span><Icon name="sparkles" size={26} /></span>
      <small>{copy("AKILLI SÜRPRİZ ROTA", "SMART SURPRISE ROUTE")}</small>
      <h1>{copy("Üç seçim yap. Gerisini bize bırak.", "Make three choices. Leave the rest to us.")}</h1>
      <p>{copy("Rastgele bir şehir atmak yerine bütçene, giriş tercihine ve seyahat tempoya uyan gerçek bir rota seçeriz.", "Instead of throwing you a random city, we pick a real route that fits your budget, entry preference and pace.")}</p>
    </section>

    <section className="surprise-preferences" aria-label={copy("Sürpriz rota tercihleri", "Surprise route preferences")}>
      <fieldset><legend><b>1</b><span><strong>{copy("Bütçe", "Budget")}</strong><small>{copy("Bu gezi ne kadar rahat olsun?", "How flexible should the spend be?")}</small></span></legend><div>{choice("economy", budget, setBudget, "Ekonomik", "Economy")}{choice("balanced", budget, setBudget, "Dengeli", "Balanced")}{choice("premium", budget, setBudget, "Rahat", "Premium")}</div></fieldset>
      <fieldset><legend><b>2</b><span><strong>{copy("Giriş kolaylığı", "Entry preference")}</strong><small>{copy("Vize kolaylığı önceliğin mi?", "Is easy entry a priority?")}</small></span></legend><div>{choice("easy", entry, setEntry, "Kolay giriş", "Easy entry")}{choice("all", entry, setEntry, "Fark etmez", "Any")}</div></fieldset>
      <fieldset><legend><b>3</b><span><strong>{copy("Tempo", "Pace")}</strong><small>{copy("Nasıl bir deneyim istiyorsun?", "What kind of experience do you want?")}</small></span></legend><div>{choice("easy", pace, setPace, "Sakin", "Easy")}{choice("balanced", pace, setPace, "Dengeli", "Balanced")}{choice("adventure", pace, setPace, "Macera", "Adventure")}</div></fieldset>
      <button className={`surprise-main-action ${spinning ? "loading" : ""}`} type="button" onClick={surpriseMe} disabled={spinning}>{spinning ? <span className="button-loader" /> : <Icon name="sparkles" size={20} />}<span><strong>{spinning ? copy("Rotan seçiliyor…", "Picking your route…") : copy("Beni şaşırt", "Surprise me")}</strong><small>{copy("Tercihlerime uygun bir rota bul", "Find a route that fits my choices")}</small></span></button>
    </section>

    {!route && <section className="surprise-promise"><span><Icon name="shield" size={22} /></span><div><strong>{copy("Boş bir öneri değil", "More than a random suggestion")}</strong><p>{copy("Sonuçta süre, bütçe, giriş bilgisi, neden uygun olduğu ve rotaya dönüştürme adımı bulunacak.", "Your result includes duration, budget, entry information, why it fits and a direct way to build the route.")}</p></div></section>}

    {route && <article className="surprise-result-v14" aria-live="polite">
      <div className="surprise-result-image" style={{ backgroundImage: `url(${destinationArtwork(route.destinationCode)})` }} role="img" aria-label={`${route.name}, ${route.country}`} />
      <div className="surprise-result-content">
        <div className="surprise-result-label"><span><Icon name="check" size={15} />{copy("SANA UYGUN ROTA", "YOUR MATCH")}</span><em>{route.scores.overall}% {copy("uyum", "match")}</em></div>
        <h2>{route.name}</h2><p className="surprise-country">{route.country}</p>
        <p className="surprise-why">{route.why}</p>
        <div className="surprise-facts">
          <div><Icon name="wallet" size={18} /><span><small>{copy("Bütçe", "Budget")}</small><strong>{route.estimatedBudget}</strong></span></div>
          <div><Icon name="calendar" size={18} /><span><small>{copy("İdeal süre", "Ideal stay")}</small><strong>{route.idealDuration}</strong></span></div>
          <div><Icon name="passport" size={18} /><span><small>{copy("Giriş", "Entry")}</small><strong>{route.visaStatus}</strong></span></div>
        </div>
        <div className="surprise-result-actions"><button className="primary-wide" onClick={() => onBuildRoute(route)}><Icon name="route" size={19} /> {copy("Bu rotayı planla", "Plan this route")}</button><button className="secondary-wide" onClick={surpriseMe} disabled={spinning}><Icon name="refresh" size={18} /> {copy("Başka bir rota seç", "Pick another route")}</button></div>
      </div>
    </article>}
  </div>;
}
