import { useId } from "react";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/useTheme";
import "./appearance-picker.css";

export function HeaderThemeToggle() {
  const { copy } = useI18n();
  const { resolved, toggle } = useTheme();
  const id = useId();
  const dark = resolved === "dark";
  return <button type="button" role="switch" className="theme-toggle theme-toggle-header" aria-checked={dark}
      aria-labelledby={`${id}-toggle-label`} aria-describedby={`${id}-status`}
      title={copy("Koyu tema", "Dark mode", "Tema e errët")}
      onClick={toggle}>
      <span className="sr-only">
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
            <path d="M15.5 6.75A14 14 0 1 0 30.5 29.25A14 14 0 0 1 15.5 6.75Z" fill="#f1e7c9" />
            <g fill="#baad88" opacity=".5">
              <circle cx="10.3" cy="17.8" r="1.6" />
              <circle cx="12.5" cy="26" r="2" />
              <circle cx="19" cy="31" r=".95" />
            </g>
          </svg>
        </span>
      </span>
    </button>;
}

export function AppearancePicker() {
  const { copy } = useI18n();
  const { preference, resolved, setPreference } = useTheme();
  const id = useId();
  return <fieldset className="appearance-picker" aria-labelledby={`${id}-label`}>
    <legend id={`${id}-label`}>{copy("Görünüm", "Appearance", "Pamja")}</legend>
    <label className="appearance-system">
      <input type="checkbox" checked={preference === "system"}
        onChange={event => setPreference(event.target.checked ? "system" : resolved)} />
      <span>{copy("Cihazın temasını kullan", "Use device appearance", "Përdor pamjen e pajisjes")}</span>
      <span className="appearance-system-track" aria-hidden="true" />
    </label>
  </fieldset>;
}
