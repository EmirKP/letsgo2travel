import type { PlannerInput } from "../types";

const KEY = "l2t.mobile.welcome-preferences.v1";
export const WELCOME_INTERESTS = ["Şehir", "Kültür", "Yeme-içme", "Deniz", "Doğa", "Macera"] as const;
export type WelcomeInterest = typeof WELCOME_INTERESTS[number];
export type WelcomeIntent = "explore" | "route" | "companion";
export type WelcomePreferences = { intent: WelcomeIntent | null; interests: WelcomeInterest[] };
let sessionPreferences: WelcomePreferences | undefined;

function normalize(value: unknown): WelcomePreferences {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const intent = typeof record.intent === "string" && ["explore", "route", "companion"].includes(record.intent) ? record.intent as WelcomeIntent : null;
  const interests = Array.isArray(record.interests)
    ? [...new Set(record.interests.filter((item): item is WelcomeInterest => WELCOME_INTERESTS.includes(item as WelcomeInterest)))].slice(0, 4)
    : [];
  return { intent, interests };
}

export function readWelcomePreferences(): WelcomePreferences {
  if (sessionPreferences) return normalize(sessionPreferences);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* A restricted device can still use this session's choices. */ }
  return normalize(null);
}

export function saveWelcomePreferences(value: WelcomePreferences) {
  sessionPreferences = normalize(value);
  try { window.localStorage.setItem(KEY, JSON.stringify(sessionPreferences)); } catch { /* Setup stays usable without device storage. */ }
}

/** Only new plans use setup defaults; an already edited plan is left intact. */
export function withWelcomeInterests(initial: PlannerInput): PlannerInput {
  const { interests } = readWelcomePreferences();
  return { ...initial, vibe: interests.length ? [...interests] : [...initial.vibe] };
}
