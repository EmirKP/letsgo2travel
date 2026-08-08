export type PublicConfig = {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supportEmail: string;
  appVersion: string;
  appleAuthEnabled: boolean;
};

const injected = typeof __L2T_CONFIG__ !== "undefined" ? __L2T_CONFIG__ : undefined;

export const config: PublicConfig = {
  apiBaseUrl: (injected?.apiBaseUrl || "https://www.letsgo2travel.com.tr").replace(/\/$/, ""),
  supabaseUrl: injected?.supabaseUrl || "",
  supabaseAnonKey: injected?.supabaseAnonKey || "",
  supportEmail: injected?.supportEmail || "hello@letsgo2travel.com.tr",
  appVersion: injected?.appVersion || "1.4.0",
  appleAuthEnabled: injected?.appleAuthEnabled !== false,
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
