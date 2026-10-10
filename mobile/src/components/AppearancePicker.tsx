import { useId } from "react";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/useTheme";
import "./appearance-picker.css";

export function AppearancePicker() {
  const { copy } = useI18n();
  const { preference, resolved, setPreference } = useTheme();
  const id = useId();
  const dark = resolved === "dark";
  return <fieldset className="appearance-picker" aria-labelledby={`${id}-label`}>
    <legend id={`${id}-label`}>{copy("Görünüm", "Appearance", "Pamja")}</legend>
    <button type="button" role="switch" className="theme-toggle" aria-checked={dark}
      aria-labelledby={`${id}-toggle-label`} aria-describedby={`${id}-status`}
      onClick={() => setPreference(dark ? "light" : "dark")}>
      <span className="theme-toggle-copy">
        <strong id={`${id}-toggle-label`}>{copy("Koyu tema", "Dark mode", "Tema e errët")}</strong>
        <span id={`${id}-status`}>{dark
          ? copy("Koyu tema etkin", "Dark theme active", "Tema e errët aktive")
          : copy("Açık tema etkin", "Light theme active", "Tema e çelët aktive")}</span>
      </span>
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-stars"><i /><i /><i /></span>
        <span className="theme-toggle-thumb">
          <svg className="theme-toggle-sun" viewBox="0 0 40 40" focusable="false">
            <g fill="none" stroke="#eaa520" strokeWidth="2.5" strokeLinecap="round">
              <path d="M20 4v3m0 26v3M4 20h3m26 0h3M8.7 8.7l2.1 2.1m18.4 18.4 2.1 2.1M8.7 31.3l2.1-2.1m18.4-18.4 2.1-2.1" />
            </g>
            <circle cx="20" cy="20" r="8.5" fill="#ffd448" />
            <path d="M14.5 19a6 6 0 0 1 5-5" fill="none" stroke="#fff2b5" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <svg className="theme-toggle-moon" viewBox="0 0 40 40" focusable="false">
            <path d="M28.9 25.8A13.3 13.3 0 0 1 14.2 11.1 13.5 13.5 0 1 0 28.9 25.8Z" fill="#d9ecff" />
            <circle cx="11.5" cy="24" r="2.1" fill="#aac7e8" />
            <circle cx="17.5" cy="30.5" r="1.3" fill="#aac7e8" />
          </svg>
        </span>
      </span>
    </button>
    <label className="appearance-system">
      <input type="checkbox" checked={preference === "system"}
        onChange={event => setPreference(event.target.checked ? "system" : resolved)} />
      <span>{copy("Cihazın temasını kullan", "Use device appearance", "Përdor pamjen e pajisjes")}</span>
    </label>
  </fieldset>;
}
