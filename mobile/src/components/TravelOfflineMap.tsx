import { formatAppDate } from "../lib/localeFormatting";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CATEGORY_LABELS } from "../../../lib/travel-assistant/places";
import "leaflet/dist/leaflet.css";
import { useI18n } from "../lib/i18n";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { config } from "../lib/config";
import { ApiError, requestJson } from "../lib/api";
import { locateForTravel } from "../lib/travelAssistant";
import {
  readOfflineMaps,
  saveOfflineMap,
  deleteOfflineMap,
  hasUnreadableOfflineMaps,
  resetOfflineMaps,
} from "../lib/offlineMaps";
import { validateOfflinePack } from "../../../lib/travel-assistant/offline-map";
import type { OfflineMapPack } from "../../../lib/travel-assistant/offline-map";
import type { Place } from "../../../lib/travel-assistant/types";
import { Sheet } from "./Sheet";
import { openExternal } from "../lib/native";
import "./travel-offline-map.css";
import { TravelAreaPicker } from "./TravelAreaPicker";
import { TRAVEL_CENTRES } from "../lib/travelAreas";
import type { Coordinates } from "../../../lib/travel-assistant/types";
function packName(pack: OfflineMapPack) {
  const known = TRAVEL_CENTRES.find((entry) => entry.latitude.toFixed(2) === pack.center.latitude.toFixed(2) && entry.longitude.toFixed(2) === pack.center.longitude.toFixed(2));
  const coordinates = `${pack.center.latitude.toFixed(2)}, ${pack.center.longitude.toFixed(2)}`;
  return known ? `${known.name} · ${coordinates}` : coordinates;
}
export function TravelOfflineMap() {
  const { copy, dateLocale } = useI18n();
  const now = useCurrentTime();
  const [packs, setPacks] = useState(readOfflineMaps);
  const [unreadable, setUnreadable] = useState(hasUnreadableOfflineMaps);
  const [resetOpen, setResetOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [area, setArea] = useState<Coordinates | null>(null);
  const downloadRef = useRef<AbortController | null>(null);
  useEffect(() => () => downloadRef.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<OfflineMapPack | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const pack = packs.find((p) => p.id === selected) || packs[0];
  async function download(locate: boolean) {
    if (busy) return;
    const controller = new AbortController();
    downloadRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const center = locate
        ? await locateForTravel()
        : area;
      if (controller.signal.aborted) return;
      if (!center) throw new Error("area");
      const raw = await requestJson<unknown>(
        `${config.travelAssistantApiBaseUrl}/api/travel-assistant/offline-map`,
        { method: "POST", body: center, timeoutMs: 32000, signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const value = validateOfflinePack(raw);
      if (!value) throw new Error("invalid");
      setPacks(saveOfflineMap(value));
      setSelected(value.id);
    } catch (e) {
      if (controller.signal.aborted) return;
      setUnreadable(hasUnreadableOfflineMaps());
      setError(
        e instanceof Error && e.message === "full"
          ? copy(
              "En fazla 3 bölge / 3 MB saklanabilir. Önce bir paketi sil.",
              "Store up to 3 areas / 3 MB. Delete a pack first.",
            )
          : e instanceof Error && e.message === "denied" ? copy("Konum izni verilmedi. Aşağıdan bölgeyi kendin seçebilirsin.", "Location permission denied. Select an area manually below.", "Leja e vendndodhjes u refuzua. Zgjidh zonën vetë më poshtë.")
          : e instanceof Error && e.message === "corrupt" ? copy("Kayıtlı paketlerden biri okunamıyor. Yeni indirme kaydedilmedi; mevcut kayıtların korundu.", "A saved pack cannot be read. The new download was not saved; existing data is preserved.", "Një paketë e ruajtur nuk lexohet. Shkarkimi i ri nuk u ruajt; të dhënat ekzistuese u ruajtën.")
          : e instanceof ApiError && e.status === 503 ? copy("Harita kaynağı şu anda yoğun. Biraz sonra tekrar dene; kayıtlı haritaların aşağıda açılabilir.", "The map source is busy. Try again shortly; saved maps can still be opened below.", "Burimi i hartës është i ngarkuar. Provo pak më vonë; hartat e ruajtura hapen më poshtë.")
          : copy(
              "Bölge indirilemedi. Konum iznini, interneti ve cihaz depolamasını kontrol et. Mevcut paketlerin korunuyor.",
              "Could not download this area. Check location permission, internet and storage. Existing packs are preserved.",
            ),
      );
    } finally {
      if (downloadRef.current === controller) { downloadRef.current = null; setBusy(false); }
    }
  }
  function remove(id: string) {
    try {
      setPacks(deleteOfflineMap(id));
      setPendingDelete(null);
      setError("");
    } catch {
      setUnreadable(hasUnreadableOfflineMaps());
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
      <TravelAreaPicker value={area} onChange={setArea} disabled={busy}/>
      <button
        className="primary-wide"
        disabled={busy || !area}
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
      {busy && <div className="ta-tools-status" role="status"><p>{copy('Sokaklar ve noktalar indiriliyor. Mevcut paketlerin korunuyor.', 'Downloading streets and points. Your existing packs are preserved.', 'Po shkarkohen rrugët dhe pikat. Paketat ekzistuese ruhen.')}</p><button className="secondary-wide" type="button" onClick={() => {downloadRef.current?.abort();downloadRef.current = null;setBusy(false);}}>{copy('İndirmeyi iptal et', 'Cancel download', 'Anulo shkarkimin')}</button></div>}
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
      {unreadable && <div className="ta-warning" role="alert"><p>{copy('Kayıtlı haritalardan biri okunamıyor. Okunabilen paketlerin aşağıda; diğer kayıtlar otomatik silinmedi. Harita verisini sıfırlayıp bölgeleri yeniden indirebilirsin.', 'A saved map cannot be read. Readable packs are below; other records were not automatically deleted. Reset map data to download your areas again.', 'Një hartë e ruajtur nuk lexohet. Paketat e lexueshme janë më poshtë; të tjerat nuk u fshinë automatikisht. Rivendos të dhënat e hartave për t’i shkarkuar zonat sërish.')}</p><button type="button" className="secondary-wide" disabled={busy} onClick={() => {setDeleteError('');setResetOpen(true);}}>{copy('Harita verisini sıfırla', 'Reset map data', 'Rivendos të dhënat e hartave')}</button></div>}
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
            <small>{copy("Veri alındı:", "Data retrieved:")} {formatAppDate(new Date(pack.downloadedAt), dateLocale, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })}</small>
          </div>
          {now - Date.parse(pack.downloadedAt) > 7 * 86400000 && (
            <p className="ta-warning">
              {copy(
                "Paket 7 günden eski. İnternet varken yeniden indir.",
                "Pack is over 7 days old. Download it again when connected.",
              )}
            </p>
          )}
          {pack.stale && <p role="status" className="ta-warning">{copy("Harita kaynağına ulaşılamadı. Bu bölgenin son alınan paketi kaydedildi; yukarıdaki veri tarihi korunuyor. İnternet varken yeniden deneyebilirsin.", "The map source could not be reached. The last retrieved pack for this area was saved with its original date shown above. Try again when connected.", "Burimi i hartës nuk u arrit. U ruajt paketa e fundit e kësaj zone me datën origjinale më sipër. Provo sërish kur të kesh lidhje.")}</p>}
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
      <Sheet open={resetOpen} title={copy('İndirilmiş haritaları sıfırla', 'Reset downloaded maps', 'Rivendos hartat e shkarkuara')} onClose={() => setResetOpen(false)}><div className="ta-offline-delete">
        <p>{copy('Okunabilenler dahil bu cihazdaki bütün indirilmiş haritalar silinir. Yeniden indirmek için internet gerekir. Kayıtlı yerlerin ve diğer seyahat bilgilerin korunur.', 'All downloaded maps on this device, including readable ones, will be removed. Downloading again needs internet. Saved places and other travel data are preserved.', 'Të gjitha hartat e shkarkuara në këtë pajisje, edhe ato të lexueshme, do të hiqen. Shkarkimi i ri kërkon internet. Vendet e ruajtura dhe të dhënat e tjera të udhëtimit ruhen.')}</p>
        {deleteError && <p role="alert">{deleteError}</p>}
        <button className="secondary-wide" type="button" onClick={() => setResetOpen(false)}>{copy('Vazgeç', 'Cancel', 'Anulo')}</button>
        <button className="primary-wide" type="button" onClick={() => {try {resetOfflineMaps();setPacks([]);setSelected('');setUnreadable(false);setResetOpen(false);setError('');} catch {setDeleteError(copy('Harita verisi sıfırlanamadı. Depolama iznini kontrol et.', 'Map data could not be reset. Check storage access.', 'Të dhënat e hartave nuk u rivendosën. Kontrollo lejen e ruajtjes.'));}}}>{copy('Evet, indirilmiş haritaları sil', 'Yes, delete downloaded maps', 'Po, fshi hartat e shkarkuara')}</button>
      </div></Sheet>
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
  const categoryLabel = (value: Place["category"]) => CATEGORY_LABELS[value]?.[locale === "tr" ? 0 : locale === "sq" ? 2 : 1] || value;
  const name = (place: Place) => place.name || categoryLabel(place.category);
  const categories = [...new Set(pack.places.map((place) => place.category))];
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return pack.places.filter((place) => (category === "all" || place.category === category) &&
      (!needle || `${place.name} ${CATEGORY_LABELS[place.category]?.[locale === "tr" ? 0 : locale === "sq" ? 2 : 1] || place.category}`.toLocaleLowerCase(locale).includes(needle)));
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
      <small>{copy("Kaynak: OpenStreetMap · Veri alındı:", "Source: OpenStreetMap · Data retrieved:")} {formatAppDate(new Date(pack.downloadedAt), dateLocale, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })}</small>
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
        CATEGORY_LABELS[p.category]?.[locale === "tr" ? 0 : locale === "sq" ? 2 : 1] ||
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
