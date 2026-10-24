import { useI18n } from "../lib/i18n";
import { Icon } from "./Icon";
import "./travel-readiness-card.css";

export type ReadinessCount = { count: number | null; loading?: boolean; unavailable?: boolean };

/** A count of available records is not a claim that a particular trip is ready. */
export function TravelReadinessCard({ maps, onMaps }: {
  maps: ReadinessCount;
  onMaps: () => void;
}) {
  const { copy } = useI18n();
  const rows = [
    { id: "maps", label: copy("İndirilen haritalar", "Downloaded maps", "Hartat e shkarkuara"), icon: "offline" as const, state: maps, open: onMaps },
  ];
  function countLabel(state: ReadinessCount) {
    if (state.loading) return copy("Yükleniyor…", "Loading…", "Po ngarkohet…");
    if (state.unavailable || state.count === null) return copy("Kontrol edilemedi", "Could not check", "Nuk u kontrollua");
    return state.count > 0 ? copy(`${state.count} kayıt`, `${state.count} saved`, `${state.count} të ruajtura`) : copy("Henüz kayıt yok", "Nothing saved yet", "Asgjë e ruajtur ende");
  }
  return <section className="travel-readiness" aria-label={copy("İnternetsiz haritaların", "Your offline maps", "Hartat e tua pa internet")}>
    <h2>{copy("İnternetsiz haritaların", "Your offline maps", "Hartat e tua pa internet")}</h2>
    <p>{copy("Bu cihaza indirdiğin haritalar. Gideceğin bölgeyi ayrıca kontrol et.", "Maps downloaded on this device. Check that they cover your destination.", "Hartat e shkarkuara në këtë pajisje. Kontrollo veçmas zonën ku do të shkosh.")}</p>
    <div className="travel-readiness-rows">{rows.map(row => <button type="button" key={row.id} onClick={row.open}>
      <Icon name={row.icon} size={19}/><strong>{row.label}</strong><span>{countLabel(row.state)}</span><Icon name="chevron" size={16}/>
    </button>)}</div>
  </section>;
}
