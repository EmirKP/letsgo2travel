export function resolveMobilePublicConfig(
  env: Record<string, string | undefined>,
  options?: { production?: boolean },
): {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supportEmail: string;
  appleAuthEnabled: boolean;
};
