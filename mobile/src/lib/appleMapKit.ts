/** The small MapKit JS surface used by the journey map (official v6 core bundle). */
export interface AppleCoordinate { latitude: number; longitude: number }
export interface AppleRegion { center: AppleCoordinate; span: { latitudeDelta: number; longitudeDelta: number } }
export interface ApplePadding { top: number; right: number; bottom: number; left: number }
export interface AppleAnnotation {
  coordinate: AppleCoordinate;
  title: string;
  accessibilityLabel: string;
  glyphText?: string;
  color?: string;
  selected?: boolean;
  clusteringIdentifier?: string | null;
  displayPriority?: number;
  memberAnnotations?: AppleAnnotation[];
}
export interface AppleMapEvent { status?: string; annotation?: AppleAnnotation }
export type AppleMapListener = (event: AppleMapEvent) => void;
export interface AppleEvents {
  addEventListener(type: string, listener: AppleMapListener): void;
  removeEventListener(type: string, listener: AppleMapListener): void;
}
export interface AppleMap extends AppleEvents {
  center: AppleCoordinate;
  region: AppleRegion;
  padding: ApplePadding;
  annotations: AppleAnnotation[];
  overlays: object[];
  selectedAnnotation: AppleAnnotation | null;
  showItems(items: AppleAnnotation[], options: { animate: boolean; padding?: ApplePadding }): void;
  setCenterAnimated(coordinate: AppleCoordinate, animate: boolean): void;
  setRegionAnimated(region: AppleRegion, animate: boolean): void;
  destroy(): void;
}
export interface AppleMapKit extends AppleEvents {
  language: string;
  init(options: { authorizationCallback: (done: (token: string) => void) => void; language: string; libraries: string[] }): void;
  load?: (libraries: string[]) => Promise<AppleMapKit>;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => AppleMap;
  Coordinate: new (latitude: number, longitude: number) => AppleCoordinate;
  CoordinateSpan: new (latitudeDelta: number, longitudeDelta: number) => AppleRegion['span'];
  CoordinateRegion: new (center: AppleCoordinate, span: AppleRegion['span']) => AppleRegion;
  Padding: new (top: number, right: number, bottom: number, left: number) => ApplePadding;
  MarkerAnnotation: new (coordinate: AppleCoordinate, options: Record<string, unknown>) => AppleAnnotation;
  Annotation: new (coordinate: AppleCoordinate, factory: () => HTMLElement, options: Record<string, unknown>) => AppleAnnotation;
  PolylineOverlay: new (coordinates: AppleCoordinate[], options: Record<string, unknown>) => object;
  Style: new (options: Record<string, unknown>) => object;
  MapType: { MutedStandard: string };
  ColorScheme: { Adaptive: string };
  FeatureVisibility: { Hidden: string };
}

export class AppleMapKitError extends Error {
  readonly code: 'missing_configuration' | 'unavailable';
  constructor(code: 'missing_configuration' | 'unavailable') {
    super(code === 'missing_configuration' ? 'Apple Maps is not configured.' : 'Apple Maps is unavailable.');
    this.name = 'AppleMapKitError';
    this.code = code;
  }
}

const SCRIPT_URL = 'https://cdn.apple-mapkit.com/mk/6/mapkit.core.js';
const DEADLINE_MS = 15_000;
const AUTHORIZATION_DEADLINE_MS = 10_000;
export type AppleMapAuthorization = string | (() => Promise<string>);
type AppleWindow = Window & { mapkit?: AppleMapKit; [callback: `__l2tAppleMapKit${number}`]: (() => void) | undefined };
let corePromise: Promise<AppleMapKit> | null = null;
let initialized: { authorization: AppleMapAuthorization; promise: Promise<AppleMapKit>; pending: boolean } | null = null;
let callbackSequence = 0;
let authorizationRevision = 0;
let stopAuthorization: (() => void) | undefined;
const authorizationErrors = new Set<(error: AppleMapKitError) => void>();

/** Renewal failures happen after initialization too, and must remain visible to the map UI. */
export function subscribeAppleMapAuthorizationErrors(listener: (error: AppleMapKitError) => void) {
  authorizationErrors.add(listener);
  return () => { authorizationErrors.delete(listener); };
}

const usableToken = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 8192 && !value.includes('PRIVATE KEY');

function loadCore(): Promise<AppleMapKit> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new AppleMapKitError('unavailable'));
  const browser = window as unknown as AppleWindow;
  if (browser.mapkit?.init) return Promise.resolve(browser.mapkit);
  if (corePromise) return corePromise;
  const promise = new Promise<AppleMapKit>((resolve, reject) => {
    const script = document.createElement('script');
    const callback = `__l2tAppleMapKit${++callbackSequence}` as const;
    let finished = false;
    const finish = (kit?: AppleMapKit) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.onerror = null;
      // Keep an inert callback after failure: an already downloaded script may still execute.
      browser[callback] = () => {};
      if (kit?.init) { delete browser[callback]; resolve(kit); }
      else { script.remove(); reject(new AppleMapKitError('unavailable')); }
    };
    const timer = setTimeout(() => finish(), DEADLINE_MS);
    browser[callback] = () => finish(browser.mapkit);
    script.src = SCRIPT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-callback', callback);
    script.setAttribute('data-libraries', 'full-map');
    script.onerror = () => finish();
    document.head.appendChild(script);
  });
  corePromise = promise;
  void promise.catch(() => { if (corePromise === promise) corePromise = null; });
  return promise;
}

function authorize(kit: AppleMapKit, authorization: AppleMapAuthorization, language: string, revision: number): Promise<AppleMapKit> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let active = true;
    let authorized = false;
    let loaded = false;
    const credentials = new Set<() => void>();
    const finish = (failure?: AppleMapKitError) => {
      if (settled || (!failure && (!authorized || !loaded))) return;
      settled = true;
      clearTimeout(timer);
      kit.removeEventListener('configuration-change', configured);
      kit.removeEventListener('error', failedEvent);
      kit.removeEventListener('load-error', failedEvent);
      if (failure) {
        active = false;
        credentials.forEach(cancel => cancel()); credentials.clear();
        reject(failure);
      }
      else resolve(kit);
    };
    const configured: AppleMapListener = event => {
      if (event.status === 'Initialized' || event.status === 'Refreshed') { authorized = true; finish(); }
    };
    const failedEvent = () => finish(new AppleMapKitError('unavailable'));
    const timer = setTimeout(failedEvent, DEADLINE_MS);
    kit.addEventListener('configuration-change', configured);
    kit.addEventListener('error', failedEvent);
    kit.addEventListener('load-error', failedEvent);
    stopAuthorization = () => {
      active = false;
      credentials.forEach(cancel => cancel()); credentials.clear();
      finish(new AppleMapKitError('unavailable'));
    };
    const authorizationCallback = (done: (token: string) => void) => {
      if (!active || revision !== authorizationRevision) return;
      if (typeof authorization === 'string') { done(authorization); return; }
      let completed = false;
      const cancel = () => { completed = true; clearTimeout(deadline); credentials.delete(cancel); };
      const reportFailure = (reason: unknown) => {
        if (completed || !active || revision !== authorizationRevision) return;
        cancel();
        const error = reason instanceof AppleMapKitError ? reason : new AppleMapKitError('unavailable');
        if (!settled) finish(error);
        else authorizationErrors.forEach(listener => { try { listener(error); } catch { /* Listener errors cannot reject a MapKit renewal. */ } });
      };
      const deadline = setTimeout(() => reportFailure(new AppleMapKitError('unavailable')), AUTHORIZATION_DEADLINE_MS);
      credentials.add(cancel);
      Promise.resolve().then(authorization).then(token => {
        if (completed || !active || revision !== authorizationRevision) return;
        if (!usableToken(token)) { reportFailure(new AppleMapKitError('missing_configuration')); return; }
        try { done(token); cancel(); } catch (error) { reportFailure(error); }
      }, reportFailure);
    };
    try {
      kit.init({ authorizationCallback, language, libraries: ['full-map'] });
      Promise.resolve(kit.load?.(['full-map'])).then(() => {
        loaded = Boolean(kit.Map && kit.Annotation && kit.MarkerAnnotation && kit.PolylineOverlay && kit.MapType?.MutedStandard);
        finish(loaded ? undefined : new AppleMapKitError('unavailable'));
      }, failedEvent);
    } catch { failedEvent(); }
  });
}

/** Public token or stable renewable provider. Private signing keys never enter the browser. */
export function loadAppleMapKit(authorization: AppleMapAuthorization, language: string, retry = false): Promise<AppleMapKit> {
  if (typeof authorization !== 'function' && !usableToken(authorization)) return Promise.reject(new AppleMapKitError('missing_configuration'));
  if (retry && !initialized?.pending) initialized = null;
  if (!initialized || initialized.authorization !== authorization) {
    stopAuthorization?.(); stopAuthorization = undefined;
    const revision = ++authorizationRevision;
    const promise = loadCore().then(kit => {
      if (revision !== authorizationRevision) throw new AppleMapKitError('unavailable');
      return authorize(kit, authorization, language, revision);
    });
    const state = { authorization, promise, pending: true };
    initialized = state;
    void promise.then(() => { state.pending = false; }, () => { if (initialized === state) initialized = null; });
  }
  return initialized.promise.then(kit => { kit.language = language; return kit; });
}
