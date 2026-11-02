import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
import './route-allowance.css';

/** Keep routine allowance information small; required recovery actions stay visible. */
export function RouteAllowance({ summary, attention = false, children }: {
  summary: ReactNode;
  attention?: boolean;
  children: ReactNode;
}) {
  const { copy, locale } = useI18n();
  const heading = <><Icon name="sparkles" size={17}/><strong>{summary}</strong></>;
  return <aside className={`route-allowance${attention ? ' needs-attention' : ''}`} aria-live="polite">
    {attention ? <>
      <div className="route-allowance-heading">{heading}</div>
      <div className="route-allowance-detail">{children}</div>
    </> : <details>
      <summary>{heading}<span>{locale === 'ro' ? 'Detalii' : copy('Ayrıntılar', 'Details', 'Hollësi')}</span><Icon name="chevron" size={15}/></summary>
      <div className="route-allowance-detail">{children}</div>
    </details>}
  </aside>;
}
