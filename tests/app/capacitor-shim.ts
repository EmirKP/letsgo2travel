// Test kopyası için Capacitor köprü şimi (native ortam yok).
export function isNativePlatform() { return false; }
export function isIOSNative() { return false; }
export function plugin(_name: string): undefined { return undefined; }
export async function addPluginListener(
  _plugin: string,
  _event: string,
  _cb: (value: Record<string, unknown>) => void,
): Promise<{ remove: () => Promise<void> } | null> { return null; }
