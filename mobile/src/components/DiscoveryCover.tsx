import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { DISCOVERY_DESTINATIONS, localizedDiscovery } from "../data/discovery";
import { destinationArtwork } from "../data/artwork";
import { routeByDestinationCode } from "../data/routes";
import { useI18n } from "../lib/i18n";
import { CountryFlag } from "./CountryFlag";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { normalizeSearchText } from "../lib/searchText";
import type { RouteSuggestion, ViewId } from "../types";

const shortcuts: { icon: IconName; tr: string; en: string; view: ViewId }[] = [
  { icon: "route", tr: "Rota Asistanı", en: "Plan a route", view: "route" },
  { icon: "passport", tr: "Pasaport Gücü", en: "Passport", view: "passport" },
  { icon: "wallet", tr: "Ülke Maliyetleri", en: "Country costs", view: "costs" },
  { icon: "plane", tr: "Havalimanı Rehberi", en: "Airport guide", view: "airports" },
  { icon: "calendar", tr: "Etkinlikler", en: "Events", view: "events" },
];

export function DiscoveryCover({ onNavigate, onSelect, children }: { onNavigate: (view: ViewId) => void; onSelect: (route: RouteSuggestion) => void; children?: ReactNode }) {
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
  const search = normalizeSearchText(query);
  const matches = search ? all.filter((item) => normalizeSearchText(`${item.name} ${item.country} ${item.code}`).includes(search)) : featured;
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
      <label className="discovery-search"><Icon name="search" size={19} /><span className="sr-only">{copy("Hazır rotalarda şehir veya ülke ara", "Search cities or countries in ready-made routes")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy("Hazır rota ara: Roma, Tokyo…", "Find a ready-made route: Rome, Tokyo…")} /></label>
      {!search && <nav className="discovery-shortcuts" aria-label={copy("Hızlı araçlar", "Quick tools")}>{shortcuts.map((item) => <button type="button" key={item.view} onClick={() => onNavigate(item.view)}><Icon name={item.icon} size={22} /><span>{copy(item.tr, item.en)}</span></button>)}</nav>}
    </section>
    {!search && children}
    <section className="editorial-destinations">
      <div className="editorial-heading"><h2>{search ? copy("Hazır rota sonuçları", "Ready-made routes") : copy("İlham veren rotalar", "Inspiring destinations")}</h2><button type="button" onClick={() => search ? setQuery("") : onNavigate("explore")}>{search ? copy("Aramayı temizle", "Clear search") : copy("Tümünü gör", "See all")} <Icon name="chevron" size={14} /></button></div>
      {search && <p role="status">{copy(`${matches.length} hazır rota bulundu.`, `${matches.length} ready-made routes found.`)}</p>}
      <div className="editorial-route-grid">{matches.map((item) => <button type="button" key={item.code} onClick={() => select(item.code)}><img src={destinationArtwork(item.code)} alt="" loading="lazy" width="180" height="240" /><span><strong>{item.name}</strong><small><CountryFlag code={item.alpha2} label={item.country} /> {item.country}</small></span></button>)}</div>
      {!matches.length && <div className="discovery-search-empty"><p>{copy("Bu yer için hazır rotamız henüz yok. Seyahat tercihlerinle sana uygun rota önerileri bulabilirsin.", "We do not have a ready-made route for this place yet. Find suggestions based on your travel preferences.")}</p><button type="button" className="secondary-wide" onClick={() => onNavigate("route")}><Icon name="route" size={18}/>{copy("Bana uygun rota bul", "Find a route for me")}</button></div>}
    </section>
  </>;
}
