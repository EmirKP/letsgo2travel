import type { CSSProperties } from 'react';
import { useI18n } from '../lib/i18n';
import { PULL_REFRESH_THRESHOLD, pullRefreshProgress } from '../lib/pullRefresh';
import './pull-refresh.css';

/** Decorative flight stays separate from the request; it never announces success. */
export function PullRefreshIndicator({ distance, refreshing }: { distance: number; refreshing: boolean }) {
  const { copy } = useI18n();
  const visible = distance > 0 || refreshing;
  return <div className="pull-flight" data-visible={visible || undefined} data-refreshing={refreshing || undefined}
    role="status" aria-live="polite" aria-hidden={!visible || undefined}
    style={{ '--pull-progress': pullRefreshProgress(distance) } as CSSProperties}>
    <span className="pull-flight-art" aria-hidden="true">
      <span className="pull-flight-trails"><i/><i/><i/></span>
      <svg className="pull-flight-plane" viewBox="0 0 48 48" fill="currentColor" focusable="false">
        <path d="M24 3c1.8 0 3 1.8 3 4v12l16 12v4l-16-6v10l6 4v3l-9-3-9 3v-3l6-4V29L5 35v-4l16-12V7c0-2.2 1.2-4 3-4Z"/>
      </svg>
    </span>
    <span>{visible ? refreshing ? copy('Yenileniyor', 'Refreshing', 'Duke rifreskuar') : distance >= PULL_REFRESH_THRESHOLD
      ? copy('Yenilemek için bırak', 'Release to refresh', 'Lësho për të rifreskuar')
      : copy('Yenilemek için aşağı çek', 'Pull down to refresh', 'Për të rifreskuar, tërhiq poshtë') : ''}</span>
  </div>;
}
