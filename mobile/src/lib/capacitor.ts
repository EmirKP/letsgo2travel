type PluginListener = { remove: () => Promise<void> };

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
};

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

export function isNativePlatform() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function plugin(name: string) {
  return window.Capacitor?.Plugins?.[name];
}

export async function addPluginListener(
  pluginName: string,
  eventName: string,
  callback: (value: Record<string, unknown>) => void,
): Promise<PluginListener | null> {
  const target = plugin(pluginName);
  const addListener = target?.addListener;
  if (!addListener) return null;
  try {
    return await addListener.call(target, eventName, callback) as PluginListener;
  } catch {
    return null;
  }
}
