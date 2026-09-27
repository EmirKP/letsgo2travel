import { getFlightProviderConfig } from "./flight-provider";

export const FLIGHT_LOOKUP_PROTOCOL = 2;
export const FLIGHT_DATA_LIFETIME_MS = 5 * 86400000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Explicit mode prevents a free trial key from enabling lookup for every user. */
export function flightLookupSettings(env: NodeJS.ProcessEnv = process.env) {
  const provider = getFlightProviderConfig(env);
  const limit = Number(env.FLIGHT_LOOKUP_MONTHLY_LIMIT);
  const mode = env.FLIGHT_LOOKUP_MODE;
  if (env.FLIGHT_LOOKUP_ENABLED !== "true" || !provider || !Number.isInteger(limit)
    || limit < 1 || limit > 10000 || (mode !== "trial" && mode !== "commercial")) return null;
  const trialUsers = (env.FLIGHT_LOOKUP_TRIAL_USER_IDS || "").split(",").map(id => id.trim().toLowerCase()).filter(Boolean);
  if (mode === "trial" && (!trialUsers.length || trialUsers.length > 20 || trialUsers.some(id => !uuid.test(id)))) return null;
  if (mode === "commercial" && (env.FLIGHT_LOOKUP_RECEIPT_SECRET?.length || 0) < 32) return null;
  return { provider, limit, mode, trialUsers } as const;
}

export function flightLookupAllowed(settings: NonNullable<ReturnType<typeof flightLookupSettings>>, userId: string) {
  return settings.mode === "commercial" || settings.trialUsers.includes(userId.toLowerCase());
}

export function supportsFlightLookupV2(request: Request) {
  return request.headers.get("X-Flight-Lookup-Version") === String(FLIGHT_LOOKUP_PROTOCOL);
}
