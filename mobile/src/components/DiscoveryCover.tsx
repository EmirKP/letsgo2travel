import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { DISCOVERY_DESTINATIONS, localizedDiscovery } from "../data/discovery";
import { destinationArtwork } from "../data/artwork";
import { routeByDestinationCode } from "../data/routes";
import { useI18n } from "../lib/i18n";
import { CountryFlag } from "./CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import type { RouteSuggestion, ViewId } from "../types";

const shortcuts: { icon: IconName; tr: string; en: string; view: ViewId }[] = [
  { icon: "route", tr: "Rota Asistanı", en: "Plan a route", view: "route" },
  { icon: "passport", tr: "Pasaport Gücü", en: "Passport", view: "passport" },
  { icon: "wallet", tr: "Ülke Maliyetleri", en: "Country costs", view: "costs" },
  { icon: "plane", tr: "Havalimanı Rehberi", en: "Airport guide", view: "airports" },
  { icon: "calendar", tr: "Etkinlikler", en: "Events", view: "events" },
];

export function DiscoveryCover({ onNavigate, onSelect }: { onNavigate: (view: ViewId) => void; onSelect: (route: RouteSuggestion) => void }) {
  const { copy, locale } = useI18n();
  const [query, setQuery] = useState("");
  const all = [
    ...DISCOVERY_DESTINATIONS.map((item) => ({ ...localizedDiscovery(item, locale), alpha2: alpha2FromAlpha3(item.alpha3) })),
    ...([{ code: "FCO", alpha2: "IT" }, { code: "DXB", alpha2: "AE" }]).flatMap((item) => {
      const route = routeByDestinationCode(item.code, locale);
      return route ? [{ code: item.code, alpha2: item.alpha2, name: route.name, country: route.country }] : [];
    }),
  ];
  const featured = ["FCO", "TYO", "SJJ", "DXB"].flatMap((code) => all.filter((item) => item.code === code));
  const matches = query.trim() ? all.filter((item) => `${item.name} ${item.country}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))) : featured;
  const select = (code: string) => {
    const route = routeByDestinationCode(code, locale);
    if (route) onSelect(route);
    else onNavigate("explore");
  };
  return <>
    <section className="discovery-cover">
      <span className="cover-note">{copy("Daha fazla rota,", "More places,")}<br />{copy("daha fazla hikâye.", "more stories.")}</span>
      <h1>{copy("Sıradaki", "Where does your")}<br />{copy("Hikayen Nerede?", "next story begin?")}</h1>
      <p>{copy("Dünyayı keşfet, kendini keşfet.", "Discover the world. Discover yourself.")}</p>
    </section>
    <section className="discovery-search-area" aria-label={copy("Rota keşfi", "Discover destinations")}>
      <label className="discovery-search"><Icon name="search" size={19} /><span className="sr-only">{copy("Şehir veya ülke ara", "Search city or country")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Nereye gitmek istersin?", "Where would you like to go?")} /></label>
      <nav className="discovery-shortcuts" aria-label={copy("Hızlı araçlar", "Quick tools")}>{shortcuts.map((item) => <button type="button" key={item.view} onClick={() => onNavigate(item.view)}><Icon name={item.icon} size={22} /><span>{copy(item.tr, item.en)}</span></button>)}</nav>
    </section>
    <section className="editorial-destinations">
      <div className="editorial-heading"><h2>{query ? copy("Arama sonuçları", "Search results") : copy("İlham veren rotalar", "Inspiring destinations")}</h2><button type="button" onClick={() => onNavigate("explore")}>{copy("Tümünü gör", "See all")} <Icon name="chevron" size={14} /></button></div>
      <div className="editorial-route-grid">{matches.map((item) => <button type="button" key={item.code} onClick={() => select(item.code)}><img src={destinationArtwork(item.code)} alt="" loading="lazy" width="180" height="240" /><span><strong>{item.name}</strong><small><CountryFlag code={item.alpha2} label={item.country} /> {item.country}</small></span></button>)}</div>
      {!matches.length && <p role="status">{copy("Bu aramayla eşleşen rota bulunamadı. Başka bir şehir veya ülke dene.", "No matching destination. Try another city or country.")}</p>}
    </section>
    <section className="editorial-inspiration"><div className="editorial-heading"><h2>{copy("Sana özel öneriler", "Ideas for your next trip")}</h2></div><div><button type="button" className="inspiration-coast" onClick={() => select("FCO")}><span>{copy("Akdeniz'e doğru", "Towards the Mediterranean")}</span><small>{copy("Kültür, sahil ve yeni sokaklar", "Culture, coast and new streets")}</small><b>{copy("Keşfet", "Explore")}</b></button><button type="button" className="inspiration-balkans" onClick={() => select("SJJ")}><span>{copy("Balkan hikâyeleri", "Balkan stories")}</span><small>{copy("Yakın rotalar, yeni anılar", "Short journeys, lasting memories")}</small><b>{copy("Keşfet", "Explore")}</b></button></div></section>
  </>;
}
