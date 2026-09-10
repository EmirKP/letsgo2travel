import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { DiscoveryCover } from "../components/DiscoveryCover";
import { listCommunityQuestions, type CommunityQuestion } from "../lib/community";
import { useI18n } from "../lib/i18n";
import { randomRoute } from "../data/routes";
import { listCockpitTrips, type CockpitTrip } from "../lib/supabaseData";
import { localIsoDate } from "../lib/dates";
import type { AuthUser, RouteSuggestion, ViewId } from "../types";

export function HomeScreen({ user, ownerId, accessToken, refreshToken, onNavigate, onOpenCommunity, onSurprise, onBuildRoute, onNotice }: {
  user: AuthUser | null; ownerId?: string | null; accessToken?: string; refreshToken?: number;
  onNavigate: (view: ViewId) => void; onOpenCommunity: (countryCode?: string) => void;
  onSurprise: (route: RouteSuggestion) => void; onBuildRoute: (route: RouteSuggestion) => void; onNotice: (message: string) => void;
}) {
  const { locale, copy } = useI18n();
  const [trip, setTrip] = useState<{ owner: string; value: CockpitTrip } | null>(null);
  const [questionResult, setQuestionResult] = useState<{ owner: string; question: CommunityQuestion | null } | null>(null);
  const [tripError, setTripError] = useState(false);
  useEffect(() => {
    let active = true;
    if (ownerId && accessToken) void listCockpitTrips(ownerId, accessToken).then(items => {
      if (!active) return;
      const upcoming = items.filter(item => item.status === "active" || (item.status === "upcoming" && item.endDate >= localIsoDate(0)))
        .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.startDate.localeCompare(b.startDate))[0];
      setTrip(upcoming ? { owner: ownerId, value: upcoming } : null); setTripError(false);
    }).catch(() => { if (active) setTripError(true); });
    return () => { active = false; };
  }, [ownerId, accessToken, refreshToken]);
  useEffect(() => {
    let active = true;
    void listCommunityQuestions(1, accessToken).then(items => {
      if (active) setQuestionResult({ owner: user?.id || "guest", question: items[0] || null });
    }).catch(() => { if (active) setQuestionResult(null); });
    return () => { active = false; };
  }, [refreshToken, accessToken, user?.id]);
  const question = questionResult?.owner === (user?.id || "guest") ? questionResult.question : null;
  const nextTrip = trip && trip.owner === ownerId && user ? trip.value : null;
  const community = <section className="home-community-compact" aria-labelledby="home-community-title">
    <button type="button" onClick={() => onOpenCommunity()}><span className="home-community-icon"><Icon name="users" size={24}/></span><span><small>{copy("BİRLİKTE KEŞFET", "EXPLORE TOGETHER")}</small><h2 id="home-community-title">{copy("Gezginlere sor", "Ask travellers")}</h2><p>{copy("Gerçek deneyimler, yeni yol arkadaşları.", "Real experiences. New travel friends.")}</p></span><Icon name="chevron" size={18}/></button>
    {question && <button type="button" className="home-community-preview" onClick={() => onOpenCommunity(question.countryCode)}><span>{question.title}</span><small>{question.answerCount} {copy("cevap", "replies")}</small></button>}
  </section>;
  return <div className="screen home-screen home-v14 home-focused">
    <DiscoveryCover onNavigate={onNavigate} onSelect={onBuildRoute}>{community}</DiscoveryCover>
    <button type="button" className="home-trip-compact" onClick={() => onNavigate("cockpit")}><Icon name="suitcase" size={22}/><span><strong>{nextTrip ? [nextTrip.destinationCity, nextTrip.destinationCountry].filter(Boolean).join(", ") : copy("Seyahatini tek yerde yönet", "Your trip, all in one place")}</strong><small>{nextTrip ? nextTrip.startDate + " · " + nextTrip.endDate : tripError ? copy("Seyahatler için yeniden bağlan", "Reconnect to load your trips") : copy("Uçuş, hazırlık ve geri sayım", "Flights, preparation and countdown")}</small></span><Icon name="chevron" size={17}/></button>
    <div className="home-secondary-links">
      <button type="button" onClick={() => onNavigate("trips")}><Icon name="users" size={20}/><span>{copy("Ortak seyahat", "Shared trips")}</span></button>
      <button type="button" onClick={() => onNavigate("country-news")}><Icon name="globe" size={20}/><span>{copy("Ülke gündemi", "Country updates")}</span></button>
      <button type="button" onClick={() => onNavigate("phrases")}><Icon name="globe" size={20}/><span>{copy("Çevrimdışı ifadeler", "Offline phrases")}</span></button>
      <button type="button" onClick={() => { const route = randomRoute(locale); onSurprise(route); onNotice(copy(route.name + " senin için seçildi.", route.name + " was picked for you.")); }}><Icon name="sparkles" size={20}/><span>{copy("Beni şaşırt", "Surprise me")}</span></button>
    </div>
  </div>;
}
