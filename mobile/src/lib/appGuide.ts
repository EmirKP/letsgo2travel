import type { WelcomeIntent } from './onboardingPreferences';

const GUIDE_KEY = 'l2t.mobile.context-guide.v1';
const AUTH_KEY = 'l2t.mobile.welcome-auth.v1';
export const GUIDE_IDS = ['search', 'start', 'events', 'destination', 'days', 'edit', 'discover', 'save', 'plans', 'community', 'tools', 'profile'] as const;
export type GuideId = typeof GUIDE_IDS[number];
export type GuideProgress = { active: boolean; seen: GuideId[] };
let sessionProgress: GuideProgress | undefined;

export function readGuideProgress(): GuideProgress {
  if (sessionProgress) return { ...sessionProgress, seen: [...sessionProgress.seen] };
  try {
    const raw = JSON.parse(window.localStorage.getItem(GUIDE_KEY) || 'null');
    return { active: raw?.active === true, seen: Array.isArray(raw?.seen) ? GUIDE_IDS.filter(id => raw.seen.includes(id)) : [] };
  } catch { return { active: false, seen: [] }; }
}

export function saveGuideProgress(progress: GuideProgress) {
  sessionProgress = { active: progress.active === true, seen: GUIDE_IDS.filter(id => progress.seen.includes(id)) };
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
