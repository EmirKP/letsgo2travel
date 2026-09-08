export type PublicConfig = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supportEmail: string;
  appVersion: string;
  buildNumber: string;
  sourceCommit: string;
  updateId: string;
  appleAuthEnabled: boolean;
};
declare const __L2T_CONFIG__: PublicConfig | undefined;

const injected = typeof __L2T_CONFIG__ !== "undefined" ? __L2T_CONFIG__ : undefined;
// Shared web screens call their own deployment, native builds use injected API.
const webOrigin = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol) && !window.Capacitor?.isNativePlatform?.() ? window.location.origin : "https://www.letsgo2travel.com.tr";

export const config: PublicConfig = {
  apiBaseUrl: (injected?.apiBaseUrl || webOrigin).replace(/\/$/, ""),
  supabaseUrl: injected?.supabaseUrl || "",
  supabaseAnonKey: injected?.supabaseAnonKey || "",
  supportEmail: injected?.supportEmail || "hello@letsgo2travel.com.tr",
  appVersion: injected?.appVersion || "1.4.0",
  buildNumber: injected?.buildNumber || "27",
  sourceCommit: injected?.sourceCommit || "unknown",
  updateId: injected?.updateId || "unknown",
  appleAuthEnabled: injected?.appleAuthEnabled !== false,
};

export const releaseId = `${config.appVersion}-${config.buildNumber}`;

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
