import { useId, useSyncExternalStore } from 'react';
import { useI18n } from '../lib/i18n';
import { getServerTextSize, getTextSize, setTextSize, subscribeTextSize } from '../lib/textSize';

export function TextSizePicker() {
  const size = useSyncExternalStore(subscribeTextSize, getTextSize, getServerTextSize);
  const { copy } = useI18n();
  const id = useId();
  return <fieldset className="text-size-picker">
    <legend>{copy('Yazı boyutu', 'Text size', 'Madhësia e tekstit')}</legend>
    <div>{(['normal', 'large'] as const).map(option => <label key={option}>
      <input type="radio" name={id} value={option} checked={size === option} onChange={() => setTextSize(option)} />
      <span>{option === 'normal' ? copy('Normal', 'Normal', 'Normal') : copy('Büyük', 'Large', 'I madh')}</span>
    </label>)}</div>
    <p>{copy('Yazılar büyür; kartlar ve düğmeler metne uyum sağlar.', 'Text grows; cards and buttons adapt to fit.', 'Teksti zmadhohet; kartat dhe butonat përshtaten.')}</p>
  </fieldset>;
}
