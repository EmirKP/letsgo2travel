import { useEffect, useState } from "react";
import { HOME_SHORTCUT_EVENT, homeShortcutKey, readHomeShortcuts, saveHomeShortcuts } from "../lib/homeShortcuts";
import type { AppShortcutId } from "../lib/appTools";

export function useHomeShortcuts(ownerId?: string | null) {
  const owner = ownerId || null;
  const [snapshot, setSnapshot] = useState(() => ({ owner, views: readHomeShortcuts(owner) }));
  useEffect(() => {
    const refresh = () => setSnapshot({ owner, views: readHomeShortcuts(owner) });
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== homeShortcutKey(owner)) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      refresh();
    };
    refresh();
    window.addEventListener(HOME_SHORTCUT_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(HOME_SHORTCUT_EVENT, refresh); window.removeEventListener("storage", onStorage); };
  }, [owner]);
  return {
    // No frame may render another account's shortcuts while effects reconnect.
    views: snapshot.owner === owner ? snapshot.views : readHomeShortcuts(owner),
    save: (views: readonly AppShortcutId[]) => saveHomeShortcuts(owner, views),
  };
}
