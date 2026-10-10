import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import './request-failure.css';

export function RequestFailure({ message, onRetry, busy = false, draftsKept = false }: {
  message: string; onRetry: () => void; busy?: boolean; draftsKept?: boolean;
}) {
  const { copy } = useI18n();
  return <div className="request-failure" role="status">
    <Icon name="info" size={21} />
    <div><strong>{message}</strong>{draftsKept && <p>{copy('Girdiğin bilgiler korundu. Hazır olduğunda tekrar deneyebilirsin.', 'Your entries are still here. Try again when ready.', 'Të dhënat që fute janë ruajtur. Provo sërish kur të jesh gati.')}</p>}</div>
    <button type="button" disabled={busy} onClick={onRetry}><Icon name="refresh" size={17} />{busy ? copy('Deneniyor…', 'Trying…', 'Po provohet…') : copy('Tekrar dene', 'Try again', 'Provo sërish')}</button>
  </div>;
}
