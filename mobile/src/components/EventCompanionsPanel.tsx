import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Sheet } from './Sheet';
import { CommunityAvatar } from './CommunityAvatar';
import { Icon } from './Icon';
import { CommunityBlocksSheet } from './CommunitySafetySheet';
import { EventParticipantDirectory } from './EventParticipantDirectory';
import { useI18n } from '../lib/i18n';
import { ApiError } from '../lib/api';
import { createId } from '../lib/id';
import { communityVisibilityChanged, communityVisibilityRevision, subscribeCommunityVisibility } from '../lib/communityVisibility';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { formatAppDate } from '../lib/localeFormatting';
import { actOnEventCommunity, getEventCommunity, listJoinedEventChats, type EventCommunityAction, type EventCommunityPerson, type EventCommunityState, type EventCommunityEvent, type JoinedEventChat } from '../lib/eventCommunity';
import { eventChatHasUnread, latestVisibleChatMessage, markEventChatRead } from '../lib/eventChatInbox';
import type { TravelEvent } from '../types';
import './event-companions.css';

type SharedProps = { ownerId?: string | null; accessToken?: string; onOpenAccount: () => void; onCompleteProfile?: () => void; onNotice: (message: string) => void; onOpenProfile?: (key: string) => void };
export type EventCompanionsPanelProps = SharedProps & { event: Pick<TravelEvent, 'id' | 'title'>; initialChatOpen?: boolean; onChatClose?: () => void };
type ActionKind = EventCommunityAction['action'];
type ActionFailure = { action: ActionKind; message: string };
type FeedbackFailure = { message: string; auth: boolean; token?: string; profile?: boolean; action?: ActionKind };

const EVENT_CHAT_COPY = {
  profileRequired: { tr: 'Katılmak için adını ve kullanıcı adını tamamla.', en: 'Complete your name and username to join this event.', sq: 'Plotëso emrin dhe emrin e përdoruesit për t’iu bashkuar aktivitetit.', ro: 'Completează numele și numele de utilizator pentru a participa la eveniment.' },
  withdraw: { tr: 'Katılımı geri al', en: 'Withdraw RSVP', sq: 'Tërhiq pjesëmarrjen', ro: 'Retrage participarea' },
  withdrawHint: { tr: 'Etkinliğe katılımını geri alarak bu sohbetten ayrılırsın.', en: 'This withdraws your RSVP and leaves the event chat.', sq: 'Kjo tërheq pjesëmarrjen tënde dhe të largon nga biseda e aktivitetit.', ro: 'Îți retrage participarea și te scoate din conversația evenimentului.' },
  refreshChat: { tr: 'Sohbeti yenile', en: 'Refresh chat', sq: 'Rifresko bisedën', ro: 'Actualizează conversația' },
  messageUnconfirmed: { tr: 'Mesajın gönderildiği doğrulanamadı. Taslağın duruyor; yeniden göndermeyi deneyebilirsin.', en: 'Message delivery could not be confirmed. Your draft is kept; you can try sending it again.', sq: 'Dërgimi i mesazhit nuk u konfirmua. Drafti ruhet; mund të provosh ta dërgosh përsëri.', ro: 'Livrarea mesajului nu a putut fi confirmată. Ciorna este păstrată; poți încerca să-l trimiți din nou.' },
} as const;

function joinedChatDate(event: EventCommunityEvent, dateLocale: string): string {
  const calendarDay = event.startsAt.slice(0, 10);
  const dateOnly = event.timePrecision === 'date';
  const date = new Date(dateOnly ? `${calendarDay}T12:00:00Z` : event.startsAt);
  if (!Number.isFinite(date.getTime()) || dateOnly && date.toISOString().slice(0, 10) !== calendarDay) return '—';
  const format = (timeZone: string) => formatAppDate(date, dateLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone });
  if (dateOnly) {
    try { return format('UTC'); } catch { return calendarDay; }
  }
  if (event.timeZone) {
    try { return format(event.timeZone); } catch { /* Unknown zones use an explicit UTC label below. */ }
  }
  // An instant is known, but a venue timezone must never be guessed from the
  // device or country. Keep this fallback visibly identified as UTC.
  try { return `${format('UTC')} · UTC`; } catch { return `${date.toISOString().slice(0, 10)} · UTC`; }
}

/** Replace the rechecked recent window while retaining explicitly loaded history. */
function mergeEventChatRefresh(previous: EventCommunityState | null, current: EventCommunityState, retainHistory: boolean): EventCommunityState {
  if (!previous || !retainHistory || !previous.joined || !current.joined || previous.eventKey !== current.eventKey || !current.nextBefore || !current.messages.length) return current;
  const first = current.messages[0];
  const older = previous.messages.filter(message => message.createdAt < first.createdAt || message.createdAt === first.createdAt && message.id < first.id);
  const latestIds = new Set(current.messages.map(message => message.id));
  const history = older.filter(message => !latestIds.has(message.id));
  return history.length ? { ...current, messages: [...history, ...current.messages], nextBefore: previous.nextBefore } : current;
}

export function EventCompanionsPanel(props: EventCompanionsPanelProps) {
  return <EventCompanionsForAccount key={`${props.ownerId || 'guest'}:${props.event.id}`} {...props} />;
}

function EventCompanionsForAccount({ event, ownerId, accessToken, onOpenAccount, onCompleteProfile, onNotice, onOpenProfile, initialChatOpen = false, onChatClose }: EventCompanionsPanelProps) {
  const { copy, dateLocale, locale } = useI18n();
  const detailsId = useId();
  const now = useCurrentTime();
  const [state, setState] = useState<EventCommunityState | null>(null);
  const [loading, setLoading] = useState(Boolean(ownerId && accessToken));
  const [error, setError] = useState('');
  const [actionFailure, setActionFailure] = useState<ActionFailure | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  const [verification, setVerification] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(initialChatOpen);
  const [infoOpen, setInfoOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [meetupForm, setMeetupForm] = useState(false);
  const [meetupDate, setMeetupDate] = useState('');
  const [publicPlace, setPublicPlace] = useState('');
  const [body, setBody] = useState('');
  const [safety, setSafety] = useState<{ type: 'message' | 'meetup'; id: string; author: EventCommunityPerson } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  const deferredSuccess = useRef<(() => void) | null>(null);
  const deferredError = useRef<FeedbackFailure | null>(null);
  const actionFailureRef = useRef<ActionFailure | null>(null);
  const currentToken = useRef(accessToken);
  const currentChatClose = useRef(onChatClose);
  const currentLoad = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const historyGeneration = useRef(0);
  const visibilityRevision = useRef(communityVisibilityRevision(ownerId));
  useEffect(() => { currentToken.current = accessToken; }, [accessToken]);
  useEffect(() => { currentChatClose.current = onChatClose; }, [onChatClose]);
  const messageOperation = useRef<{ body: string; requestId: string } | null>(null);
  const latestLoad = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const retainedHistory = useRef(false);
  const readInFlight = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const sentScroll = useRef(false);
  const historyScroll = useRef<{ top: number; height: number; firstId?: string } | null>(null);
  const lastScroll = useRef<{ open: boolean; lastId?: string }>({ open: false });
  const lastMessageId = state?.messages.at(-1)?.id;
  const markVisibleRead = useCallback(() => {
    const thread = threadRef.current;
    if (!active.current || !ownerId || !chatOpen || !state?.joined || document.visibilityState !== 'visible' || !thread?.clientHeight || !nearBottom.current) return;
    // A mounted conversation can be covered by the profile, participant or
    // safety sheet. Its nonzero layout does not mean its messages are visible.
    if (thread.closest('[inert], [aria-hidden="true"], [hidden]')) return;
    const latest = latestVisibleChatMessage(state.messages);
    if (latest) markEventChatRead(ownerId, state.eventKey, latest);
  }, [ownerId, chatOpen, state]);
  const setActionFeedback = useCallback((failure: ActionFailure | null) => {
    actionFailureRef.current = failure;
    setActionFailure(failure);
  }, []);
  const applyFailure = useCallback((failure: FeedbackFailure) => {
    if (failure.action && !failure.auth && !failure.profile) setActionFeedback({ action: failure.action, message: failure.message });
    else setError(failure.message);
    setAuthRequired(failure.auth); setProfileRequired(Boolean(failure.profile));
    // Authentication feedback takes precedence without discarding an unsent
    // draft or treating a successful later read as a message acknowledgment.
    if (failure.auth) { setState(null); retainedHistory.current = false; historyScroll.current = null; }
  }, [setActionFeedback]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !chatOpen) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(112, Math.max(24, input.scrollHeight))}px`;
  }, [body, chatOpen]);
  useEffect(() => {
    const thread = threadRef.current;
    if (!chatOpen) { lastScroll.current.open = false; return; }
    if (!thread) return;
    if (historyScroll.current && historyScroll.current.firstId === state?.messages[0]?.id) return;
    if (historyScroll.current) {
      thread.scrollTop = historyScroll.current.top + thread.scrollHeight - historyScroll.current.height;
      historyScroll.current = null;
    } else if (!lastScroll.current.open || nearBottom.current || sentScroll.current) {
      thread.scrollTop = thread.scrollHeight;
      nearBottom.current = true;
      sentScroll.current = false;
    }
    lastScroll.current = { open: true, lastId: lastMessageId };
    markVisibleRead();
  }, [chatOpen, lastMessageId, state?.messages.length, state?.messages[0]?.id, infoOpen, markVisibleRead]);
  useEffect(() => {
    document.addEventListener?.('visibilitychange', markVisibleRead);
    return () => document.removeEventListener?.('visibilitychange', markVisibleRead);
  }, [markVisibleRead]);
  useEffect(() => {
    const thread = threadRef.current;
    if (!chatOpen || !thread || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(markVisibleRead);
    // Watch only this portal's ancestry, never the whole document. Sheet's
    // existing inert/aria-hidden changes resume receipts when this chat is top.
    for (let element: HTMLElement | null = thread; element && element !== document.body; element = element.parentElement) {
      observer.observe(element, { attributes: true, attributeFilter: ['inert', 'aria-hidden', 'hidden'] });
    }
    return () => observer.disconnect();
  }, [chatOpen, markVisibleRead]);
  useEffect(() => {
    const thread = threadRef.current;
    if (!chatOpen || !thread || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current && !historyScroll.current) thread.scrollTop = thread.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [chatOpen]);
  useEffect(() => {
    active.current = true;
    const revision = communityVisibilityRevision(ownerId);
    if (revision !== visibilityRevision.current) { visibilityRevision.current = revision; historyGeneration.current++; retainedHistory.current = false; historyScroll.current = null; }
    // Activity preserves state while disconnecting effects. A write may finish
    // during that pause: apply its outcome only when this owner returns.
    if (!pending.current) setBusy(false);
    const completed = deferredSuccess.current; deferredSuccess.current = null;
    completed?.();
    if (deferredError.current) {
      const failure = deferredError.current; deferredError.current = null;
      if (!failure.auth || failure.token === currentToken.current) {
        applyFailure(failure);
      }
    }
    return () => { active.current = false; controller.current?.abort(); };
  }, [applyFailure, ownerId]);
  const failureText = useCallback((failure: unknown, action?: ActionKind) => failure instanceof ApiError && failure.status === 401
    ? copy('Oturumun sona erdi. Etkinlik sohbetine devam etmek için tekrar giriş yap.', 'Your session has expired. Sign in again to continue the event chat.', 'Seanca jote ka skaduar. Hyr sërish për të vazhduar bisedën e aktivitetit.')
    : failure instanceof ApiError && failure.code === 'profile_required' ? EVENT_CHAT_COPY.profileRequired[locale]
      : action === 'message' && (!(failure instanceof ApiError) || failure.status === 0 || failure.status >= 500) ? EVENT_CHAT_COPY.messageUnconfirmed[locale]
        : locale === 'tr' && failure instanceof ApiError && failure.status > 0 && failure.status < 500 ? failure.message
      : copy('Etkinlik sohbetine şu anda bağlanılamıyor. Bağlantını kontrol edip tekrar dene.', 'Event chat is unavailable right now. Please retry.', 'Biseda e aktivitetit nuk është e disponueshme tani. Provo sërish.'), [locale, copy]);
  const showFailure = useCallback((failure: unknown, token = currentToken.current, action?: ActionKind) => {
    if (failure instanceof ApiError && failure.status === 401 && token !== currentToken.current) return;
    const result = { message: failureText(failure, action), auth: failure instanceof ApiError && failure.status === 401, token, profile: failure instanceof ApiError && failure.code === 'profile_required', action };
    if (!active.current) { deferredError.current = result; return; }
    applyFailure(result);
  }, [applyFailure, failureText]);
  const load = useCallback(async (silent = false) => {
    if (!ownerId || !accessToken) return;
    const serial = ++latestLoad.current;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    readInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const result = await getEventCommunity(event.id, accessToken, request.signal);
      if (!active.current || serial !== latestLoad.current) return;
      setState(previous => mergeEventChatRefresh(previous, result.data, retainedHistory.current)); setVerification(result.verification); setError(''); setAuthRequired(false); setProfileRequired(false);
      // A read can confirm withdrawal even if its POST response was lost. A
      // same-body message cannot confirm delivery: reads contain no request ID.
      if (actionFailureRef.current?.action === 'leave' && !result.data.joined) {
        setActionFeedback(null);
        historyGeneration.current++; retainedHistory.current = false; historyScroll.current = null;
        setChatOpen(false); setInfoOpen(false); setPeopleOpen(false);
        currentChatClose.current?.();
        window.dispatchEvent?.(new Event('l2t:event-community-changed'));
      }
    } catch (failure) {
      if (active.current && serial === latestLoad.current && !request.signal.aborted) showFailure(failure);
    } finally { if (serial === latestLoad.current) { readInFlight.current = false; if (active.current) setLoading(false); } }
  }, [ownerId, accessToken, event.id, setActionFeedback, showFailure]);
  useEffect(() => { currentLoad.current = load; }, [load]);
  useEffect(() => subscribeCommunityVisibility(change => {
    if (change.ownerId && change.ownerId !== ownerId) return;
    visibilityRevision.current = communityVisibilityRevision(ownerId);
    historyGeneration.current++; retainedHistory.current = false; historyScroll.current = null;
    if (change.ownerId && change.blockedUserId) setState(previous => previous ? { ...previous, messages: previous.messages.filter(message => message.author.userId !== change.blockedUserId), attendees: previous.attendees.filter(person => person.userId !== change.blockedUserId) } : previous);
    void currentLoad.current(true);
  }), [ownerId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!chatOpen || !state?.joined) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !pending.current && !readInFlight.current) void load(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [chatOpen, state?.joined, load]);
  async function act(action: EventCommunityAction, success?: () => void) {
    if (!ownerId || !accessToken) { onOpenAccount(); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    if (actionFailureRef.current?.action === action.action) setActionFeedback(null);
    try {
      const result = await actOnEventCommunity(event.id, accessToken, action);
      // Re-read the full recent window after a visibility change; retained
      // history must not bring back an account the user just blocked.
      if (action.action === 'block' || action.action === 'leave') retainedHistory.current = false;
      if (action.action === 'block') communityVisibilityChanged({ ownerId: ownerId || undefined, blockedUserId: result.userId });
      const complete = () => {
        if (action.action === 'leave') {
          // The write already confirmed withdrawal. A failed refresh must not
          // leave the old membership or its private history actionable.
          historyGeneration.current++; historyScroll.current = null;
          setActionFeedback(null);
          setState(previous => previous ? { ...previous, joined: false, attendees: previous.attendees.filter(person => person.userId !== ownerId), messages: [], nextBefore: null, meetup: null } : previous);
          setChatOpen(false); setInfoOpen(false); setPeopleOpen(false);
          onChatClose?.();
        }
        success?.();
      };
      if (!active.current) { deferredSuccess.current = complete; return; }
      complete();
      await currentLoad.current(true);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401 && accessToken !== currentToken.current) await currentLoad.current(true);
      else showFailure(failure, accessToken, action.action);
    }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  const withdrawRsvp = () => { void act({ action: 'leave' }); };
  async function older() {
    if (pending.current || !accessToken || !state?.nextBefore) return;
    pending.current = true; setBusy(true);
    const generation = historyGeneration.current;
    const thread = threadRef.current;
    if (thread) historyScroll.current = { top: thread.scrollTop, height: thread.scrollHeight, firstId: state.messages[0]?.id };
    try {
      const response = await getEventCommunity(event.id, accessToken, undefined, state.nextBefore);
      if (generation !== historyGeneration.current || accessToken !== currentToken.current) return;
      if (active.current && response.data.messages.length) retainedHistory.current = true;
      if (!active.current || !response.data.messages.length || response.data.messages[0].id === state.messages[0]?.id) historyScroll.current = null;
      if (active.current) setState(previous => previous ? { ...previous, messages: [...response.data.messages, ...previous.messages.filter(item => !response.data.messages.some(olderMessage => olderMessage.id === item.id))], nextBefore: response.data.nextBefore } : response.data);
    } catch (failure) { historyScroll.current = null; if (generation === historyGeneration.current) showFailure(failure, accessToken); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  function send() {
    const message = body.trim();
    if (!message) return;
    if (messageOperation.current?.body !== message) messageOperation.current = { body: message, requestId: createId() };
    void act({ action: 'message', ...messageOperation.current }, () => { setBody(''); messageOperation.current = null; sentScroll.current = true; });
  }
  const dateLabel = (value: string, timeZone?: string | null) => {
    try { return formatAppDate(new Date(value), dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }); } catch { return value; }
  };
  const snapshotLabel = (value: EventCommunityEvent) => {
    const status = value.status === 'cancelled' ? copy('İptal', 'Cancelled', 'Anuluar') : value.status === 'postponed' ? copy('Ertelendi', 'Postponed', 'Shtyrë') : value.status === 'completed' ? copy('Tamamlandı', 'Completed', 'Përfunduar') : copy('Planlandı', 'Scheduled', 'Planifikuar');
    return `${value.title} · ${value.timePrecision === 'date' ? value.startsAt.slice(0, 10) : dateLabel(value.startsAt, value.timeZone)} · ${value.venue || value.city} · ${status}`;
  };
  const messageTime = (value: string) => formatAppDate(new Date(value), dateLocale, { hour: '2-digit', minute: '2-digit' });
  const messageDay = (value: string) => formatAppDate(new Date(value), dateLocale, { day: 'numeric', month: 'long' });
  const messageDayKey = (value: string) => new Date(value).toDateString();
  const personButton = (person: EventCommunityPerson) => <button type="button" className="event-person" key={person.key} disabled={!onOpenProfile} onClick={() => onOpenProfile?.(person.key)}><CommunityAvatar username={person.username} avatarUrl={person.avatarUrl}/><span>@{person.username}</span></button>;
  const closed = state && state.event.status !== 'scheduled';
  const isPast = (value: string) => Number.isFinite(Date.parse(value)) && Date.parse(value) < now;
  const openSafety = (target: NonNullable<typeof safety>) => { setSafety(target); setReporting(false); setReason(''); setNote(''); };
  const displayedError = authRequired || profileRequired ? error : actionFailure?.message || error;
  const errorBox = displayedError && <div className="info-box error" role="alert"><p>{displayedError}</p><button type="button" onClick={authRequired ? onOpenAccount : profileRequired ? onCompleteProfile || onOpenAccount : () => void load()} disabled={busy || loading}>{authRequired ? copy('Giriş yap', 'Sign in', 'Hyr') : profileRequired ? copy('Profilini tamamla', 'Complete your profile', 'Plotëso profilin') : actionFailure ? EVENT_CHAT_COPY.refreshChat[locale] : copy('Tekrar dene', 'Retry', 'Provo sërish')}</button></div>;
  return <section className="event-companions" aria-label={copy('Etkinlik arkadaşları', 'Event companions', 'Shoqërues për aktivitetin')}>
    <div className="event-companions-heading"><div><h3>{copy('Kimler gidiyor?', 'Who is going?', 'Kush po shkon?')}</h3><p>{copy('Aynı etkinliğe katılan gezginlerle tanış.', 'Meet travellers attending the same event.', 'Njihu me udhëtarë që marrin pjesë në të njëjtin aktivitet.')}</p></div>{state && <strong>{state.memberCount} {copy('katılımcı', 'attendees', 'pjesëmarrës')}</strong>}</div>
    {!ownerId || !accessToken ? <button type="button" className="secondary-wide" onClick={onOpenAccount}>{copy('Katılımcıları görmek için giriş yap', 'Sign in to see attendees', 'Hyr për të parë pjesëmarrësit')}</button> : <>
      {loading && !state && <p role="status">{copy('Katılımcılar yükleniyor…', 'Loading attendees…', 'Po ngarkohen pjesëmarrësit…')}</p>}
      {errorBox}
      {state && <>
        {verification === 'unavailable' && <p className="info-box" role="status">{copy('Etkinlik kaynağı şu anda doğrulanamıyor. Son doğrulanan bilgiler gösteriliyor.', 'The event source cannot be checked right now. Showing the last verified details.', 'Burimi i aktivitetit nuk mund të kontrollohet tani. Shfaqen të dhënat e fundit të verifikuara.')}</p>}
        {state.change && <p className="info-box" role="status">{copy('Etkinlik kaynağında değişiklik doğrulandı.', 'A change was verified at the event source.', 'U verifikua një ndryshim në burimin e aktivitetit.')} {copy('Önceki', 'Previous', 'Më parë')}: {snapshotLabel(state.change.previous)}. {copy('Güncel', 'Current', 'Aktualisht')}: {snapshotLabel(state.event)}.</p>}
        <div className="event-people">{state.attendees.map(personButton)}</div>
        <button type="button" className="secondary-wide" onClick={() => setPeopleOpen(true)}>{copy('Katılımcıları ara ve tümünü gör', 'Search and see all attendees', 'Kërko dhe shih të gjithë pjesëmarrësit')}</button>
        {!state.joined ? <><p className="event-companions-consent">{copy('“Katılacağım” dediğinde herkese açık topluluk profilin bu listede görünür ve etkinlik grubuna katılırsın. Etkinliği kaydetmek katılım sayılmaz.', 'Choosing “I’m going” shows your public community profile here and joins the event group. Saving an event does not join it.', 'Kur zgjedh “Do të marr pjesë”, profili yt publik shfaqet këtu dhe bëhesh pjesë e grupit të aktivitetit. Ruajtja e aktivitetit nuk të shton në grup.')}</p><button type="button" className="primary-wide" disabled={busy || Boolean(closed)} onClick={() => void act({ action: 'join' })}>{busy ? copy('Kaydediliyor…', 'Saving…', 'Po ruhet…') : closed ? copy('Katılım kapalı', 'Attendance closed', 'Pjesëmarrja është mbyllur') : copy('Katılacağım', 'I’m going', 'Do të marr pjesë')}</button></> : <div className="event-companions-actions"><button type="button" className="primary-wide" onClick={() => setChatOpen(true)}>{copy('Etkinlik grup sohbeti', 'Event group chat', 'Biseda e grupit të aktivitetit')}</button><button type="button" disabled={busy} onClick={withdrawRsvp}>{EVENT_CHAT_COPY.withdraw[locale]}</button></div>}
      </>}
    </>}
    <Sheet open={chatOpen && Boolean(state?.joined)} title={event.title} onClose={() => { if (!busy) { setChatOpen(false); onChatClose?.(); } }} dismissible={!busy} className="event-chat-sheet" size="large" renderHeader={close => <div className="event-chat-topbar">
      <button type="button" className="event-chat-back" data-autofocus aria-label={copy('Kapat', 'Close', 'Mbyll')} disabled={busy} onClick={close}><Icon name="back" size={25}/></button>
      <div className="event-chat-identity"><span className="event-chat-mark" aria-hidden="true"><Icon name="calendar" size={23}/></span><div><strong>{event.title}</strong><button type="button" className="event-chat-participants" aria-expanded={infoOpen} aria-controls={detailsId} onClick={() => setInfoOpen(value => !value)}>{state?.memberCount || 0} {copy('katılımcı', 'attendees', 'pjesëmarrës')} · {copy('Grup bilgisi', 'Group info', 'Informacioni i grupit')}</button></div></div>
      <button type="button" className="event-chat-info" aria-label={copy('Sohbet bilgileri', 'Chat details', 'Informacioni i bisedës')} aria-expanded={infoOpen} aria-controls={detailsId} onClick={() => setInfoOpen(value => !value)}><Icon name="info" size={23}/></button>
    </div>}>
      {state && <div className="event-chat">
        {infoOpen && <div id={detailsId} className="event-chat-details">
        <div className="event-chat-toolbar"><strong>{state.memberCount} {copy('katılımcı', 'attendees', 'pjesëmarrës')}</strong><button type="button" disabled={busy} onClick={() => void act({ action: 'mute', muted: !state.muted })}>{state.muted ? copy('Sessizi kaldır', 'Unmute', 'Hiq heshtjen') : copy('Sessize al', 'Mute', 'Hesht')}</button><button type="button" disabled={busy || loading} onClick={() => void load()}>{copy('Yenile', 'Refresh', 'Rifresko')}</button></div>
        <button type="button" className="secondary-wide" onClick={() => setPeopleOpen(true)}>{copy('Katılımcıları ara ve tümünü gör', 'Search and see all attendees', 'Kërko dhe shih të gjithë pjesëmarrësit')}</button>
        <p className="event-companions-consent">{copy('Mesajlar katılan tüm gezginlerce okunur. Buluşma için halka açık bir yer seç.', 'Messages can be read by all attendees. Choose a public place to meet.', 'Mesazhet mund të lexohen nga të gjithë pjesëmarrësit. Zgjidh një vend publik për takimin.')}{state.muted && ` ${copy('Sohbet sessizde; açıkken yeni mesajlar görünmeye devam eder.', 'This chat is muted; new messages still appear while it is open.', 'Biseda është në heshtje; mesazhet e reja shfaqen kur është e hapur.')}`}</p>
        <div className="event-people">{state.attendees.map(personButton)}</div>
        {closed && <p className="info-box" role="status">{copy('Etkinlik durumu değişti; yeni buluşma katılımı kapalı.', 'The event status changed; new meetup attendance is closed.', 'Statusi i aktivitetit ka ndryshuar; pjesëmarrja e re në takim është mbyllur.')}</p>}
        {state.meetup ? <div className="event-meetup"><span className="event-meetup-label">{copy('Sabitlenen buluşma', 'Pinned meetup', 'Takimi i fiksuar')}</span><strong>{state.meetup.publicPlace}</strong><p>{dateLabel(state.meetup.startsAt, state.event.timeZone)}{state.event.timeZone ? ` · ${state.event.timeZone}` : ` · ${copy('cihaz saati', 'device time', 'ora e pajisjes')}`}</p>{personButton(state.meetup.creator)}<small>{state.meetup.attendeeCount} {copy('kişi buluşmaya katılıyor', 'joining the meetup', 'po marrin pjesë në takim')}</small><div className="event-people">{state.meetup.attendees.map(personButton)}</div><div className="event-meetup-actions"><button type="button" disabled={busy || (!state.meetup.joined && (Boolean(closed) || isPast(state.meetup.startsAt)))} onClick={() => void act({ action: state.meetup!.joined ? 'meetup-leave' : 'meetup-join', meetupId: state.meetup!.id })}>{state.meetup.joined ? copy('Buluşmadan ayrıl', 'Leave meetup', 'Largohu nga takimi') : copy('Buluşmaya katıl', 'Join meetup', 'Merr pjesë në takim')}</button>{state.meetup.isOwn ? <button type="button" disabled={busy} onClick={() => void act({ action: 'meetup-delete', meetupId: state.meetup!.id })}>{copy('Buluşmayı kaldır', 'Remove meetup', 'Hiq takimin')}</button> : <button type="button" disabled={busy} onClick={() => openSafety({ type: 'meetup', id: state.meetup!.id, author: state.meetup!.creator })}>{copy('Bildir / engelle', 'Report / block', 'Raporto / blloko')}</button>}</div></div> : <button type="button" className="secondary-wide" disabled={busy || Boolean(closed)} onClick={() => setMeetupForm(value => !value)}>{copy('Buluşma saati ve yeri belirle', 'Set a meeting time and place', 'Cakto orën dhe vendin e takimit')}</button>}
        {meetupForm && !state.meetup && <form className="event-meetup-form" onSubmit={submit => { submit.preventDefault(); const instant = new Date(meetupDate); if (!Number.isFinite(instant.getTime())) return; void act({ action: 'meetup', startsAt: instant.toISOString(), publicPlace: publicPlace.trim() }, () => { setMeetupForm(false); setPublicPlace(''); setMeetupDate(''); }); }}><label>{copy('Buluşma saati (cihazının saat dilimi)', 'Meeting time (your device time zone)', 'Ora e takimit (zona kohore e pajisjes)')}<input required type="datetime-local" value={meetupDate} onChange={change => setMeetupDate(change.target.value)} disabled={busy}/></label><label>{copy('Halka açık buluşma yeri', 'Public meeting place', 'Vendi publik i takimit')}<input required minLength={5} maxLength={180} value={publicPlace} onChange={change => setPublicPlace(change.target.value)} placeholder={copy('Örn. salonun ana giriş kapısı', 'E.g. the venue’s main entrance', 'P.sh. hyrja kryesore e vendit të aktivitetit')} disabled={busy}/></label><small>{copy('Etkinliğin 3 gün öncesi ile 3 gün sonrası arasında bir saat seç. Özel adres veya iletişim bilgisi paylaşma.', 'Choose a time within 3 days of the event. Do not share a private address or contact details.', 'Zgjidh një orë brenda 3 ditëve para ose pas aktivitetit. Mos ndaj adresë private ose të dhëna kontakti.')}</small><button type="submit" className="primary-wide" disabled={busy || publicPlace.trim().length < 5 || !meetupDate}>{copy('Buluşmayı sabitle', 'Pin meetup', 'Fikso takimin')}</button></form>}
        <button type="button" className="event-chat-manage-blocks" onClick={() => setBlocksOpen(true)}>{copy('Engellenen hesaplar', 'Blocked accounts', 'Llogaritë e bllokuara')}</button>
        <p className="event-companions-consent">{EVENT_CHAT_COPY.withdrawHint[locale]}</p>
        <button type="button" className="secondary-wide event-chat-withdraw" disabled={busy} onClick={withdrawRsvp}>{EVENT_CHAT_COPY.withdraw[locale]}</button>
        </div>}
        {state.meetup && !infoOpen && <button type="button" className="event-chat-pin" onClick={() => setInfoOpen(true)}><Icon name="map" size={17}/><span><strong>{state.meetup.publicPlace}</strong><small>{dateLabel(state.meetup.startsAt, state.event.timeZone)}</small></span><Icon name="chevron" size={17}/></button>}
        {errorBox}
        <div className="event-chat-thread" ref={threadRef} onScroll={event => { const thread = event.currentTarget; nearBottom.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 72; markVisibleRead(); }}>
        <div className="event-chat-intro"><span className="event-chat-mark" aria-hidden="true"><Icon name="calendar" size={28}/></span><strong>{event.title}</strong><small>{copy('Etkinlik grup sohbeti', 'Event group chat', 'Biseda e grupit të aktivitetit')}</small></div>
        {state.nextBefore && <button type="button" className="event-chat-earlier" disabled={busy} onClick={() => void older()}>{copy('Önceki mesajlar', 'Earlier messages', 'Mesazhet e mëparshme')}</button>}
        <ol className="event-chat-messages" aria-label={copy('Grup mesajları', 'Group messages', 'Mesazhet e grupit')}>
          {state.messages.map((message, index) => {
            const own = message.author.userId === ownerId;
            const day = messageDay(message.createdAt);
            return <li key={message.id} className={`event-chat-message${own ? ' own' : ''}`}>
              {(index === 0 || messageDayKey(state.messages[index - 1].createdAt) !== messageDayKey(message.createdAt)) && <div className="event-chat-day">{day}</div>}
              <div className="event-message-row">
                {!own && <button type="button" className="event-message-avatar" disabled={!onOpenProfile} aria-label={`@${message.author.username} · ${copy('Profili aç', 'Open profile', 'Hap profilin')}`} onClick={() => onOpenProfile?.(message.author.key)}><CommunityAvatar username={message.author.username} avatarUrl={message.author.avatarUrl}/></button>}
                <div className="event-message-content">
                  {!own && <button type="button" className="event-message-name" disabled={!onOpenProfile} onClick={() => onOpenProfile?.(message.author.key)}>@{message.author.username}</button>}
                  <div className="event-message-bubble"><p>{message.body}</p><time className="event-message-time" dateTime={message.createdAt}>{messageTime(message.createdAt)}</time></div>
                </div>
                {!own && <button type="button" className="event-message-options" disabled={busy} aria-label={copy('Mesaj seçenekleri', 'Message options', 'Opsionet e mesazhit')} onClick={() => openSafety({ type: 'message', id: message.id, author: message.author })}>•••</button>}
              </div>
            </li>;
          })}
        </ol>
        {!state.messages.length && <p className="event-chat-empty">{copy('İlk selamı sen ver 👋', 'Say the first hello 👋', 'Përshëndet i pari 👋')}</p>}
        </div>
        <form className="event-chat-compose" onSubmit={submit => { submit.preventDefault(); send(); }}><label className="event-chat-input-wrap"><span className="sr-only">{copy('Gruba mesaj yaz', 'Message the group', 'Shkruaji grupit')}</span><textarea ref={inputRef} rows={1} value={body} aria-label={copy('Gruba mesaj yaz', 'Message the group', 'Shkruaji grupit')} placeholder={copy('Mesaj yaz…', 'Message…', 'Shkruaj mesazh…')} onChange={change => { setBody(change.target.value); if (messageOperation.current?.body !== change.target.value.trim()) messageOperation.current = null; }} maxLength={1000} disabled={busy} required/>{body.length > 900 && <small className="event-chat-compose-count">{body.length}/1000</small>}</label><button type="submit" className="event-chat-send" aria-label={busy ? copy('Gönderiliyor…', 'Sending…', 'Po dërgohet…') : copy('Gönder', 'Send', 'Dërgo')} disabled={busy || !body.trim()}>{busy ? <span className="button-loader"/> : <Icon name="plane" size={21}/>}</button></form>
      </div>}
    </Sheet>
    <Sheet open={Boolean(safety)} title={copy('Kullanıcı seçenekleri', 'User options', 'Opsionet e përdoruesit')} onClose={() => { if (!busy) setSafety(null); }} dismissible={!busy}>
      {safety && <div className="event-chat-safety"><p>@{safety.author.username}</p>{errorBox}{reporting ? <form onSubmit={submit => { submit.preventDefault(); void act({ action: 'report', targetType: safety.type, targetId: safety.id, reason, note: note.trim() }, () => { setSafety(null); onNotice(copy('Şikâyetin inceleme için kaydedildi.', 'Your report was saved for review.', 'Raportimi yt u ruajt për shqyrtim.')); }); }}><label>{copy('Şikâyet nedeni', 'Report reason', 'Arsyeja e raportimit')}<select required value={reason} onChange={change => setReason(change.target.value)} disabled={busy}><option value="">{copy('Seç', 'Choose', 'Zgjidh')}</option>{[['spam', 'Spam veya dolandırıcılık', 'Spam or scam', 'Spam ose mashtrim'], ['harassment', 'Hakaret veya taciz', 'Abuse or harassment', 'Fyerje ose ngacmim'], ['hate', 'Nefret söylemi', 'Hate speech', 'Gjuhë urrejtjeje'], ['dangerous', 'Tehlikeli içerik', 'Dangerous content', 'Përmbajtje e rrezikshme'], ['personal_data', 'Kişisel bilgi', 'Personal information', 'Të dhëna personale'], ['other', 'Diğer', 'Other', 'Tjetër']].map(([value, tr, en, sq]) => <option key={value} value={value}>{copy(tr, en, sq)}</option>)}</select></label><label>{copy('Açıklama', 'Details', 'Hollësitë')}<textarea maxLength={1000} rows={3} value={note} onChange={change => setNote(change.target.value)} required={reason === 'other'} minLength={reason === 'other' ? 5 : undefined} disabled={busy}/></label><button type="submit" className="primary-wide" disabled={busy || !reason || reason === 'other' && note.trim().length < 5}>{copy('Şikâyeti gönder', 'Send report', 'Dërgo raportimin')}</button></form> : <><button type="button" className="secondary-wide" disabled={busy} onClick={() => setReporting(true)}>{copy('İçeriği şikâyet et', 'Report content', 'Raporto përmbajtjen')}</button><p>{copy('Engellenen hesabın mesajları ve katılımcı profili gizlenir. Daha sonra engeli kaldırabilirsin.', 'Blocking hides this account’s messages and attendee profile. You can unblock them later.', 'Bllokimi fsheh mesazhet dhe profilin e kësaj llogarie në listën e pjesëmarrësve. Mund ta zhbllokosh më vonë.')}</p><button type="button" className="secondary-wide" disabled={busy} onClick={() => void act({ action: 'block', targetType: safety.type, targetId: safety.id }, () => { setSafety(null); onNotice(copy('Hesap engellendi.', 'Account blocked.', 'Llogaria u bllokua.')); })}>{copy('Kullanıcıyı engelle', 'Block user', 'Blloko përdoruesin')}</button></>}</div>}
    </Sheet>
    {blocksOpen && ownerId && accessToken && <CommunityBlocksSheet accessToken={accessToken} onClose={() => setBlocksOpen(false)} onChanged={() => { historyGeneration.current++; retainedHistory.current = false; void load(true); }}/>}
    {peopleOpen && accessToken && <EventParticipantDirectory eventId={event.id} ownerId={ownerId} accessToken={accessToken} onClose={() => setPeopleOpen(false)} onOpenProfile={onOpenProfile} onOpenAccount={onOpenAccount}/>}
  </section>;
}

type JoinedEventChatsProps = Omit<SharedProps, 'onCompleteProfile'> & { initialChat?: JoinedEventChat | null; onInitialChatHandled?: () => void; onCompleteProfile?: (chat: JoinedEventChat) => void; onDiscoverEvents?: () => void; searchQuery?: string };

export function JoinedEventChats({ ownerId, ...props }: JoinedEventChatsProps) {
  return <JoinedEventChatsForAccount key={ownerId || 'guest'} ownerId={ownerId} {...props}/>;
}

function JoinedEventChatsForAccount(props: JoinedEventChatsProps) {
  const { copy, dateLocale, locale } = useI18n();
  const [items, setItems] = useState<JoinedEventChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'auth' | 'unavailable' | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selected, setSelected] = useState<JoinedEventChat | null>(null);
  const [query, setQuery] = useState(() => props.searchQuery?.trim() || '');
  const [, readRevision] = useState(0);
  useEffect(() => {
    const next = props.searchQuery?.trim() || '';
    if (next === query) return;
    const timer = setTimeout(() => setQuery(next), 250);
    return () => clearTimeout(timer);
  }, [props.searchQuery, query]);
  useEffect(() => {
    if (!props.initialChat) return;
    setSelected(props.initialChat);
    props.onInitialChatHandled?.();
  }, [props.initialChat, props.onInitialChatHandled]);
  const latestLoad = useRef(0);
  const load = useCallback(async (signal?: AbortSignal, offset = 0) => {
    if (!props.ownerId || !props.accessToken) return;
    const serial = ++latestLoad.current;
    setLoading(true); setError(null);
    try {
      const result = await listJoinedEventChats(props.accessToken, signal, offset, query);
      if (!signal?.aborted && serial === latestLoad.current) {
        setItems(previous => offset ? [...previous, ...result.data.filter(item => !previous.some(existing => existing.eventKey === item.eventKey))] : result.data);
        setNextOffset(result.nextOffset ?? null);
      }
    } catch (failure) {
      if (!signal?.aborted && serial === latestLoad.current) {
        if (failure instanceof ApiError && failure.status === 401) { setItems([]); setSelected(null); setNextOffset(null); setError('auth'); }
        else setError('unavailable');
      }
    } finally { if (!signal?.aborted && serial === latestLoad.current) setLoading(false); }
  }, [props.ownerId, props.accessToken, query]);
  useEffect(() => {
    const request = new AbortController();
    setItems([]); setNextOffset(null);
    void load(request.signal);
    const refresh = () => void load(request.signal);
    const read = () => readRevision(revision => revision + 1);
    const unsubscribe = subscribeCommunityVisibility(change => {
      if (change.ownerId && change.ownerId !== props.ownerId) return;
      // Remove cached previews immediately while visibility is rechecked.
      setItems([]); setNextOffset(null); void load(request.signal);
    });
    window.addEventListener('l2t:event-community-changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('l2t:event-chat-read', read);
    return () => { latestLoad.current++; request.abort(); unsubscribe(); window.removeEventListener('l2t:event-community-changed', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('l2t:event-chat-read', read); };
  }, [load, props.ownerId]);
  const title = locale === 'ro' ? 'Conversațiile mele' : copy('Sohbetlerim', 'My chats', 'Bisedat e mia');
  const discover = locale === 'ro' ? 'Descoperă evenimente' : copy('Etkinlikleri keşfet', 'Discover events', 'Zbulo aktivitete');
  const preview = (item: JoinedEventChat) => item.summaryStatus !== 'available'
    ? locale === 'ro' ? 'Mesajul nu s-a încărcat' : copy('Mesaj özeti yüklenemedi', 'Message preview unavailable', 'Përmbledhja nuk u ngarkua')
    : item.lastMessage ? `${item.lastMessage.author.userId === props.ownerId ? locale === 'ro' ? 'Tu' : copy('Sen', 'You', 'Ti') : '@' + item.lastMessage.author.username}: ${item.lastMessage.body}`
      : locale === 'ro' ? 'Încă nu există mesaje' : copy('Henüz mesaj yok', 'No messages yet', 'Ende nuk ka mesazhe');
  const time = (item: JoinedEventChat) => {
    if (!item.lastMessage || !Number.isFinite(Date.parse(item.lastMessage.createdAt))) return '';
    return formatAppDate(new Date(item.lastMessage.createdAt), dateLocale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  if (!props.ownerId || !props.accessToken) return <section className="event-joined-chats event-chat-guest-entry" aria-label={title}><div className="event-companions-heading"><h3>{title}</h3><button type="button" onClick={props.onOpenAccount}>{copy('Giriş yap', 'Sign in', 'Hyr')}</button></div><p>{copy('Katılacağın etkinliklerdeki gezginlerle sohbet et.', 'Chat with travellers attending your events.', 'Bisedo me udhëtarë që marrin pjesë në aktivitetet e tua.')}</p>{props.onDiscoverEvents && <button type="button" className="secondary-wide" onClick={props.onDiscoverEvents}>{discover}<Icon name="chevron" size={17}/></button>}</section>;
  return <section className="event-joined-chats event-inbox" aria-label={title}>
    <div className="event-companions-heading"><h3>{title}</h3><button type="button" disabled={loading} onClick={() => void load()}>{copy('Yenile', 'Refresh', 'Rifresko')}</button></div>
    {loading && !items.length && <p role="status">{copy('Sohbetler yükleniyor…', 'Loading chats…', 'Po ngarkohen bisedat…')}</p>}
    {error === 'auth' && <><p className="info-box" role="status">{copy('Oturumun sona erdi. Sohbetlerini görmek için tekrar giriş yap.', 'Your session has expired. Sign in again to see your chats.', 'Seanca jote ka skaduar. Hyr sërish për të parë bisedat.')}</p><button type="button" className="secondary-wide" onClick={props.onOpenAccount}>{copy('Giriş yap', 'Sign in', 'Hyr')}</button></>}
    {error === 'unavailable' && <p className="info-box" role="status">{items.length ? copy('Sohbet listesi yenilenemedi. Son yüklenen sohbetlerin gösteriliyor.', 'Could not refresh your chat list. Your last loaded chats are shown.', 'Lista e bisedave nuk u rifreskua. Po shfaqen bisedat e ngarkuara më parë.') : copy('Etkinlik sohbetleri şu anda alınamıyor. Tekrar dene.', 'Event chats are unavailable right now. Please retry.', 'Bisedat e aktiviteteve nuk janë të disponueshme tani. Provo sërish.')}</p>}
    {!loading && !error && !items.length && <div className="event-inbox-empty"><Icon name="users" size={32}/><p>{query ? locale === 'ro' ? 'Nicio conversație găsită.' : copy('Bu aramada sohbet bulunamadı.', 'No chats found.', 'Nuk u gjetën biseda.') : copy('“Katılacağım” dediğin etkinliklerin sohbetleri burada görünür.', 'Chats for events you RSVP to appear here.', 'Këtu shfaqen bisedat e aktiviteteve ku ke konfirmuar pjesëmarrjen.')}</p>{props.onDiscoverEvents && <button type="button" className="primary-wide" onClick={props.onDiscoverEvents}>{discover}<Icon name="chevron" size={17}/></button>}</div>}
    {error !== 'auth' && items.length > 0 && <div className="event-joined-chat-list">{items.map(item => {
      const unread = props.ownerId ? eventChatHasUnread(item, props.ownerId) : false;
      return <button type="button" key={item.eventKey} className={unread ? 'event-inbox-unread' : undefined} onClick={() => setSelected(item)}>
        <span className="event-inbox-mark" aria-hidden="true"><Icon name="calendar" size={23}/></span>
        <span className="event-inbox-copy"><strong>{item.event.title}</strong><span className="event-inbox-preview">{preview(item)}</span><small>{item.event.city} · {joinedChatDate(item.event, dateLocale)} · {item.memberCount} {copy('katılımcı', 'attendees', 'pjesëmarrës')}{item.muted ? ` · ${copy('sessizde', 'muted', 'në heshtje')}` : ''}</small></span>
        <span className="event-inbox-meta">{item.lastMessage && <time dateTime={item.lastMessage.createdAt}>{time(item)}</time>}{unread && <span className="event-inbox-new">{locale === 'ro' ? 'Nou' : copy('Yeni', 'New', 'E re')}</span>}<Icon name="chevron" size={15}/></span>
      </button>;
    })}</div>}
    {nextOffset !== null && <button type="button" className="secondary-wide event-inbox-more" disabled={loading} onClick={() => void load(undefined, nextOffset)}>{locale === 'ro' ? 'Mai multe conversații' : copy('Daha fazla sohbet', 'More chats', 'Më shumë biseda')}</button>}
    <Sheet open={Boolean(selected)} title={selected?.event.title || copy('Etkinlik sohbeti', 'Event chat', 'Biseda e aktivitetit')} onClose={() => setSelected(null)}>{selected && <EventCompanionsPanel {...props} onCompleteProfile={props.onCompleteProfile ? () => props.onCompleteProfile?.(selected) : undefined} initialChatOpen onChatClose={() => setSelected(null)} event={{ id: selected.eventKey, title: selected.event.title }}/>}</Sheet>
  </section>;
}
