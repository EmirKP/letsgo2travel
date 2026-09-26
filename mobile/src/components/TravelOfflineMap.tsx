import { useEffect, useRef, useState } from "react";
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
const cities = [
  ["İstanbul", 41.01, 28.98],
  ["Paris", 48.86, 2.35],
  ["Berlin", 52.52, 13.4],
  ["London", 51.51, -0.13],
  ["Roma", 41.9, 12.49],
] as const;
export function TravelOfflineMap() {
  const { copy, locale } = useI18n();
  const now = useCurrentTime();
  const [packs, setPacks] = useState(readOfflineMaps);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    } catch {
      setError(copy("Paket silinemedi.", "Could not delete pack."));
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
      <div className="ta-actions">
        {packs.map((p) => (
          <button
            key={p.id}
            aria-pressed={pack?.id === p.id}
            onClick={() => setSelected(p.id)}
          >
            {p.center.latitude.toFixed(2)}, {p.center.longitude.toFixed(2)}
          </button>
        ))}
      </div>
      {pack ? (
        <>
          <p>
            {copy("Veri alındı:", "Data retrieved:")}{" "}
            {new Date(pack.downloadedAt).toLocaleString()}
          </p>
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
          <OfflineCanvas key={pack.id + pack.downloadedAt} pack={pack} />
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
          <ul>
            {pack.places.map((p) => (
              <li key={p.id}>
                {p.name ||
                  CATEGORY_LABELS[p.category]?.[locale === "tr" ? 0 : 1] ||
                  p.category}
              </li>
            ))}
          </ul>
          <button className="secondary-wide" onClick={() => remove(pack.id)}>
            {copy("Bu paketi cihazdan sil", "Delete this pack from device")}
          </button>
        </>
      ) : (
        <p>{copy("Henüz indirilmiş bölge yok.", "No areas downloaded yet.")}</p>
      )}
    </section>
  );
}
function OfflineCanvas({ pack }: { pack: OfflineMapPack }) {
  const { copy, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      scrollWheelZoom: false,
      minZoom: 13,
      maxZoom: 19,
    }).setView([pack.center.latitude, pack.center.longitude], 15);
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
      L.circleMarker([p.latitude, p.longitude], {
        radius: 6,
        color: "#2352c4",
        fillOpacity: 0.85,
      })
        .bindTooltip(text)
        .addTo(m);
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
    };
  }, [pack, locale]);
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
