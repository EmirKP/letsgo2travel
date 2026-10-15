import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { addPluginListener, isIOSNative, plugin } from '../lib/capacitor';
import { createId } from '../lib/id';
import { useI18n } from '../lib/i18n';
import { getThemeSnapshot, subscribeTheme } from '../lib/theme';
import type { JourneyMapProps, JourneyMapViewport } from './journeyMapTypes';
import './journey-map.css';

// All mounted editors share one native surface. An earlier delayed show must
// finish and be hidden before a newer editor can show, including Strict Mode.
let nativeQueue: Promise<void> = Promise.resolve();
let foregroundSession: string | null = null;
let lastGeneration = 0;
function bridgeDeadline<T>(promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Native map did not respond')), 8000);
    promise.then(value => { window.clearTimeout(timer); resolve(value); }, error => { window.clearTimeout(timer); reject(error); });
  });
}
function serialize(operation: () => Promise<void>) {
  const pending = nativeQueue.then(operation, operation);
  nativeQueue = pending.catch(() => {});
  return pending;
}

type Listener = { remove: () => Promise<void> };
type Rectangle = { x: number; y: number; width: number; height: number };
const inset = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1000, value)) : 0;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const coordinate = (value: unknown): value is { latitude: number; longitude: number } => {
  const point = value as Record<string, unknown> | null;
  return !!point && numeric(point.latitude) && numeric(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
};
function viewportEvent(value: Record<string, unknown>): JourneyMapViewport | null {
  const bounds = value.bounds as Record<string, unknown> | null;
  if (!coordinate(value.center) || !bounds || !numeric(value.zoom) || value.zoom < 0 || value.zoom > 22
    || !numeric(bounds.north) || !numeric(bounds.south) || bounds.north < bounds.south || bounds.north > 90 || bounds.south < -90
    || !numeric(bounds.east) || !numeric(bounds.west) || Math.abs(bounds.east) > 180 || Math.abs(bounds.west) > 180) return null;
  return { center: { ...value.center }, bounds: { north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west }, zoom: value.zoom };
}

function measuredLayout(canvas: HTMLElement, props: JourneyMapProps) {
  const viewport = window.visualViewport;
  const offsetX = viewport?.offsetLeft ?? 0, offsetY = viewport?.offsetTop ?? 0;
  const measure = (element: Element): Rectangle => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left - offsetX, y: rect.top - offsetY, width: rect.width, height: rect.height };
  };
  const frame = measure(canvas);
  const workspace = canvas.closest('.mj-workspace');
  const panel = workspace?.querySelector('.mj-panel');
  const panelRect = panel ? measure(panel) : null;
  const intersects = (a: Rectangle, b: Rectangle) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const shortened = !!panelRect && panelRect.width > frame.width * 0.7 && intersects(frame, panelRect);
  if (shortened && panelRect) frame.height = Math.max(0, Math.min(frame.height, panelRect.y - frame.y));
  const elements = workspace ? Array.from(workspace.querySelectorAll('.mj-topbar,.mj-day-tabs,.mj-area-search')) : [];
  if (panel && !shortened) elements.push(panel);
  const occlusions = elements.flatMap(element => {
    const rect = measure(element);
    if (!intersects(frame, rect) || rect.width <= 0 || rect.height <= 0) return [];
    const radius = parseFloat(window.getComputedStyle(element).borderTopLeftRadius) || 0;
    return [{ ...rect, radius: Math.max(0, Math.min(300, radius)) }];
  }).slice(0, 12);
  const parentBottom = inset(props.contentInsets?.bottom);
  return {
    frame: { ...frame, viewportWidth: viewport?.width || document.documentElement.clientWidth || window.innerWidth },
    occlusions,
    // The mobile panel has already been removed from the native frame. Applying
    // its bottom padding again would push every route into the top toolbar.
    contentInsets: { top: inset(props.contentInsets?.top), right: inset(props.contentInsets?.right),
      bottom: shortened ? 0 : parentBottom, left: inset(props.contentInsets?.left) },
    observed: [canvas, ...(workspace ? [workspace] : []), ...elements, ...(panel ? [panel] : [])],
  };
}

/** Real on-device MapKit; this component never starts discovery, routing or GPS. */
export function NativeJourneyMap(props: JourneyMapProps) {
  const { copy } = useI18n();
  const canvas = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  useLayoutEffect(() => { current.current = props; });
  const schedule = useRef<() => void>(() => {});
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const owner = props.ownerId ? `user:${props.ownerId}` : 'guest';

  useEffect(() => {
    let disposed = false;
    let nativeVisibility: Listener | null = null;
    const visibility = () => setVisible(document.visibilityState !== 'hidden');
    const pageHide = () => setVisible(false);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', visibility);
    void addPluginListener('App', 'appStateChange', value => {
      if (!disposed && typeof value.isActive === 'boolean') setVisible(value.isActive && document.visibilityState !== 'hidden');
    }).then(listener => {
      if (disposed) void listener?.remove().catch(() => {});
      else nativeVisibility = listener;
    });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', visibility);
      void nativeVisibility?.remove().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const bridge = plugin('AppleJourneyMap');
    if (!isIOSNative() || !bridge?.show || !bridge.update || !bridge.hide) { setStatus('failed'); return; }
    const sessionId = createId();
    const generation = Math.max(Date.now(), lastGeneration + 1);
    lastGeneration = generation;
    const identity = { sessionId, ownerId: owner, generation };
    foregroundSession = sessionId;
    let disposed = false, failed = false, listenersReady = false, nativeShown = false;
    let busy = false, dirty = false, revision = 0, animationFrame = 0, lastState = '';
    const listeners: Listener[] = [];
    const observed = new Set<Element>();
    const active = () => !disposed && !failed && foregroundSession === sessionId
      && (current.current.ownerId ? `user:${current.current.ownerId}` : 'guest') === owner;
    const hide = async () => { await bridgeDeadline(bridge.hide(identity)); nativeShown = false; };
    const fail = () => {
      if (!active()) return;
      failed = true;
      setStatus('failed');
      void serialize(hide).catch(() => {});
    };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => requestUpdate()) : null;
    const observe = (elements: Element[]) => {
      const next = new Set(elements);
      for (const element of observed) if (!next.has(element)) { resize?.unobserve(element); observed.delete(element); }
      for (const element of next) if (!observed.has(element)) { observed.add(element); resize?.observe(element); }
    };
    const refresh = () => {
      if (!active() || !listenersReady) return;
      dirty = true;
      if (busy) return;
      busy = true;
      void serialize(async () => {
        if (!active() || !canvas.current) return;
        dirty = false;
        const latest = current.current;
        const layout = measuredLayout(canvas.current, latest);
        observe(layout.observed);
        const cluster = latest.labels.cluster(0).replace('0', '{count}');
        const payload = {
          ...identity, frame: layout.frame, occlusions: layout.occlusions, contentInsets: layout.contentInsets,
          center: latest.center, stops: latest.stops.map(stop => ({ ...stop, label: latest.labels.stop(stop.order, stop.day, stop.name) })),
          discoveredPlaces: (latest.discoveredPlaces ?? []).map(point => ({ ...point, label: latest.labels.place(point.name) })),
          routes: latest.routes ?? [], activeDay: latest.activeDay ?? null, selectedPlaceId: latest.selectedPlaceId ?? null,
          theme: getThemeSnapshot().resolved, searchEnabled: latest.searchEnabled !== false, showSearchArea: false,
          labels: { map: latest.labels.map, zoomIn: latest.labels.zoomIn, zoomOut: latest.labels.zoomOut,
            searchArea: latest.searchAreaLabel || latest.labels.map, cluster },
        };
        const key = JSON.stringify(payload);
        if (key === lastState && nativeShown) return;
        const operation = nativeShown ? bridge.update : bridge.show;
        await bridgeDeadline(operation.call(bridge, { ...payload, revision: ++revision }));
        nativeShown = true;
        if (!active()) { await hide(); return; }
        lastState = key;
        setStatus('ready');
      }).catch(fail).finally(() => {
        busy = false;
        if (dirty && active()) requestUpdate();
      });
    };
    function requestUpdate() {
      if (!active() || animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => { animationFrame = 0; refresh(); });
    }
    schedule.current = requestUpdate;
    setStatus('loading');
    const event = (handler: (value: Record<string, unknown>) => void) => (value: Record<string, unknown>) => {
      if (active() && value.sessionId === sessionId) handler(value);
    };
    const registrations = [
      addPluginListener('AppleJourneyMap', 'placeSelected', event(value => {
        const latest = current.current;
        if (typeof value.id !== 'string' || !['stop', 'discovered'].includes(String(value.kind))) return;
        const points = value.kind === 'stop' ? latest.stops.filter(point => latest.activeDay == null || point.day === latest.activeDay) : latest.discoveredPlaces ?? [];
        const point = points.find(point => point.id === value.id);
        if (point) latest.onSelectPlace(point, value.kind as 'stop' | 'discovered');
      })),
      addPluginListener('AppleJourneyMap', 'viewportChanged', event(value => {
        const viewport = viewportEvent(value);
        if (viewport) current.current.onViewportChange?.(viewport);
      })),
      addPluginListener('AppleJourneyMap', 'searchArea', event(() => {
        if (current.current.searchEnabled !== false) current.current.onSearchArea?.();
      })),
      addPluginListener('AppleJourneyMap', 'mapError', event(fail)),
    ];
    for (const registration of registrations) void registration.then(listener => {
      if (!listener) return;
      if (disposed) void listener.remove().catch(() => {});
      else listeners.push(listener);
    });
    void Promise.all(registrations).then(values => {
      if (!active()) return;
      if (values.some(value => !value)) { fail(); return; }
      listenersReady = true;
      requestUpdate();
    }).catch(fail);
    const unsubscribeTheme = subscribeTheme(requestUpdate);
    window.addEventListener('resize', requestUpdate);
    window.addEventListener('scroll', requestUpdate, true);
    window.visualViewport?.addEventListener('resize', requestUpdate);
    window.visualViewport?.addEventListener('scroll', requestUpdate);
    return () => {
      disposed = true;
      if (foregroundSession === sessionId) foregroundSession = null;
      schedule.current = () => {};
      window.cancelAnimationFrame(animationFrame);
      resize?.disconnect();
      unsubscribeTheme();
      window.removeEventListener('resize', requestUpdate);
      window.removeEventListener('scroll', requestUpdate, true);
      window.visualViewport?.removeEventListener('resize', requestUpdate);
      window.visualViewport?.removeEventListener('scroll', requestUpdate);
      for (const listener of listeners) void listener.remove().catch(() => {});
      // Always hide this exact scope, even when show has not resolved yet.
      void serialize(hide).catch(() => {});
    };
  }, [owner, attempt, visible]);

  useEffect(() => { schedule.current(); });

  return <div className="journey-map-shell">
    <div className="journey-map-canvas" ref={canvas} role="region" aria-label={props.labels.map} />
    {visible && status !== 'ready' && <div className="journey-map-tile-error" role="status"
      style={{ top: Math.max(12, inset(props.contentInsets?.top) + 12), right: 12 }}>
      <span>{status === 'failed' ? props.labels.tilesUnavailable : copy('Apple Haritalar açılıyor…', 'Opening Apple Maps…', 'Po hapet Apple Maps…')}</span>
      {status === 'failed' && <button type="button" onClick={() => setAttempt(value => value + 1)}>{props.labels.retryTiles}</button>}
    </div>}
  </div>;
}
