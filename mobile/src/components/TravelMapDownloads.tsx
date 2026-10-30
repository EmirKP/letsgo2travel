import { useEffect, useId, useRef, useState } from 'react';
import type { Coordinates, Place } from '../../../lib/travel-assistant/types';
import type { OfflineMapPack } from '../../../lib/travel-assistant/offline-map';
import { OPEN_MAP_MAX_BYTES } from '../../../lib/maps/open-map-resources';
import {
  deleteOpenMapPack, downloadOpenMapRegion, listOpenMapPacks, readOpenMapPack, subscribeOpenMapPacks,
  type OpenMapPack, type OpenMapPackSummary,
} from '../lib/openMapOffline';
import { readOfflineMaps } from '../lib/offlineMaps';
import { useI18n } from '../lib/i18n';
import { formatAppDate } from '../lib/localeFormatting';
import { Icon } from './Icon';
import './travel-map-downloads.css';

type DownloadProps = {
  center: Coordinates; places: Place[]; name: string;
  onOpenPack: (pack: OpenMapPack) => void;
  onOpenLegacy: (pack: OfflineMapPack) => void;
};
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 1_000_000 ? 2 : 1)} MB`;

export function TravelMapDownloads({ center, places, name, onOpenPack, onOpenLegacy }: DownloadProps) {
  const { copy, locale } = useI18n(), headingId = useId(), confirmId = useId();
  const [packs, setPacks] = useState<OpenMapPackSummary[]>([]);
  const [legacy] = useState(readOfflineMaps);
  const [loading, setLoading] = useState(true), [listError, setListError] = useState('');
  const [radius, setRadius] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false), [opening, setOpening] = useState('');
  const [progress, setProgress] = useState({ bytes: 0, count: 0, name: '' });
  const [status, setStatus] = useState(''), [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<OpenMapPackSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const controller = useRef<AbortController | null>(null), alive = useRef(true), listRevision = useRef(0);
  const currentName = name.trim() || copy('Haritadaki bölge', 'Current map region', 'Zona në hartë');
  const currentPackId = `${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}:${radius}`;
  const onlineOnlyPlaces = places.filter(place => place.id.startsWith('apple/')).length;
  const atLimit = packs.length >= 3 && !packs.some(pack => pack.id === currentPackId);

  async function refresh() {
    const revision = ++listRevision.current;
    try {
      const next = await listOpenMapPacks();
      if (alive.current && revision === listRevision.current) { setPacks(next); setListError(''); setLoading(false); }
    } catch {
      if (alive.current && revision === listRevision.current) {
        setLoading(false);
        setListError(copy('İndirilen haritalar okunamadı. Mevcut indirmeler silinmedi.', 'Downloaded maps could not be read. Existing downloads were not deleted.', 'Hartat e shkarkuara nuk u lexuan. Shkarkimet ekzistuese nuk u fshinë.'));
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    void refresh();
    const unsubscribe = subscribeOpenMapPacks(() => { void refresh(); });
    return () => { alive.current = false; listRevision.current++; controller.current?.abort(); unsubscribe(); };
  }, []);

  async function download() {
    if (controller.current || deleting || atLimit || listError || loading) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(''); setStatus(''); setProgress({ bytes: 0, count: 0, name: currentName });
    try {
      const completed = await downloadOpenMapRegion({ center: { ...center }, name: currentName, radiusKm: radius, places,
        signal: request.signal, onProgress: (bytes, count) => {
          if (alive.current && controller.current === request) setProgress({ bytes, count, name: currentName });
        } });
      if (!alive.current || controller.current !== request) return;
      setStatus(copy(`${completed.name} indirildi · ${megabytes(completed.bytes)}`, `${completed.name} downloaded · ${megabytes(completed.bytes)}`, `${completed.name} u shkarkua · ${megabytes(completed.bytes)}`));
      await refresh();
    } catch (failure) {
      if (!alive.current || controller.current !== request) return;
      const code = failure instanceof Error ? failure.message : '';
      if (request.signal.aborted) setStatus(copy('İndirme iptal edildi. Önceki haritaların duruyor.', 'Download cancelled. Your previous maps are preserved.', 'Shkarkimi u anulua. Hartat e mëparshme ruhen.'));
      else setError(code === 'pack_limit'
        ? copy('En fazla 3 bölge saklayabilirsin. Yeni bir bölge için önce birini kaldır.', 'You can keep up to 3 regions. Remove one before adding another.', 'Mund të ruash deri në 3 zona. Hiq një para se të shtosh një tjetër.')
        : code === 'area_too_large'
          ? copy('Bu bölge 50 MB sınırını aşıyor. Daha küçük bir alan seçip tekrar dene. Önceki haritaların duruyor.', 'This region exceeds 50 MB. Select a smaller area and retry. Your previous maps are preserved.', 'Kjo zonë tejkalon 50 MB. Zgjidh një zonë më të vogël dhe provo sërish. Hartat e mëparshme ruhen.')
          : copy('İndirme tamamlanamadı. Bağlantını ve cihaz alanını kontrol edip tekrar dene. Önceki haritaların duruyor.', 'Download could not finish. Check your connection and device storage, then retry. Your previous maps are preserved.', 'Shkarkimi nuk përfundoi. Kontrollo lidhjen dhe hapësirën e pajisjes, pastaj provo sërish. Hartat e mëparshme ruhen.'));
    } finally {
      if (controller.current === request) { controller.current = null; if (alive.current) setBusy(false); }
    }
  }
  async function open(pack: OpenMapPackSummary) {
    if (opening) return;
    setOpening(pack.id); setError('');
    try {
      const stored = await readOpenMapPack(pack.id);
      if (!alive.current) return;
      if (!stored) { setError(copy('Bu harita açılamadı. Tekrar indirmeyi deneyebilirsin.', 'This map could not be opened. Try downloading it again.', 'Kjo hartë nuk u hap. Provo ta shkarkosh sërish.')); return; }
      onOpenPack(stored);
    } catch { if (alive.current) setError(copy('Haritaya erişilemiyor. Önceki indirmeler silinmedi.', 'The map is unavailable. Previous downloads were not deleted.', 'Harta nuk është e disponueshme. Shkarkimet e mëparshme nuk u fshinë.')); }
    finally { if (alive.current) setOpening(''); }
  }
  async function remove() {
    if (!confirmDelete || deleting || busy) return;
    setDeleting(true); setError('');
    try {
      await deleteOpenMapPack(confirmDelete.id);
      if (!alive.current) return;
      setConfirmDelete(null); setStatus(copy('İndirilen bölge kaldırıldı. Kayıtlı yerlerin ve notların duruyor.', 'Downloaded region removed. Your saved places and notes are preserved.', 'Zona e shkarkuar u hoq. Vendet dhe shënimet e ruajtura mbeten.'));
      await refresh();
    } catch { if (alive.current) setError(copy('Harita kaldırılamadı. Tekrar dene.', 'The map could not be removed. Try again.', 'Harta nuk u hoq. Provo sërish.')); }
    finally { if (alive.current) setDeleting(false); }
  }

  return <section className="tmd-downloads" aria-labelledby={headingId}>
    <header className="tmd-heading"><span><Icon name="map" size={21}/></span><div><h3 id={headingId}>{copy('İnternetsiz haritam', 'My offline maps', 'Hartat e mia pa internet')}</h3><p>{copy('İndirdiğin bölge, yolculukta yanında.', 'Keep a region with you on your trip.', 'Mbaje një zonë me vete në udhëtim.')}</p></div><strong>{packs.length}/3</strong></header>
    <div className="tmd-region"><Icon name="map" size={20}/><div><span>{copy('İndirilecek bölge', 'Region to download', 'Zona për shkarkim')}</span><strong>{currentName}</strong><small>{center.latitude.toFixed(3)}, {center.longitude.toFixed(3)}</small></div></div>
    <fieldset className="tmd-radius" disabled={busy || deleting}><legend>{copy('Çevresindeki alan', 'Area around it', 'Zona përreth')}</legend><div>{([1, 2, 3] as const).map(value => <button key={value} type="button" aria-pressed={radius === value} onClick={() => setRadius(value)}>{value} km</button>)}</div></fieldset>
    <p className="tmd-contents">{copy('Sokak haritası ve bu bölgedeki yer bilgileri cihazına indirilir. Konumun GPS ile görünür. Güncel çalışma saatleri ve yeni yol tarifleri için internet gerekir.', 'The street map and place snapshots in this region are saved on your device. GPS can show your location. Live opening hours and new directions need internet.', 'Harta e rrugëve dhe informacioni i vendeve në këtë zonë ruhen në pajisje. GPS mund të tregojë vendndodhjen tënde. Oraret aktuale dhe udhëzimet e reja kërkojnë internet.')}</p>
    {onlineOnlyPlaces>0&&<p className="tmd-contents">{copy('İndirmede OpenStreetMap yerleri kullanılır. Apple Maps arama ayrıntıları bu pakete eklenmez.', 'Downloads use OpenStreetMap places. Apple Maps search details are not included in this pack.', 'Shkarkimet përdorin vendet e OpenStreetMap. Hollësitë e kërkimit Apple Maps nuk përfshihen në paketë.')}</p>}
    <div className="tmd-limit"><span>{copy('Bölge başına en fazla 50 MB', 'Up to 50 MB per region', 'Deri në 50 MB për zonë')}</span><span>{copy('En fazla 3 bölge', 'Up to 3 regions', 'Deri në 3 zona')}</span></div>
    {listError && <div className="tmd-warning" role="alert"><p>{listError}</p><button type="button" disabled={busy} onClick={() => { void refresh(); }}>{copy('Tekrar dene', 'Retry', 'Provo sërish')}</button></div>}
    {atLimit && <p className="tmd-warning">{copy('3 bölge dolu. Yenisi için aşağıdan bir indirmeyi kaldır.', 'All 3 regions are used. Remove a download below to add another.', 'Të 3 zonat janë përdorur. Hiq një shkarkim më poshtë për të shtuar një tjetër.')}</p>}
    {busy ? <div className="tmd-progress" role="status" aria-live="polite"><strong>{progress.name}</strong><div><span>{megabytes(progress.bytes)} · {progress.count} {copy('dosya', 'files', 'skedarë')}</span><button type="button" onClick={() => controller.current?.abort()}>{copy('İptal et', 'Cancel', 'Anulo')}</button></div><progress value={progress.bytes} max={OPEN_MAP_MAX_BYTES} aria-label={copy('İndirilen veri, 50 MB sınırı', 'Downloaded data, 50 MB limit', 'Të dhënat e shkarkuara, kufiri 50 MB')}/></div>
      : <button type="button" className="tmd-download-button" disabled={atLimit || loading || !!listError || deleting} onClick={() => { void download(); }}><Icon name="cloud" size={19}/>{error ? copy('Tekrar indir', 'Retry download', 'Provo shkarkimin sërish') : copy('Bu bölgeyi indir', 'Download this region', 'Shkarko këtë zonë')}</button>}
    {error && <p className="tmd-warning" role="alert">{error}</p>}
    <p className="tmd-status" role="status" aria-live="polite">{status}</p>
    {loading && <p className="tmd-contents" role="status">{copy('İndirilen haritalar açılıyor…', 'Loading downloaded maps…', 'Po ngarkohen hartat e shkarkuara…')}</p>}
    {packs.length > 0 && <ul className="tmd-packs">{packs.map(pack => <li key={pack.id}><button type="button" className="tmd-open-pack" disabled={!!opening || deleting} onClick={() => { void open(pack); }}><Icon name="map" size={21}/><span><strong>{pack.name}</strong><small>{pack.radiusKm} km · {megabytes(pack.bytes)} · {formatAppDate(new Date(pack.createdAt), locale, { day: 'numeric', month: 'short' })}</small></span><Icon name="chevron" size={17}/></button><button type="button" className="tmd-remove" disabled={busy || deleting} onClick={() => setConfirmDelete(pack)} aria-label={copy(`${pack.name} indirmesini kaldır`, `Remove download ${pack.name}`, `Hiq shkarkimin ${pack.name}`)}><Icon name="trash" size={18}/></button></li>)}</ul>}
    {confirmDelete && <div className="tmd-confirm" role="alertdialog" aria-labelledby={confirmId}><strong id={confirmId}>{copy(`${confirmDelete.name} indirilenlerden kaldırılsın mı?`, `Remove ${confirmDelete.name} from downloads?`, `Të hiqet ${confirmDelete.name} nga shkarkimet?`)}</strong><p>{copy('Bu bölgenin internetsiz haritası silinir. Kayıtlı yerlerin ve notların korunur.', 'The offline map for this region is deleted. Your saved places and notes are kept.', 'Harta pa internet për këtë zonë fshihet. Vendet dhe shënimet e ruajtura mbeten.')}</p><div><button type="button" disabled={deleting} onClick={() => setConfirmDelete(null)}>{copy('Vazgeç', 'Cancel', 'Anulo')}</button><button type="button" disabled={deleting} onClick={() => { void remove(); }}>{deleting ? copy('Kaldırılıyor…', 'Removing…', 'Po hiqet…') : copy('İndirmeyi kaldır', 'Remove download', 'Hiq shkarkimin')}</button></div></div>}
    {legacy.length > 0 && <div className="tmd-legacy"><h4>{copy('Önceki haritaların', 'Your previous maps', 'Hartat e mëparshme')}</h4><p>{copy('Önceden indirdiklerin de korunuyor.', 'Your previous downloads are kept too.', 'Shkarkimet e mëparshme ruhen gjithashtu.')}</p>{legacy.map(pack => <button key={pack.id} type="button" onClick={() => onOpenLegacy(pack)}><Icon name="map" size={18}/><span>{pack.center.latitude.toFixed(2)}, {pack.center.longitude.toFixed(2)}<small>{formatAppDate(new Date(pack.downloadedAt), locale, { day: 'numeric', month: 'short' })} · {pack.places.length} {copy('yer', 'places', 'vende')}</small></span><Icon name="chevron" size={16}/></button>)}</div>}
  </section>;
}
