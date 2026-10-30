import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { CommunityAvatar } from './CommunityAvatar';
import { useI18n } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { listEventParticipants, type EventCommunityPerson, type EventParticipantCursor } from '../lib/eventCommunity';
import { communityVisibilityRevision, subscribeCommunityVisibility } from '../lib/communityVisibility';

export function EventParticipantDirectory({ eventId, ownerId, accessToken, onClose, onOpenProfile, onOpenAccount }: { eventId: string; ownerId?: string | null; accessToken: string; onClose: () => void; onOpenProfile?: (key: string) => void; onOpenAccount: () => void }) {
  const { copy } = useI18n();
  const [query, setQuery] = useState(''), [search, setSearch] = useState(''), [revision, setRevision] = useState(0);
  const [people, setPeople] = useState<EventCommunityPerson[]>([]), [cursor, setCursor] = useState<EventParticipantCursor | null>(null);
  const [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false), [failure, setFailure] = useState<{ more: boolean; auth: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null), serial = useRef(0), pending = useRef(false);
  const visibleRevision = useRef(communityVisibilityRevision(ownerId));
  const load = useCallback(async (more = false, after?: EventParticipantCursor | null) => {
    if (more && pending.current) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const generation = ++serial.current; pending.current = true; setLoading(true); setFailure(null);
    if (!more) { setPeople([]); setCursor(null); setLoaded(false); }
    try {
      const result = await listEventParticipants(eventId, accessToken, search, more ? after : null, request.signal);
      if (request.signal.aborted || generation !== serial.current) return;
      setPeople(previous => { const rows = more ? [...previous, ...result.data.attendees] : result.data.attendees; return [...new Map(rows.map(person => [person.userId, person])).values()]; });
      setCursor(result.data.nextAfter); setLoaded(true);
    } catch (error) { if (!request.signal.aborted && generation === serial.current) { const auth = error instanceof ApiError && error.status === 401; if (auth) { setPeople([]); setCursor(null); } setFailure({ more, auth }); } }
    finally { if (generation === serial.current) { pending.current = false; setLoading(false); } }
  }, [eventId, accessToken, search]);
  useEffect(() => { void load(); return () => { serial.current++; controller.current?.abort(); pending.current = false; }; }, [load, revision]);
  useEffect(() => {
    const latest = communityVisibilityRevision(ownerId);
    if (latest !== visibleRevision.current) { visibleRevision.current = latest; setRevision(value => value + 1); }
    return subscribeCommunityVisibility(change => { if (!change.ownerId || change.ownerId === ownerId) { visibleRevision.current = communityVisibilityRevision(ownerId); serial.current++; controller.current?.abort(); setPeople([]); setLoaded(false); setRevision(value => value + 1); } });
  }, [ownerId]);
  return <Sheet open title={copy('Katılımcılar', 'Attendees', 'Pjesëmarrësit')} onClose={onClose}>
    <form className="ta-form" role="search" onSubmit={event => { event.preventDefault(); setSearch(query.trim().replace(/^@/, '')); setRevision(value => value + 1); }}><label>{copy('Kullanıcı adı ara', 'Search username', 'Kërko emrin e përdoruesit')}<input type="search" value={query} maxLength={80} onChange={event => setQuery(event.target.value)}/></label><button type="submit" className="secondary-wide">{copy('Ara', 'Search', 'Kërko')}</button></form>
    {loading && <p role="status">{copy('Katılımcılar yükleniyor…', 'Loading attendees…', 'Po ngarkohen pjesëmarrësit…')}</p>}
    {failure && <div role="alert"><p>{failure.auth ? copy('Katılımcıları görmek için yeniden giriş yap.', 'Sign in again to see attendees.', 'Hyr sërish për të parë pjesëmarrësit.') : copy('Katılımcılar alınamadı. Yeniden deneyebilirsin.', 'Attendees could not load. You can retry.', 'Pjesëmarrësit nuk u ngarkuan. Mund të provosh sërish.')}</p><button type="button" disabled={loading} onClick={failure.auth ? onOpenAccount : () => void load(failure.more, cursor)}>{failure.auth ? copy('Giriş yap', 'Sign in', 'Hyr') : copy('Tekrar dene', 'Retry', 'Provo sërish')}</button></div>}
    <div className="event-people">{people.map(person => <button type="button" className="event-person" key={person.userId} disabled={!onOpenProfile} onClick={() => onOpenProfile?.(person.key)}><CommunityAvatar username={person.username} avatarUrl={person.avatarUrl}/><span>@{person.username}</span></button>)}</div>
    {loaded && !loading && !failure && !people.length && <p>{copy('Bu aramada katılımcı bulunamadı.', 'No attendees match this search.', 'Nuk u gjetën pjesëmarrës për këtë kërkim.')}</p>}
    {cursor && !failure && <button type="button" className="secondary-wide" disabled={loading} onClick={() => void load(true, cursor)}>{copy('Daha fazla göster', 'Show more', 'Shfaq më shumë')}</button>}
  </Sheet>;
}
