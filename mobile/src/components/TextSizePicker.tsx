import { useId, useSyncExternalStore } from 'react';
import { useI18n } from '../lib/i18n';
import { getServerTextSize, getTextSize, setTextSize, subscribeTextSize } from '../lib/textSize';

export function TextSizePicker() {
  const size = useSyncExternalStore(subscribeTextSize, getTextSize, getServerTextSize);
  const { copy } = useI18n();
  const id = useId();
  return <fieldset className="text-size-picker">
    <legend>{copy('Yazı boyutu', 'Text size', 'Madhësia e tekstit')}</legend>
    <div className="text-size-segments">{(['normal', 'large'] as const).map(option => <label key={option} className="text-size-option">
      <input type="radio" name={id} value={option} checked={size === option} onChange={() => setTextSize(option)} />
      <span className="text-size-option-content">
        <span className={`text-size-preview text-size-preview-${option}`} aria-hidden="true">A</span>
        <span>{option === 'normal' ? copy('Normal', 'Normal', 'Normal') : copy('Büyük', 'Large', 'I madh')}</span>
      </span>
    </label>)}</div>
  </fieldset>;
}
