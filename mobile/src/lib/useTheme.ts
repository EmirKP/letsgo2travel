import { useSyncExternalStore } from "react";
import { getServerThemeSnapshot, getThemeSnapshot, setThemePreference, subscribeTheme, toggleThemePreference } from "./theme";

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  return { ...theme, setPreference: setThemePreference, toggle: toggleThemePreference };
}
