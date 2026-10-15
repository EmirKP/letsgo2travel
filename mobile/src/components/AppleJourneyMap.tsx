import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { AppleMapKitError, loadAppleMapKit, subscribeAppleMapAuthorizationErrors } from '../lib/appleMapKit';
import { getJourneyMapAuthorization, invalidateJourneyMapAuthorization } from '../lib/appleMapAuthorization';
import type { AppleAnnotation, AppleCoordinate, AppleMap, AppleMapKit, AppleMapListener, ApplePadding } from '../lib/appleMapKit';
import type { JourneyMapPoint, JourneyMapProps, JourneyMapViewport } from './journeyMapTypes';
import { safeJourneyPhotoUrl } from '../../../lib/travel-assistant/places';
import './journey-map.css';

const DAY_COLORS = ['#175fe6', '#b6419b', '#008271', '#b86100', '#744ac2', '#b73d42', '#1276a1'];
const valid = (point: AppleCoordinate) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
const validDay = (day: number) => Number.isSafeInteger(day) && day > 0;
const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];
const longitude = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
const inset = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
const coordinate = (kit: AppleMapKit, point: AppleCoordinate) => new kit.Coordinate(point.latitude, point.longitude);
type AnnotationEntry = { point: JourneyMapPoint; kind: 'stop' | 'discovered'; select: (selected: boolean) => void };
function stylePhotoSelection(pin: HTMLElement, selected: boolean) {
  pin.style.border = `3px solid ${selected ? '#0864f1' : '#ffffff'}`;
  pin.style.boxShadow = selected ? '0 0 0 3px #ffdc30,0 4px 12px #172e5040' : '0 4px 12px #172e5040';
}
function photoPin(url: string, color: string, order: number | undefined, selected: boolean) {
  const pin = document.createElement('div');
  Object.assign(pin.style, { position: 'relative', width: '56px', height: '56px', borderRadius: '50%', border: `3px solid ${selected ? '#0864f1' : '#ffffff'}`,
    background: color, color: '#ffffff', boxSizing: 'border-box', boxShadow: selected ? '0 0 0 3px #ffdc30,0 4px 12px #172e5040' : '0 4px 12px #172e5040',
    display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 18px/1 system-ui,sans-serif' });
  pin.textContent = order === undefined ? '•' : String(order);
  pin.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.alt = ''; image.src = url; image.referrerPolicy = 'no-referrer'; image.draggable = false;
  Object.assign(image.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' });
  image.onerror = () => { image.remove(); };
  pin.appendChild(image);
  if (order !== undefined) {
    const badge = document.createElement('span'); badge.textContent = String(order);
    Object.assign(badge.style, { position: 'absolute', top: '-9px', right: '-9px', minWidth: '23px', height: '23px', padding: '0 4px', border: '2px solid #ffffff', borderRadius: '12px', boxSizing: 'border-box', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 11px/1 system-ui,sans-serif' });
    pin.appendChild(badge);
  }
  return pin;
}
function region(kit: AppleMapKit, point: AppleCoordinate, span: number) {
  return new kit.CoordinateRegion(coordinate(kit, point), new kit.CoordinateSpan(span, span));
}
function visibleStops(props: JourneyMapProps) {
  const seen = new Set<string>();
  return props.stops.filter(stop => {
    if (!stop.id || seen.has(stop.id) || !valid(stop) || !validDay(stop.day) || !Number.isSafeInteger(stop.order)
      || stop.order < 1 || (props.activeDay != null && stop.day !== props.activeDay)) return false;
    seen.add(stop.id); return true;
  });
}
function visiblePlaces(props: JourneyMapProps) {
  const seen = new Set(props.stops.map(stop => stop.id));
  return (props.discoveredPlaces ?? []).filter(point => {
    if (!point.id || seen.has(point.id) || !valid(point)) return false;
    seen.add(point.id); return true;
  });
}

/** An actual Apple Maps canvas; discovery/routing remain explicit actions owned by its parent. */
export function AppleJourneyMap(props: JourneyMapProps) {
  const { copy, locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  useLayoutEffect(() => { current.current = props; });
  const map = useRef<AppleMap | null>(null);
  const kit = useRef<AppleMapKit | null>(null);
  const entries = useRef(new Map<AppleAnnotation, AnnotationEntry>());
  const selectedAnnotationId = useRef<string | null>(null);
  const syncing = useRef(false);
  const camera = useRef<{ center: string; stops: string } | null>(null);
  const selection = useRef('');
  const annotationKey = useRef('');
  const routeKey = useRef('');
  const paddingKey = useRef('');
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(0);
  const [sizeRevision, setSizeRevision] = useState(0);
  const [error, setError] = useState<'missing_configuration' | 'unavailable' | null>(null);

  useEffect(() => {
    let disposed = false;
    let instance: AppleMap | null = null;
    let namespace: AppleMapKit | null = null;
    let report: (() => void) | undefined;
    let select: AppleMapListener | undefined;
    let failed: AppleMapListener | undefined;
    let observer: ResizeObserver | undefined;
    setError(null);
    setReady(0);
    if (attempt > 0) invalidateJourneyMapAuthorization();
    const unsubscribeAuthorization = subscribeAppleMapAuthorizationErrors(failure => { if (!disposed) setError(failure.code); });
    void loadAppleMapKit(getJourneyMapAuthorization, locale, attempt > 0).then(loaded => {
      if (disposed || !host.current) return;
      namespace = loaded;
      const initial = valid(current.current.center) ? current.current.center : { latitude: 20, longitude: 0 };
      instance = new loaded.Map(host.current, {
        region: region(loaded, initial, valid(current.current.center) ? 0.08 : 120),
        mapType: loaded.MapType.MutedStandard,
        colorScheme: loaded.ColorScheme.Adaptive,
        tintColor: '#0864f1',
        showsMapTypeControl: false, showsZoomControl: true,
        showsCompass: loaded.FeatureVisibility.Hidden, showsScale: loaded.FeatureVisibility.Hidden,
        isRotationEnabled: false, showsUserLocation: false, tracksUserLocation: false, showsUserLocationControl: false,
        annotationForCluster: (cluster: AppleAnnotation) => {
          const count = cluster.memberAnnotations?.length ?? 0;
          cluster.title = current.current.labels.cluster(count);
          cluster.accessibilityLabel = cluster.title;
          cluster.glyphText = String(count);
          return cluster;
        },
      });
      const activeMap = instance;
      map.current = activeMap;
      kit.current = loaded;
      let lastViewport = '';
      report = () => {
        if (disposed) return;
        const { center, span } = activeMap.region;
        if (!valid({ latitude: center.latitude, longitude: longitude(center.longitude) })
          || !Number.isFinite(span.latitudeDelta) || !Number.isFinite(span.longitudeDelta)
          || span.latitudeDelta <= 0 || span.longitudeDelta <= 0) return;
        // MapKit exposes geographic spans rather than a slippy-map zoom. The equivalent
        // longitudinal zoom is only viewport metadata; it never drives routing or discovery.
        const viewport: JourneyMapViewport = {
          center: { latitude: center.latitude, longitude: longitude(center.longitude) },
          bounds: { north: Math.min(90, center.latitude + span.latitudeDelta / 2), south: Math.max(-90, center.latitude - span.latitudeDelta / 2),
            east: span.longitudeDelta >= 360 ? 180 : longitude(center.longitude + span.longitudeDelta / 2),
            west: span.longitudeDelta >= 360 ? -180 : longitude(center.longitude - span.longitudeDelta / 2) },
          zoom: Math.max(0, Math.min(22, Math.log2(360 / span.longitudeDelta))),
        };
        const key = JSON.stringify(viewport);
        if (lastViewport !== key) { lastViewport = key; current.current.onViewportChange?.(viewport); }
      };
      select = event => {
        if (disposed || syncing.current || !event.annotation) return;
        const chosen = entries.current.get(event.annotation);
        if (chosen) {
          if (chosen.point.id !== current.current.selectedPlaceId) current.current.onSelectPlace(chosen.point, chosen.kind);
        } else if (event.annotation.memberAnnotations?.length) {
          const members = event.annotation.memberAnnotations.filter(item => entries.current.has(item));
          if (members.length) activeMap.showItems(members, { animate: false });
        }
      };
      failed = () => { if (!disposed) setError('unavailable'); };
      activeMap.addEventListener('region-change-end', report);
      activeMap.addEventListener('select', select);
      loaded.addEventListener('error', failed);
      // MapKit observes its own container size. We only report the changed geographic
      // viewport, without rebuilding the map or resetting the user's camera.
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => { if (!disposed) { report?.(); setSizeRevision(value => value + 1); } });
        observer.observe(host.current);
      }
      report();
      setReady(attempt + 1);
    }).catch(failure => { if (!disposed) setError(failure instanceof AppleMapKitError ? failure.code : 'unavailable'); });
    return () => {
      disposed = true;
      unsubscribeAuthorization();
      observer?.disconnect();
      if (instance) {
        if (report) instance.removeEventListener('region-change-end', report);
        if (select) instance.removeEventListener('select', select);
        instance.destroy();
      }
      if (namespace && failed) namespace.removeEventListener('error', failed);
      map.current = null; kit.current = null; entries.current.clear();
      camera.current = null; selection.current = ''; annotationKey.current = ''; routeKey.current = ''; paddingKey.current = '';
      selectedAnnotationId.current = null;
    };
  }, [attempt]);

  useEffect(() => { if (kit.current) kit.current.language = locale; }, [locale, ready]);

  useEffect(() => {
    const m = map.current, api = kit.current;
    if (!m || !api || !ready) return;
    const stops = visibleStops(props);
    const places = visiblePlaces(props);
    const padding: ApplePadding = { top: inset(props.contentInsets?.top), right: inset(props.contentInsets?.right), bottom: inset(props.contentInsets?.bottom), left: inset(props.contentInsets?.left) };
    // A nearly full-height panel or a keyboard can leave less room than the
    // requested insets. MapKit must always receive a nonnegative visible frame.
    const width = host.current?.clientWidth ?? 0, height = host.current?.clientHeight ?? 0;
    const horizontal = Math.min(1, Math.max(0, width - 40) / Math.max(1, padding.left + padding.right));
    const vertical = Math.min(1, Math.max(0, height - 40) / Math.max(1, padding.top + padding.bottom));
    padding.left *= horizontal; padding.right *= horizontal; padding.top *= vertical; padding.bottom *= vertical;
    const nextPadding = JSON.stringify(padding);
    if (paddingKey.current !== nextPadding) { paddingKey.current = nextPadding; m.padding = new api.Padding(padding.top, padding.right, padding.bottom, padding.left); }
    const nextAnnotations = JSON.stringify([
      stops.map(stop => [stop.id, stop.latitude, stop.longitude, stop.day, stop.order, stop.imageUrl, props.labels.stop(stop.order, stop.day, stop.name)]),
      places.map(place => [place.id, place.latitude, place.longitude, place.imageUrl, props.labels.place(place.name)]),
    ]);
    syncing.current = true;
    try {
      const changed = annotationKey.current !== nextAnnotations;
      const nextSelectedId = props.selectedPlaceId ?? null;
      if (changed) {
        annotationKey.current = nextAnnotations;
        const nextEntries = new Map<AppleAnnotation, AnnotationEntry>();
        const stopById = new Map(stops.map(stop => [stop.id, stop]));
        for (const point of [...stops, ...places]) {
          const stop = stopById.get(point.id);
          let selected = point.id === nextSelectedId;
          const label = stop ? props.labels.stop(stop.order, stop.day, point.name) : props.labels.place(point.name);
          const color = stop ? dayColor(stop.day) : selected ? '#0065f5' : '#536579';
          const options = {
            title: point.name, accessibilityLabel: label, animates: false, draggable: false,
            calloutEnabled: false, selected, enabled: true,
            clusteringIdentifier: stop || selected ? null : 'journey-discovery',
            color,
            glyphText: stop ? String(stop.order) : '•', glyphColor: '#ffffff',
            titleVisibility: api.FeatureVisibility.Hidden, subtitleVisibility: api.FeatureVisibility.Hidden,
            displayPriority: stop || selected ? 1000 : 750,
          };
          const photo = safeJourneyPhotoUrl(point.imageUrl);
          let pin: HTMLElement | undefined;
          const marker = photo ? new api.Annotation(coordinate(api, point), () => {
            pin = photoPin(photo, stop ? dayColor(stop.day) : selected ? '#0065f5' : '#536579', stop?.order, selected);
            return pin;
          }, options)
            : new api.MarkerAnnotation(coordinate(api, point), options);
          nextEntries.set(marker, { point, kind: stop ? 'stop' : 'discovered', select(value) {
            selected = value;
            marker.selected = value;
            marker.color = stop ? dayColor(stop.day) : value ? '#0065f5' : '#536579';
            marker.clusteringIdentifier = stop || value ? null : 'journey-discovery';
            marker.displayPriority = stop || value ? 1000 : 750;
            if (pin) { stylePhotoSelection(pin, value); pin.style.background = marker.color; }
          } });
        }
        entries.current = nextEntries;
        m.annotations = [...nextEntries.keys()];
      }
      if (changed || selectedAnnotationId.current !== nextSelectedId) {
        for (const entry of entries.current.values()) {
          if (entry.point.id === selectedAnnotationId.current || entry.point.id === nextSelectedId) entry.select(entry.point.id === nextSelectedId);
        }
        selectedAnnotationId.current = nextSelectedId;
        m.selectedAnnotation = [...entries.current].find(([, entry]) => entry.point.id === nextSelectedId)?.[0] ?? null;
      }
    } finally { syncing.current = false; }
    const routes = (props.routes ?? []).filter(route => validDay(route.day) && (props.activeDay == null || route.day === props.activeDay)
      && route.coordinates.length >= 2 && route.coordinates.length <= 20_000 && route.coordinates.every(pair => Array.isArray(pair)
        && pair.length === 2 && valid({ latitude: pair[0], longitude: pair[1] })));
    const nextRoutes = JSON.stringify(routes);
    if (routeKey.current !== nextRoutes) {
      routeKey.current = nextRoutes;
      m.overlays = routes.flatMap(route => {
        // Unwrap adjacent longitudes so confirmed paths crossing the date line stay short.
        let previous: number | undefined;
        const points = route.coordinates.map(([latitude, lon]) => {
          if (previous !== undefined) { while (lon - previous > 180) lon -= 360; while (lon - previous < -180) lon += 360; }
          previous = lon; return new api.Coordinate(latitude, lon);
        });
        return [new api.PolylineOverlay(points, { enabled: false, style: new api.Style({ lineWidth: 8, strokeColor: '#ffffff', strokeOpacity: 0.95, lineCap: 'round', lineJoin: 'round' }) }),
          new api.PolylineOverlay(points, { enabled: false, style: new api.Style({ lineWidth: 5, strokeColor: dayColor(route.day), strokeOpacity: 0.9, lineCap: 'round', lineJoin: 'round' }) })];
      });
    }
    const centerKey = JSON.stringify([props.center.latitude, props.center.longitude]);
    const stopsKey = JSON.stringify([props.activeDay, stops.map(stop => [stop.id, stop.latitude, stop.longitude])]);
    if (camera.current?.center !== centerKey || camera.current?.stops !== stopsKey) {
      const explicitCenter = camera.current && camera.current.center !== centerKey && camera.current.stops === stopsKey;
      camera.current = { center: centerKey, stops: stopsKey };
      if (explicitCenter && valid(props.center)) m.setRegionAnimated(region(api, props.center, 0.04), false);
      else if (stops.length > 1) m.showItems([...entries.current].filter(([, entry]) => entry.kind === 'stop').map(([annotation]) => annotation), { animate: false, padding: new api.Padding(40, 40, 40, 40) });
      else if (stops.length === 1) m.setRegionAnimated(region(api, stops[0], 0.02), false);
      else if (valid(props.center)) m.setRegionAnimated(region(api, props.center, 0.08), false);
    }
    const selected = [...entries.current.values()].find(entry => entry.point.id === props.selectedPlaceId)?.point;
    const selectedKey = selected ? JSON.stringify([selected.id, selected.latitude, selected.longitude]) : '';
    if (selection.current !== selectedKey) {
      selection.current = selectedKey;
      if (selected) m.setCenterAnimated(coordinate(api, selected), false);
    }
  }, [props, ready, sizeRevision]);

  const message = error === 'missing_configuration'
    ? copy('Apple Haritalar henüz kullanıma hazır değil. Seyahat planını listeden düzenleyebilirsin.', 'Apple Maps is not set up yet. You can still edit your itinerary in the list.', 'Apple Maps nuk është konfiguruar ende. Mund ta ndryshosh itinerarin në listë.')
    : error ? copy('Apple Haritalar yüklenemedi. Planın korundu; haritayı tekrar deneyebilirsin.', 'Apple Maps could not load. Your plan is kept; try the map again.', 'Apple Maps nuk u ngarkua. Plani u ruajt; provo hartën përsëri.')
      : copy('Apple Haritalar yükleniyor…', 'Loading Apple Maps…', 'Po ngarkohet Apple Maps…');
  return <div className="journey-map-shell">
    <div className="journey-map-canvas" ref={host} role="region" aria-label={props.labels.map} />
    {(error || !ready) && <div className="journey-map-tile-error" role="status" style={{ top: Math.max(12, inset(props.contentInsets?.top) + 12), right: 12 }}>
      <span>{message}</span>
      {error && <button type="button" onClick={() => setAttempt(value => value + 1)}>{props.labels.retryTiles}</button>}
    </div>}
  </div>;
}
