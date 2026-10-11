import { useI18n } from "../lib/i18n";
import "./official-badge.css";

/** Official application identity, independent of traveller verification and points. */
export function OfficialBadge({ isOfficial }: { isOfficial?: boolean }) {
  const { copy } = useI18n();
  if (isOfficial !== true) return null;
  const label = copy("Resmî hesap", "Official account", "Llogari zyrtare");
  return <svg className="official-account-badge" viewBox="0 0 24 24" role="img" aria-label={label} focusable="false">
    <title>{label}</title>
    <path fill="currentColor" d="m12 1.5 2.7 1.65 3.15.1 1.05 2.98 2.5 1.93-.82 3.04.82 3.04-2.5 1.93-1.05 2.98-3.15.1L12 22l-2.7-1.65-3.15-.1-1.05-2.98-2.5-1.93.82-3.04-.82-3.04L5.1 7.33l1.05-2.98 3.15-.1Z" />
    <path d="m7.6 11.9 2.9 2.9 5.9-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
