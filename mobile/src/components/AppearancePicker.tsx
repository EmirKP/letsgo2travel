import { useId } from "react";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/useTheme";
import type { ThemePreference } from "../lib/theme";
import "./appearance-picker.css";

export function AppearancePicker() {
  const { copy } = useI18n();
  const { preference, setPreference } = useTheme();
  const id = useId();
  const options: Array<{ value: ThemePreference; label: string }> = [
    { value: "light", label: copy("Açık", "Light", "E çelët") },
    { value: "dark", label: copy("Koyu", "Dark", "E errët") },
    { value: "system", label: copy("Sistem", "System", "Sistemi") },
  ];
  return <fieldset className="appearance-picker" role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`}>
    <legend id={`${id}-label`}>{copy("Görünüm", "Appearance", "Pamja")}</legend>
    <p id={`${id}-hint`}>{copy("Sistem seçildiğinde cihazının görünümü kullanılır.", "System follows your device’s appearance.", "Sistemi ndjek pamjen e pajisjes sate.")}</p>
    <div className="appearance-options">
      {options.map(option => <label key={option.value} className={`appearance-option${preference === option.value ? " is-selected" : ""}`}>
        <input type="radio" name={`${id}-theme`} value={option.value} checked={preference === option.value} onChange={() => setPreference(option.value)} />
        <span>{option.label}</span>
      </label>)}
    </div>
  </fieldset>;
}
