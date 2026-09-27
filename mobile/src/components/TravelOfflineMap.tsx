import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CATEGORY_LABELS } from "../../../lib/travel-assistant/places";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../lib/i18n";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { config } from "../lib/config";
import { requestJson } from "../lib/api";
import { locateForTravel } from "../lib/travelAssistant";
import {
  readOfflineMaps,
  saveOfflineMap,
  deleteOfflineMap,
} from "../lib/offlineMaps";
import { validateOfflinePack } from "../../../lib/travel-assistant/offline-map";
import type { OfflineMapPack } from "../../../lib/travel-assistant/offline-map";
import type { Place } from "../../../lib/travel-assistant/types";
import { Sheet } from "./Sheet";
import { openExternal } from "../lib/native";
import "./travel-offline-map.css";
const cities = [
  ["İstanbul", 41.01, 28.98],
  ["Paris", 48.86, 2.35],
  ["Berlin", 52.52, 13.4],
  ["London", 51.51, -0.13],
  ["Roma", 41.9, 12.49],
] as const;
function packName(pack: OfflineMapPack) {
  const known = cities.find((entry) => entry[1].toFixed(2) === pack.center.latitude.toFixed(2) && entry[2].toFixed(2) === pack.center.longitude.toFixed(2));
  const coordinates = `${pack.center.latitude.toFixed(2)}, ${pack.center.longitude.toFixed(2)}`;
  return known ? `${known[0]} · ${coordinates}` : coordinates;
}
export function TravelOfflineMap() {
  const { copy, dateLocale } = useI18n();
  const now = useCurrentTime();
  const [packs, setPacks] = useState(readOfflineMaps);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<OfflineMapPack | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const pack = packs.find((p) => p.id === selected) || packs[0];
  async function download(locate: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const entry = cities[Number(city)];
      const center = locate
        ? await locateForTravel()
        : { latitude: entry[1], longitude: entry[2] };
      const raw = await requestJson<unknown>(
        `${config.travelAssistantApiBaseUrl}/api/travel-assistant/offline-map`,
        { method: "POST", body: center, timeoutMs: 28000 },
      );
      const value = validateOfflinePack(raw);
      if (!value) throw new Error("invalid");
      setPacks(saveOfflineMap(value));
      setSelected(value.id);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "full"
          ? copy(
              "En fazla 3 bölge / 3 MB saklanabilir. Önce bir paketi sil.",
              "Store up to 3 areas / 3 MB. Delete a pack first.",
            )
          : copy(
              "Bölge indirilemedi. Konum iznini, interneti ve cihaz depolamasını kontrol et. Mevcut paketlerin korunuyor.",
              "Could not download this area. Check location permission, internet and storage. Existing packs are preserved.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  function remove(id: string) {
    try {
      setPacks(deleteOfflineMap(id));
      setPendingDelete(null);
      setError("");
    } catch {
      setDeleteError(copy("Paket silinemedi. Yeniden deneyebilirsin; mevcut paket korunuyor.", "Could not delete pack. You can try again; the existing pack is preserved."));
    }
  }
  return (
    <section className="ta-panel ta-form">
      <h2>{copy("Çevrimdışı sokak haritası", "Offline street map")}</h2>
      <p>
        {copy(
          "Seçtiğin merkezin yaklaşık 1,5 km çevresindeki sokakları ve bazı gezi/ihtiyaç noktalarını cihazına indir. Bu sade harita yön tarifi, uydu görüntüsü veya tam şehir kapsamı içermez.",
          "Download streets and selected travel/essential points within about 1.5 km of your chosen center. This simple map has no turn-by-turn directions, satellite imagery or full-city coverage.",
        )}
      </p>
      <label>
        {copy("Şehir merkezi", "City center")}
        <select
          value={city}
          disabled={busy}
          onChange={(e) => setCity(e.target.value)}
        >
          {cities.map((c, i) => (
            <option key={c[0]} value={i}>
              {c[0]}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary-wide"
        disabled={busy}
        onClick={() => void download(false)}
      >
        {busy
          ? copy("İndiriliyor…", "Downloading…")
          : copy("Seçili bölgeyi indir", "Download selected area")}
      </button>
      <button
        className="secondary-wide"
        disabled={busy}
        onClick={() => void download(true)}
      >
        {copy("Bulunduğum bölgeyi indir", "Download my current area")}
      </button>
      <p className="ta-muted">
        {copy(
          "Yalnız indirmeyi seçtiğin yaklaşık bölge cihazında saklanır. En fazla 3 paket; uygulama verilerini temizlemek paketleri siler.",
          "Only areas you choose to download are stored on your device. Up to 3 packs; clearing app data removes them.",
        )}
      </p>
      {error && (
        <p className="ta-warning" role="alert">
          {error}
        </p>
      )}
      <div className="ta-actions ta-offline-packs" aria-label={copy("İndirilen bölgeler", "Downloaded areas")}>
        {packs.map((p) => (
          <button
            key={p.id}
            aria-pressed={pack?.id === p.id}
            onClick={() => setSelected(p.id)}
          >
            {packName(p)}
          </button>
        ))}
      </div>
      {pack ? (
        <>
          <div className="ta-offline-summary">
            <strong>{packName(pack)}</strong>
            <span>{copy(`${pack.roads.length} sokak · ${pack.places.length} nokta`, `${pack.roads.length} streets · ${pack.places.length} points`)} · {Math.max(1, Math.ceil(new Blob([JSON.stringify(pack)]).size / 1024))} KB</span>
            <span>{copy("İndirme alanı: merkezden yaklaşık 1,5 km", "Download area: about 1.5 km from center")}</span>
            <small>{copy("Veri alındı:", "Data retrieved:")} {new Date(pack.downloadedAt).toLocaleString(dateLocale)}</small>
          </div>
          {now - Date.parse(pack.downloadedAt) > 7 * 86400000 && (
            <p className="ta-warning">
              {copy(
                "Paket 7 günden eski. İnternet varken yeniden indir.",
                "Pack is over 7 days old. Download it again when connected.",
              )}
            </p>
          )}
          {pack.limited && (
            <p className="ta-warning">
              {copy(
                "Bu bölgede bazı sokak veya noktalar paket sınırı nedeniyle bulunmayabilir.",
                "Some streets or points may be absent because of pack limits.",
              )}
            </p>
          )}
          <OfflinePackExplorer key={pack.id + pack.downloadedAt} pack={pack} />
          <p className="ta-muted">
            ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors · ODbL
            </a>
          </p>
          <button className="secondary-wide" onClick={() => { setDeleteError(""); setPendingDelete(pack); }}>
            {copy("Bu paketi cihazdan sil", "Delete this pack from device")}
          </button>
        </>
      ) : (
        <p>{copy("Henüz indirilmiş bölge yok.", "No areas downloaded yet.")}</p>
      )}
      <Sheet open={!!pendingDelete} title={copy("Harita paketini sil", "Delete map pack")} onClose={() => setPendingDelete(null)}>
        {pendingDelete && <div className="ta-offline-delete">
          <strong>{packName(pendingDelete)}</strong>
          <p>{copy("Bu bölge cihazından silinecek. Tekrar kullanmak için internet bağlantısıyla yeniden indirmen gerekir.", "This area will be removed from your device. You will need an internet connection to download it again.")}</p>
          {deleteError && <p role="alert">{deleteError}</p>}
          <button className="secondary-wide" onClick={() => setPendingDelete(null)}>{copy("Paketi tut", "Keep pack")}</button>
          <button className="primary-wide" onClick={() => remove(pendingDelete.id)}>{copy("Evet, cihazdan sil", "Yes, delete from device")}</button>
        </div>}
      </Sheet>
    </section>
  );
}
function OfflinePackExplorer({ pack }: { pack: OfflineMapPack }) {
  const { copy, locale, dateLocale } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [focusRevision, setFocusRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const categoryLabel = (value: Place["category"]) => CATEGORY_LABELS[value]?.[locale === "tr" ? 0 : 1] || value;
  const name = (place: Place) => place.name || categoryLabel(place.category);
  const categories = [...new Set(pack.places.map((place) => place.category))];
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return pack.places.filter((place) => (category === "all" || place.category === category) &&
      (!needle || `${place.name} ${CATEGORY_LABELS[place.category]?.[locale === "tr" ? 0 : 1] || place.category}`.toLocaleLowerCase(locale).includes(needle)));
  }, [pack, query, category, locale]);
  const selected = visible.find((place) => place.id === selectedId) || null;
  const selectPoint = useCallback((id: string) => { setSelectedId(id); setFocusRevision((revision) => revision + 1); setNotice(""); }, []);
  const detailRef = useRef<HTMLElement>(null);
  function chooseFromList(id: string) {
    selectPoint(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  return <div className="ta-offline-explorer">
    <div className="ta-field-pair ta-offline-search">
      <label>{copy("Kayıtlı noktalarda ara", "Search saved points")}<input type="search" maxLength={120} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(""); }} placeholder={copy("Ad veya kategori", "Name or category")} /></label>
      <label>{copy("Nokta türü", "Point type")}<select value={category} onChange={(event) => { setCategory(event.target.value); setSelectedId(""); }}><option value="all">{copy("Tüm noktalar", "All points")}</option>{categories.map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label>
    </div>
    <p className="ta-muted" role="status">{copy(`${visible.length} / ${pack.places.length} kayıtlı nokta gösteriliyor. Arama internetsiz çalışır.`, `Showing ${visible.length} of ${pack.places.length} saved points. Search works offline.`)}</p>
    <OfflineCanvas pack={pack} places={visible} selected={selected} focusRevision={focusRevision} onSelect={selectPoint} />
    {selected && <article ref={detailRef} className="ta-card ta-offline-detail" aria-label={copy("Seçilen nokta", "Selected point")}>
      <div className="ta-offline-detail-heading"><h3>{name(selected)}</h3><button type="button" className="secondary-button" onClick={() => setSelectedId("")}>{copy("Kapat", "Close")}</button></div>
      <p>{categoryLabel(selected.category)} · {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}</p>
      {typeof selected.description === "string" && selected.description && <p>{selected.description}</p>}
      {typeof selected.hours === "string" && selected.hours && <p>{copy("Kayıtlı çalışma saatleri:", "Saved opening hours:")} {selected.hours}</p>}
      <small>{copy("Kaynak: OpenStreetMap · Veri alındı:", "Source: OpenStreetMap · Data retrieved:")} {new Date(pack.downloadedAt).toLocaleString(dateLocale)}</small>
      <p className="ta-muted">{copy("Bu bilgi indirdiğin pakettendir. Açılış saatleri ve hizmet durumu değişmiş olabilir.", "This information comes from your downloaded pack. Hours and service availability may have changed.")}</p>
      <div className="ta-actions"><button type="button" onClick={() => void openExternal(selected.sourceUrl).then((opened) => { if (!opened) setNotice(copy("Kaynak açılamadı. İnternet bağlantını kontrol et.", "Could not open the source. Check your connection.")); })}>{copy("Kaynağı aç (internet gerekir)", "Open source (internet required)")}</button></div>
      {notice && <p role="status">{notice}</p>}
    </article>}
    {!visible.length && <div className="ta-empty"><p>{pack.places.length ? copy("Aramana uyan kayıtlı nokta yok.", "No saved points match your search.") : copy("Bu pakette nokta kaydı yok; indirilmiş sokakları haritada inceleyebilirsin.", "This pack has no saved points; you can still explore the downloaded streets.")}</p>{(query || category !== "all") && <div className="ta-actions"><button onClick={() => { setQuery(""); setCategory("all"); }}>{copy("Filtreleri temizle", "Clear filters")}</button></div>}</div>}
    <div className="ta-place-list ta-offline-point-list">{visible.map((place) => <button type="button" key={place.id} aria-pressed={selected?.id === place.id} onClick={() => chooseFromList(place.id)}><span><strong>{name(place)}</strong><small>{categoryLabel(place.category)}</small></span><span aria-hidden="true">↗</span></button>)}</div>
  </div>;
}

function OfflineCanvas({ pack, places, selected, focusRevision, onSelect }: { pack: OfflineMapPack; places: Place[]; selected: Place | null; focusRevision: number; onSelect: (id: string) => void }) {
  const { copy, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      scrollWheelZoom: false,
      minZoom: 13,
      maxZoom: 19,
    }).setView([pack.center.latitude, pack.center.longitude], 15);
    mapRef.current = m;
    for (const road of pack.roads) {
      const line = L.polyline(road.points, {
        color: "#446486",
        weight: 3,
      }).addTo(m);
      if (road.name) {
        const text = document.createElement("span");
        text.textContent = road.name;
        line.bindTooltip(text);
      }
    }
    for (const p of pack.places) {
      const text = document.createElement("span");
      text.textContent =
        p.name ||
        CATEGORY_LABELS[p.category]?.[locale === "tr" ? 0 : 1] ||
        p.category;
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 6,
        color: "#2352c4",
        fillOpacity: 0.85,
      })
        .bindTooltip(text)
        .addTo(m);
      marker.on("click", () => onSelect(p.id));
      markersRef.current.set(p.id, marker);
    }
    const bounds = L.latLng(
      pack.center.latitude,
      pack.center.longitude,
    ).toBounds(6000);
    m.setMaxBounds(bounds);
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      m.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, [pack, locale, onSelect]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ids = new Set(places.map((place) => place.id));
    for (const [id, marker] of markersRef.current) {
      if (ids.has(id)) {
        if (!map.hasLayer(marker)) marker.addTo(map);
        marker.setStyle({ color: id === selected?.id ? "#ad4b15" : "#2352c4", weight: id === selected?.id ? 4 : 2 });
        marker.setRadius(id === selected?.id ? 9 : 6);
      } else marker.remove();
    }
    if (selected) {
      map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), 16), { animate: false });
      markersRef.current.get(selected.id)?.openTooltip();
    }
  }, [places, selected, focusRevision, locale]);
  return (
    <div
      className="ta-map ta-offline-canvas"
      ref={ref}
      aria-label={copy(
        "İndirilmiş sokak haritası; noktalar aşağıdaki listede.",
        "Downloaded street map; points listed below.",
      )}
    />
  );
}
