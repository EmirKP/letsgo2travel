import type { WelcomeIntent } from './onboardingPreferences';

const GUIDE_KEY = 'l2t.mobile.context-guide.v1';
const AUTH_KEY = 'l2t.mobile.welcome-auth.v1';
export const GUIDE_IDS = ['search', 'start', 'events', 'eventSearch', 'eventSaved', 'destination', 'days', 'edit', 'discover', 'save', 'library', 'toolSearch', 'plans', 'community', 'tools', 'profile', 'exploreSearch', 'explorePlace', 'exploreSave', 'exploreBack', 'savedCountries', 'savedCountryOpen', 'savedRouteOpen', 'travelCountry', 'travelTool', 'eventSave'] as const;
export type GuideId = typeof GUIDE_IDS[number];
export const GUIDE_TASKS = ['inspiration', 'routeExample', 'events', 'saved', 'onTrip'] as const;
export type GuideTask = typeof GUIDE_TASKS[number];
export type GuideProgress = { active: boolean; seen: GuideId[]; skipped?: GuideId[]; task?: GuideTask };
let sessionProgress: GuideProgress | undefined;
const TASK_STEPS: Record<GuideTask, readonly GuideId[]> = {
  inspiration: ['exploreSearch', 'explorePlace', 'exploreSave', 'exploreBack', 'plans', 'savedCountries', 'savedCountryOpen'],
  routeExample: [],
  events: ['eventSearch', 'eventSave', 'eventSaved'],
  saved: ['library', 'savedRouteOpen'],
  onTrip: ['travelCountry', 'toolSearch', 'travelTool'],
};

export function guideTaskForIntent(intent: WelcomeIntent): GuideTask {
  return intent === 'route' ? 'routeExample' : intent === 'companion' ? 'onTrip' : 'inspiration';
}

/** Each lesson stays on its task instead of falling through to whichever navigation tab is visible. */
export function guideSteps(task: GuideTask): readonly GuideId[] {
  return TASK_STEPS[task];
}

function normalizeProgress(raw: unknown): GuideProgress {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const seen: unknown[] = Array.isArray(value.seen) ? value.seen : [];
  const skipped: unknown[] | undefined = Array.isArray(value.skipped) ? value.skipped : undefined;
  return {
    active: value.active === true,
    seen: GUIDE_IDS.filter(id => seen.includes(id)),
    ...(skipped ? { skipped: GUIDE_IDS.filter(id => skipped.includes(id) && !seen.includes(id)) } : {}),
    ...(GUIDE_TASKS.includes(value.task as GuideTask) ? { task: value.task as GuideTask } : {}),
  };
}

export function readGuideProgress(): GuideProgress {
  if (sessionProgress) return normalizeProgress(sessionProgress);
  try {
    const raw = JSON.parse(window.localStorage.getItem(GUIDE_KEY) || 'null');
    return normalizeProgress(raw);
  } catch { return { active: false, seen: [] }; }
}

export function saveGuideProgress(progress: GuideProgress) {
  sessionProgress = normalizeProgress(progress);
  try { window.localStorage.setItem(GUIDE_KEY, JSON.stringify(sessionProgress)); } catch { /* Optional device storage. */ }
}

export type WelcomeDestination = WelcomeIntent | 'home';
export function readWelcomeDestination(): WelcomeDestination | null {
  try {
    const value = window.sessionStorage.getItem(AUTH_KEY);
    return value === 'route' || value === 'explore' || value === 'companion' || value === 'home' ? value : null;
  } catch { return null; }
}
/** Only a navigation intent is kept; auth credentials are handled by the existing auth flow. */
export function rememberWelcomeDestination(value: WelcomeDestination | null) {
  try {
    if (value) window.sessionStorage.setItem(AUTH_KEY, value);
    else window.sessionStorage.removeItem(AUTH_KEY);
  } catch { /* The in-memory App state still continues this session. */ }
}
