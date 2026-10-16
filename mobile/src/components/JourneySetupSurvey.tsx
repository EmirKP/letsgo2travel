import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../lib/i18n';
import { knownJourneyArea, searchJourneyArea, type JourneyArea } from '../lib/mapJourneyClient';
import { Icon, type IconName } from './Icon';
import { WelcomeArtwork, type WelcomeArtworkKind } from './WelcomeArtwork';
import { readWelcomePreferences } from '../lib/onboardingPreferences';
import { journeyInterestsFromWelcome, readJourneySurveyDraft, saveJourneySurveyDraft, type JourneyInterest, type JourneySurveyDraft } from '../lib/journeySurveyDraft';
import { localJourneyAreaSuggestions, mergeJourneyAreaSuggestions } from '../lib/journeyAreaSuggestions';
import './journey-setup-survey.css';
import { observeSurveyKeyboard } from '../lib/surveyKeyboard';

export type JourneySurveyValues = {
  area: JourneyArea;
  dayCount: number;
  startDate: string | null;
  firstDayStartTime?: string | null;
  party: 'solo' | 'couple' | 'friends' | 'family';
  budget: 'economical' | 'moderate' | 'comfortable';
  pace: 'relaxed' | 'balanced' | 'busy';
  walking: 'light' | 'standard';
  interests: JourneyInterest[];
  notes: string;
};

type Props = {
  ownerId?: string | null;
  draftScope?: string;
  initialCity?: string;
  initialValues?: JourneySurveyValues;
  busy?: boolean;
  error?: string;
  onGenerate: (values: JourneySurveyValues) => void;
  /** Cancels generation without discarding the answers. The enclosing sheet owns closing. */
  onCancel?: () => void;
  savedPlans?: { id: string; city: string; dayCount: number }[];
  onOpenSaved?: (id: string) => void;
};
type Choice<T extends string> = { value: T; label: string; icon?: IconName; artwork?: WelcomeArtworkKind };
type FieldError = 'destination' | 'query' | 'days' | 'date' | 'time' | 'interests' | 'notes' | null;
type SearchState = 'idle' | 'loading' | 'empty' | 'error';
const EXAMPLE_CITIES = ['İstanbul', 'Paris', 'Tokyo', 'Tirana'];
const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function ChoiceGroup<T extends string>({ label, name, choices, value, onChange, disabled, hint }: {
  label: string; name: string; choices: Choice<T>[]; value: T; onChange: (value: T) => void; disabled: boolean; hint?: string;
}) {
  return <fieldset className="jsv-choices" disabled={disabled}>
    <legend>{label}</legend>
    <div className="jsv-choice-row">
      {choices.map(choice => <label key={choice.value} className={`jsv-choice${value === choice.value ? ' is-selected' : ''}`}>
        <input type="radio" name={name} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
        {choice.icon && <Icon name={choice.icon} size={18} />}
        <span>{choice.label}</span>
      </label>)}
    </div>
    {hint && <p className="jsv-hint" aria-live="polite">{hint}</p>}
  </fieldset>;
}

/** Only resolved destinations reach generation; typed text never reuses an old city's coordinates. */
export function JourneySetupSurvey(props: Props) {
  return <SurveyForm key={JSON.stringify([props.ownerId ?? null, props.draftScope || 'new'])} {...props} />;
}

function SurveyForm({ ownerId = null, draftScope = 'new', initialCity = '', initialValues, busy = false, error = '', onGenerate, onCancel, savedPlans = [], onOpenSaved }: Props) {
  const { copy, locale } = useI18n();
  const [restored] = useState(() => readJourneySurveyDraft(ownerId, draftScope));
  const draft = restored.draft;
  const [step, setStep] = useState(draft?.step ?? 0);
  const [query, setQuery] = useState(draft?.query ?? initialValues?.area.name ?? initialCity);
  const [area, setArea] = useState<JourneyArea | null>(() => draft ? draft.area : initialValues?.area || knownJourneyArea(initialCity));
  const [results, setResults] = useState<JourneyArea[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [dayText, setDayText] = useState(draft?.dayText ?? String(initialValues?.dayCount ?? 3));
  const [startDate, setStartDate] = useState(draft?.startDate ?? initialValues?.startDate ?? '');
  const [dateMode, setDateMode] = useState<'flexible' | 'specific'>(draft?.dateMode ?? (initialValues?.startDate ? 'specific' : 'flexible'));
  const [firstDayStartTime, setFirstDayStartTime] = useState(draft?.firstDayStartTime ?? initialValues?.firstDayStartTime ?? '');
  const [party, setParty] = useState<JourneySurveyValues['party']>(draft?.party ?? initialValues?.party ?? 'solo');
  const [budget, setBudget] = useState<JourneySurveyValues['budget']>(draft?.budget ?? initialValues?.budget ?? 'moderate');
  const [pace, setPace] = useState<JourneySurveyValues['pace']>(draft?.pace ?? initialValues?.pace ?? 'balanced');
  const [walking, setWalking] = useState<JourneySurveyValues['walking']>(draft?.walking ?? initialValues?.walking ?? 'standard');
  const [interests, setInterests] = useState<JourneySurveyValues['interests']>(() => draft ? draft.interests : initialValues ? [...initialValues.interests] : journeyInterestsFromWelcome(readWelcomePreferences().interests));
  const [notes, setNotes] = useState(draft?.notes ?? initialValues?.notes ?? '');
  const [storageError, setStorageError] = useState(restored.error);
  const [searchRetry, setSearchRetry] = useState(0);
  const [activeResult, setActiveResult] = useState(-1);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shell = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const cityInput = useRef<HTMLInputElement>(null);
  const daysInput = useRef<HTMLInputElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interestsField = useRef<HTMLFieldSetElement>(null);
  const notesInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const submitted = useRef(false);
  const currentStep = useRef(step);

  useEffect(() => {
    if (shell.current && typeof document !== 'undefined') return observeSurveyKeyboard(shell.current);
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (scroll.current) scroll.current.scrollTop = 0;
    // Some small WebViews let the sheet's own body scroll as well.
    const sheetBody = scroll.current?.closest<HTMLElement>('.sheet-body');
    if (sheetBody) sheetBody.scrollTop = 0;
  }, [step]);
  useEffect(() => {
    const next: JourneySurveyDraft = { step, query, area, dayText, dateMode, startDate, firstDayStartTime, party, budget, pace, walking, interests, notes };
    setStorageError(!saveJourneySurveyDraft(ownerId, next, draftScope));
  }, [ownerId, draftScope, step, query, area, dayText, dateMode, startDate, firstDayStartTime, party, budget, pace, walking, interests, notes]);
  useEffect(() => {
    sequence.current++;
    request.current?.abort();
    request.current = null;
    setSearchState('idle');
    setActiveResult(-1);
    const local = !area && step === 0 ? localJourneyAreaSuggestions(query, locale) : [];
    setResults(local);
    if (area || step !== 0 || busy || query.trim().length < 3) return;
    const id = sequence.current;
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(async () => {
      setSearchState('loading');
      try {
        const found = await searchJourneyArea(query.trim(), controller.signal, locale);
        if (sequence.current !== id || controller.signal.aborted) return;
        const merged = mergeJourneyAreaSuggestions(local, found);
        setResults(merged);
        setSearchState(merged.length ? 'idle' : 'empty');
      } catch {
        if (sequence.current === id && !controller.signal.aborted) setSearchState('error');
      } finally { if (sequence.current === id) request.current = null; }
    }, 300);
    return () => { clearTimeout(timer); sequence.current++; controller.abort(); request.current = null; };
  }, [locale, query, area, step, busy, searchRetry]);
  useEffect(() => {
    if (step === 1 && wheel.current && /^\d+$/.test(dayText) && Number(dayText) >= 1 && Number(dayText) <= 14) wheel.current.scrollTop = (Number(dayText) - 1) * 60;
    return () => { if (wheelTimer.current) clearTimeout(wheelTimer.current); };
  }, [dayText, step]);
  useEffect(() => { if (!busy) submitted.current = false; }, [busy, error]);

  const steps = [copy('Nereye', 'Where', 'Ku'), copy('Ne zaman', 'When', 'Kur'), copy('Gezi tarzın', 'Your style', 'Stili yt'), copy('İlgi alanların', 'Your interests', 'Interesat')];
  const titles = [copy('Nereye gitmek istiyorsun?', 'Where would you like to go?', 'Ku dëshiron të shkosh?'), copy('Kaç gün keşfedeceksin?', 'How many days will you explore?', 'Sa ditë do të eksplorosh?'), copy('Nasıl bir gezi olsun?', 'What is your travel style?', 'Çfarë udhëtimi dëshiron?'), copy('Seni en çok ne heyecanlandırır?', 'What would you love to discover?', 'Çfarë dëshiron të zbulosh?')];
  const descriptions = [copy('Şehir, ilçe veya mahalle yaz; aşağıdaki sonuçlardan seç.', 'Type a city, district or neighbourhood and choose a result below.', 'Shkruaj qytet, rreth ose lagje dhe zgjidh një rezultat më poshtë.'), copy('Gün sayısını seç. Tarihlerini sonra da belirleyebilirsin.', 'Choose the number of days. You can decide the dates later.', 'Zgjidh numrin e ditëve. Datat mund t’i vendosësh më vonë.'), copy('Sana uyan seçenekleri seç. Sonradan değiştirebilirsin.', 'Choose what suits you. You can change it later.', 'Zgjidh atë që të përshtatet. Mund ta ndryshosh më vonë.'), copy('En fazla 4 seçim yap. Başlangıçta seçtiklerin burada hazır.', 'Choose up to 4. Your welcome choices are already selected.', 'Zgjidh deri në 4. Zgjedhjet e mirëseardhjes janë gati këtu.')];
  const partyChoices: Choice<JourneySurveyValues['party']>[] = [
    { value: 'solo', label: copy('Tek başıma', 'Solo', 'Vetëm'), icon: 'user' },
    { value: 'couple', label: copy('Çift olarak', 'As a couple', 'Në çift'), icon: 'heart' },
    { value: 'friends', label: copy('Arkadaşlarla', 'With friends', 'Me miq'), icon: 'users' },
    { value: 'family', label: copy('Ailece', 'With family', 'Me familjen'), icon: 'home' },
  ];
  const budgetChoices: Choice<JourneySurveyValues['budget']>[] = [
    { value: 'economical', label: copy('Ekonomik', 'On a budget', 'Ekonomik') },
    { value: 'moderate', label: copy('Orta bütçe', 'Mid-range', 'Mesatar') },
    { value: 'comfortable', label: copy('Rahat bütçe', 'Flexible budget', 'Fleksibël') },
  ];
  const paceChoices: Choice<JourneySurveyValues['pace']>[] = [
    { value: 'relaxed', label: copy('Sakin', 'Relaxed', 'I qetë') },
    { value: 'balanced', label: copy('Dengeli', 'Balanced', 'I balancuar') },
    { value: 'busy', label: copy('Dolu dolu', 'See more', 'Plot aktivitete') },
  ];
  const walkingChoices: Choice<JourneySurveyValues['walking']>[] = [
    { value: 'light', label: copy('Az yürüyeyim', 'Less walking', 'Më pak ecje') },
    { value: 'standard', label: copy('Yürümeyi severim', 'I enjoy walking', 'Më pëlqen ecja') },
  ];
  const interestChoices: Choice<JourneySurveyValues['interests'][number]>[] = [
    { value: 'city', label: copy('Şehir', 'City sights', 'Qytet'), artwork: 'city' },
    { value: 'culture', label: copy('Tarih & kültür', 'History & culture', 'Histori & kulturë'), artwork: 'culture' },
    { value: 'food', label: copy('Yerel lezzetler', 'Local food', 'Ushqim vendas'), artwork: 'food' },
    { value: 'sea', label: copy('Deniz', 'Coast', 'Bregdet'), artwork: 'coast' },
    { value: 'nature', label: copy('Doğa & manzara', 'Nature & views', 'Natyrë & pamje'), artwork: 'nature' },
    { value: 'adventure', label: copy('Macera', 'Adventure', 'Aventurë'), artwork: 'adventure' },
    { value: 'shopping', label: copy('Alışveriş', 'Shopping', 'Blerje'), artwork: 'shopping' },
  ];
  const budgetHint = budget === 'economical' ? copy('Ücretsiz yerler ve uygun fiyatlı yemek seçenekleri öne çıkar.', 'Prioritises free places and affordable food.', 'Jep përparësi vendeve falas dhe ushqimit ekonomik.')
    : budget === 'comfortable' ? copy('Ücretli deneyimler ve daha çeşitli restoranlar plana eklenebilir.', 'Allows paid experiences and more restaurant choices.', 'Lejon përvoja me pagesë dhe më shumë zgjedhje restorantesh.')
      : copy('Ücretsiz gezilerle ücretli deneyimler dengelenir.', 'Balances free sights and paid experiences.', 'Balancon vendet falas me përvojat me pagesë.');
  const paceHint = pace === 'relaxed' ? copy('Daha az durak, uzun ziyaretler ve bol mola.', 'Fewer stops, longer visits and more breaks.', 'Më pak ndalesa, vizita më të gjata dhe më shumë pushime.')
    : pace === 'busy' ? copy('Daha fazla durak ve daha kısa ziyaretler; günün daha dolu geçer.', 'More stops and shorter visits for a fuller day.', 'Më shumë ndalesa dhe vizita më të shkurtra për ditë më të mbushura.')
      : copy('Gezme ve dinlenme arasında dengeli bir günlük plan.', 'A balanced day with time to explore and rest.', 'Një ditë e balancuar me kohë për eksplorim dhe pushim.');
  const walkingHint = walking === 'light' ? copy('Birbirine yakın duraklar ve kısa yürüyüşler önceliklenir.', 'Prioritises nearby stops and shorter walks.', 'Jep përparësi ndalesave të afërta dhe ecjeve më të shkurtra.')
    : copy('Duraklar arasında yürüyüşe daha fazla yer ayrılır; gerçek süreleri rotanda göreceksin.', 'Allows more walking between stops; your route will show the travel times.', 'Lejon më shumë ecje mes ndalesave; itinerari do të tregojë kohët e udhëtimit.');
  const validationText = fieldError === 'query' ? copy('Aramak için en az 3 karakter yaz.', 'Enter at least 3 characters to search.', 'Shkruaj të paktën 3 karaktere për të kërkuar.')
    : fieldError === 'destination' ? copy('Gideceğin yeri yaz ve aşağıdaki sonuçlardan birini seç.', 'Type a destination and choose a result below.', 'Shkruaj destinacionin dhe zgjidh një rezultat më poshtë.')
    : fieldError === 'days' ? copy('1 ile 14 arasında bir gün sayısı yaz.', 'Enter a whole number of days from 1 to 14.', 'Shkruaj një numër të plotë ditësh nga 1 deri në 14.')
      : fieldError === 'date' ? copy('Geçerli bir başlangıç tarihi seç veya Esnek seçeneğine geç.', 'Choose a valid start date or switch to Flexible.', 'Zgjidh një datë të vlefshme ose kalo te Fleksibël.')
        : fieldError === 'time' ? copy('00:00–22:00 arasında bir saat seç veya boş bırak.', 'Choose a time from 00:00 to 22:00 or leave it empty.', 'Zgjidh një orë nga 00:00 deri në 22:00 ose lëre bosh.')
        : fieldError === 'interests' ? copy('En az bir ilgi alanı seç.', 'Choose at least one interest.', 'Zgjidh të paktën një interes.')
          : fieldError === 'notes' ? copy('Özel isteğini 1.000 karakterle sınırla.', 'Keep your request within 1,000 characters.', 'Kufizoje kërkesën në 1.000 karaktere.') : '';

  function clearSearch() {
    sequence.current++;
    request.current?.abort();
    request.current = null;
    setResults([]);
    setActiveResult(-1);
    setSearchState('idle');
  }
  function editQuery(value: string) {
    clearSearch();
    setQuery(value);
    setArea(null);
    setFieldError(null);
  }
  function chooseArea(next: JourneyArea) {
    clearSearch();
    setArea(next);
    setQuery(next.name);
    setFieldError(null);
    cityInput.current?.blur?.();
  }
  function retrySearch() {
    if (query.trim().length < 3) { setFieldError('query'); cityInput.current?.focus(); return; }
    setSearchRetry(value => value + 1);
  }
  function fail(field: FieldError) {
    setFieldError(field);
    const element = field === 'destination' || field === 'query' ? cityInput.current : field === 'days' ? daysInput.current
      : field === 'date' ? dateInput.current : field === 'time' ? timeInput.current : field === 'interests' ? interestsField.current : notesInput.current;
    element?.focus();
  }
  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitted.current || currentStep.current !== step) return;
    if (step === 0 && !area) { fail('destination'); return; }
    const dayCount = Number(dayText);
    if (step >= 1 && (!/^\d{1,2}$/.test(dayText) || dayCount < 1 || dayCount > 14)) { fail('days'); return; }
    if (step >= 1 && dateMode === 'specific' && (!startDate || !validDate(startDate))) { fail('date'); return; }
    if (step >= 1 && firstDayStartTime && (!/^([01]\d|2[0-2]):[0-5]\d$/.test(firstDayStartTime) || firstDayStartTime > '22:00')) { fail('time'); return; }
    if (step < 3) { clearSearch(); setFieldError(null); currentStep.current = step + 1; setStep(step + 1); return; }
    if (!interests.length) { fail('interests'); return; }
    if (notes.length > 1000) { fail('notes'); return; }
    if (!area) { currentStep.current = 0; setStep(0); setFieldError('destination'); return; }
    submitted.current = true;
    setFieldError(null);
    onGenerate({ area, dayCount, startDate: dateMode === 'specific' ? startDate : null, ...(firstDayStartTime ? { firstDayStartTime } : {}), party, budget, pace, walking, interests: [...interests], notes: notes.trim() });
  }

  function goToStep(next: number) {
    if (busy || submitted.current) return;
    clearSearch(); setFieldError(null); currentStep.current = next; setStep(next);
  }
  function changeDay(value: string) { setDayText(value); setFieldError(null); }

  return <section ref={shell} className="jsv-shell" aria-label={copy('Sana özel rota', 'Your personal itinerary', 'Itinerari yt personal')} aria-busy={busy}>
    <div className="jsv-topline"><span><Icon name="sparkles" size={16} />{copy('SANA ÖZEL ROTA', 'YOUR PERSONAL ITINERARY', 'ITINERARI YT PERSONAL')}</span><span>{copy(`${step + 1} / 4 adım`, `Step ${step + 1} of 4`, `Hapi ${step + 1} nga 4`)}</span></div>
    <ol className="jsv-progress" aria-label={copy('Planlama adımları', 'Planning steps', 'Hapat e planifikimit')}>
      {steps.map((name, index) => <li key={index} className={index <= step ? 'is-reached' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true" /><span>{name}</span></li>)}
    </ol>
    <form className="jsv-form" noValidate onSubmit={advance}>
      <div className="jsv-scroll" ref={scroll}>
        {step > 0 && <div className="jsv-completed">
          <button type="button" disabled={busy} onClick={() => goToStep(0)}><span>{steps[0]}</span><strong>{area?.name}<small>{area?.address && area.address !== area.name ? area.address : copy('Değiştir', 'Edit', 'Ndrysho')}</small></strong><Icon name="chevron" size={16} /></button>
          {step > 1 && <button type="button" disabled={busy} onClick={() => goToStep(1)}><span>{steps[1]}</span><strong>{copy(`${dayText} gün`, `${dayText} days`, `${dayText} ditë`)}<small>{dateMode === 'specific' ? startDate : copy('Tarihlerim esnek', 'Flexible dates', 'Data fleksibël')}{firstDayStartTime ? ` · ${copy('İlk gün', 'First day', 'Dita e parë')} ${firstDayStartTime}` : ''}</small></strong><Icon name="chevron" size={16} /></button>}
          {step > 2 && <button type="button" disabled={busy} onClick={() => goToStep(2)}><span>{steps[2]}</span><strong>{partyChoices.find(choice => choice.value === party)?.label}<small>{paceChoices.find(choice => choice.value === pace)?.label} · {budgetChoices.find(choice => choice.value === budget)?.label}</small></strong><Icon name="chevron" size={16} /></button>}
        </div>}
        <div className="jsv-card">
        <div className="jsv-heading">
          <h3 ref={heading} tabIndex={-1}>{titles[step]}</h3>
          <p>{descriptions[step]}</p>
        </div>

        {step === 0 && <div className="jsv-destination">
          <label className="jsv-field" htmlFor="jsv-city">{copy('Gideceğin yer', 'Destination', 'Destinacioni')}</label>
          <div className="jsv-search">
            <Icon name="search" size={20} />
            <input ref={cityInput} id="jsv-city" data-guide="journey-destination" type="search" role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} aria-controls={results.length ? 'jsv-results' : undefined} aria-activedescendant={activeResult >= 0 && results[activeResult] ? `jsv-result-${activeResult}` : undefined} value={query} maxLength={160} autoComplete="off" enterKeyHint="done" placeholder={copy('Örn. İstanbul, Kadıköy, Moda', 'City, district or neighbourhood', 'Qytet, rreth ose lagje')} disabled={busy} aria-invalid={fieldError === 'destination' || fieldError === 'query'} aria-describedby={fieldError === 'destination' || fieldError === 'query' ? 'jsv-validation' : 'jsv-city-hint'} onChange={event => editQuery(event.target.value)} onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActiveResult(current => results.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : -1); }
              if (event.key === 'Escape') { event.preventDefault(); clearSearch(); }
              if (event.key === 'Enter') { event.preventDefault(); if (activeResult >= 0 && results[activeResult]) chooseArea(results[activeResult]); else if (!area) retrySearch(); }
            }} />
            {query && <button type="button" className="jsv-clear" disabled={busy} aria-label={copy('Yeri temizle', 'Clear destination', 'Pastro destinacionin')} onClick={() => { editQuery(''); cityInput.current?.focus(); }}><Icon name="close" size={17} /></button>}
          </div>
          <p id="jsv-city-hint" className="jsv-hint">{copy('Yazdıkça öneriler görünür. Doğru yeri seçmek için altındaki adresi kontrol et.', 'Suggestions appear as you type. Check the address to pick the right place.', 'Sugjerimet shfaqen ndërsa shkruan. Kontrollo adresën për të zgjedhur vendin e duhur.')}</p>
          <div className="jsv-search-feedback" aria-live="polite">
            {searchState === 'loading' && <p className="jsv-hint">{copy('Diğer yerler aranıyor…', 'Finding more places…', 'Po kërkohen vende të tjera…')}</p>}
            {searchState === 'empty' && <p className="jsv-search-message">{copy('Sonuç bulunamadı. Yer adının yanına il veya ülke eklemeyi dene.', 'No match found. Try adding the city or country.', 'Nuk u gjet rezultat. Provo të shtosh qytetin ose shtetin.')}</p>}
            {searchState === 'error' && <div className="jsv-search-message">{copy('Arama yanıt vermedi. Yazdıkların korundu.', 'Search did not respond. Your text is kept.', 'Kërkimi nuk u përgjigj. Teksti yt është ruajtur.')}<button type="button" className="jsv-text-button" onClick={retrySearch}>{copy('Tekrar dene', 'Try again', 'Provo përsëri')}</button></div>}
          </div>
          {results.length > 0 && <ul id="jsv-results" className="jsv-results" role="listbox" aria-label={copy('Yer önerileri', 'Destination suggestions', 'Sugjerimet e destinacioneve')}>
            {results.map((result, index) => <li role="presentation" key={`${result.latitude}:${result.longitude}:${index}`}><button id={`jsv-result-${index}`} role="option" aria-selected={index === activeResult} type="button" onClick={() => chooseArea(result)} disabled={busy}><Icon name="map" size={19} /><span>{result.name}{result.address && result.address !== result.name && <small>{result.address}</small>}</span><Icon name="chevron" size={17} /></button></li>)}
          </ul>}
          {area && <div className="jsv-selected" role="status"><span><Icon name="check" size={20} /></span><div><small>{copy('Gideceğin yer', 'Your destination', 'Destinacioni yt')}</small><strong>{area.name}</strong>{area.address && area.address !== area.name && <small>{area.address}</small>}</div></div>}
          <div className="jsv-examples"><small>{copy('Bir fikirle başla', 'Start with an idea', 'Fillo me një ide')}</small><div>{EXAMPLE_CITIES.map(city => <button type="button" key={city} disabled={busy} onClick={() => { const known = knownJourneyArea(city); if (known) chooseArea(known); }}><Icon name="map" size={14} />{city}</button>)}</div></div>
          {savedPlans.length > 0 && onOpenSaved && <details className="jsv-saved"><summary><Icon name="bookmark" size={17} />{copy('Kayıtlı planlarım', 'My saved plans', 'Planet e mia të ruajtura')}<span>{savedPlans.length}</span></summary><div>{savedPlans.map(plan => <button type="button" key={plan.id} disabled={busy} onClick={() => { clearSearch(); onOpenSaved(plan.id); }}><span><strong>{plan.city}</strong><small>{copy(`${plan.dayCount} gün`, `${plan.dayCount} days`, `${plan.dayCount} ditë`)}</small></span><Icon name="chevron" size={18} /></button>)}</div></details>}
        </div>}

        {step === 1 && <div className="jsv-timing">
          <div className="jsv-segment" role="group" aria-label={copy('Tarih tercihin', 'Date preference', 'Preferenca e datës')}>
            <button type="button" aria-pressed={dateMode === 'flexible'} disabled={busy} onClick={() => { setDateMode('flexible'); setFieldError(null); }}>{copy('Esnek', 'Flexible', 'Fleksibël')}</button>
            <button type="button" aria-pressed={dateMode === 'specific'} disabled={busy} onClick={() => { setDateMode('specific'); setFieldError(null); }}>{copy('Tarihim belli', 'Specific dates', 'Data të caktuara')}</button>
          </div>
          <label className="jsv-field" htmlFor="jsv-days">{copy('Kaç gün?', 'How many days?', 'Sa ditë?')}</label>
          <div className="jsv-wheel-wrap"><div ref={wheel} className="jsv-wheel" role="listbox" aria-label={copy('Gün sayısını kaydırarak seç', 'Scroll to choose the number of days', 'Lëviz për të zgjedhur numrin e ditëve')} aria-activedescendant={/^\d+$/.test(dayText) && Number(dayText) >= 1 && Number(dayText) <= 14 ? `jsv-day-${dayText}` : undefined} tabIndex={busy ? -1 : 0} aria-disabled={busy} onKeyDown={event => {
            if (!busy && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); changeDay(String(event.key === 'Home' ? 1 : event.key === 'End' ? 14 : Math.min(14, Math.max(1, (Number(dayText) || 1) + (event.key === 'ArrowUp' ? -1 : 1))))); }
          }} onScroll={event => {
            if (busy) return;
            const offset = event.currentTarget.scrollTop;
            if (wheelTimer.current) clearTimeout(wheelTimer.current);
            wheelTimer.current = setTimeout(() => changeDay(String(Math.min(14, Math.max(1, Math.round(offset / 60) + 1)))), 90);
          }}>{Array.from({ length: 14 }, (_, index) => index + 1).map(count => <button id={`jsv-day-${count}`} role="option" aria-selected={dayText === String(count)} tabIndex={-1} key={count} type="button" disabled={busy} onClick={() => changeDay(String(count))}>{count}</button>)}</div></div>
          <div className="jsv-days-input"><input ref={daysInput} id="jsv-days" type="number" inputMode="numeric" min={1} max={14} step={1} value={dayText} disabled={busy} aria-invalid={fieldError === 'days'} aria-describedby={fieldError === 'days' ? 'jsv-validation' : 'jsv-days-hint'} onChange={event => changeDay(event.target.value)} /><span>{copy('gün', 'days', 'ditë')}</span></div>
          <p className="jsv-hint" id="jsv-days-hint">{copy('Kaydır veya sayıyı yaz · 1–14 gün', 'Scroll or type a number · 1–14 days', 'Lëviz ose shkruaj numrin · 1–14 ditë')}</p>
          {dateMode === 'specific' && <>
          <label className="jsv-field jsv-date-label" htmlFor="jsv-date">{copy('Başlangıç tarihi', 'Start date', 'Data e fillimit')}</label>
          <input ref={dateInput} className="jsv-date" id="jsv-date" type="date" value={startDate} disabled={busy} aria-invalid={fieldError === 'date'} aria-describedby={fieldError === 'date' ? 'jsv-validation' : undefined} onChange={event => { setStartDate(event.target.value); setFieldError(null); }} />
          </>}
          <details className="jsv-time-details" open={firstDayStartTime ? true : undefined}><summary>{copy('İlk gün geç mi başlayacaksın?', 'Starting later on the first day?', 'Do ta nisësh më vonë ditën e parë?')}<span>{copy('İsteğe bağlı', 'Optional', 'Opsionale')}</span></summary>
            <label className="jsv-field" htmlFor="jsv-time">{copy('Gezmeye başlama saatin', 'Start exploring at', 'Nis eksplorimin në')}</label>
            <input ref={timeInput} id="jsv-time" className="jsv-date" type="time" max="22:00" value={firstDayStartTime} disabled={busy} onChange={event => { setFirstDayStartTime(event.target.value); setFieldError(null); }} aria-invalid={fieldError === 'time'} aria-describedby={fieldError === 'time' ? 'jsv-validation' : 'jsv-time-hint'} />
            <p id="jsv-time-hint" className="jsv-hint">{copy('Boş bırakırsan 09.00’da başlar. Bu saat yalnız ilk gününü kısaltır.', 'Defaults to 09:00 if empty. This time shortens only your first day.', 'Nëse lihet bosh fillon në 09:00. Kjo orë shkurton vetëm ditën e parë.')}</p>
          </details>
        </div>}

        {step === 2 && <div className="jsv-style">
          <ChoiceGroup<JourneySurveyValues['party']> label={copy('Kiminle gidiyorsun?', 'Who are you travelling with?', 'Me kë po udhëton?')} name="jsv-party" choices={partyChoices} value={party} onChange={setParty} disabled={busy} />
          <ChoiceGroup<JourneySurveyValues['budget']> label={copy('Bütçen nasıl olsun?', 'What is your budget style?', 'Çfarë buxheti dëshiron?')} name="jsv-budget" choices={budgetChoices} value={budget} onChange={setBudget} disabled={busy} hint={budgetHint} />
          <ChoiceGroup<JourneySurveyValues['pace']> label={copy('Günlerin nasıl geçsin?', 'How full should your days be?', 'Sa të mbushura t’i kesh ditët?')} name="jsv-pace" choices={paceChoices} value={pace} onChange={setPace} disabled={busy} hint={paceHint} />
          <ChoiceGroup<JourneySurveyValues['walking']> label={copy('Ne kadar yürümek istersin?', 'How much would you like to walk?', 'Sa dëshiron të ecësh?')} name="jsv-walking" choices={walkingChoices} value={walking} onChange={setWalking} disabled={busy} hint={walkingHint} />
        </div>}

        {step === 3 && <div className="jsv-final">
          <fieldset ref={interestsField} className="jsv-interests" tabIndex={-1} disabled={busy} aria-invalid={fieldError === 'interests'} aria-describedby={fieldError === 'interests' ? 'jsv-validation' : undefined}>
            <legend>{copy('İlgi alanların', 'Your interests', 'Interesat e tua')}</legend>
            <div>{interestChoices.map(choice => <label key={choice.value} className={interests.includes(choice.value) ? 'is-selected' : ''}><input type="checkbox" value={choice.value} checked={interests.includes(choice.value)} disabled={busy || interests.length >= 4 && !interests.includes(choice.value)} onChange={() => { setInterests(current => current.includes(choice.value) ? current.filter(item => item !== choice.value) : current.length < 4 ? [...current, choice.value] : current); setFieldError(null); }} /><span className="jsv-artwork"><WelcomeArtwork kind={choice.artwork!} size={52} /></span><strong>{choice.label}</strong><span className="jsv-check" aria-hidden="true">{interests.includes(choice.value) && <Icon name="check" size={13} />}</span></label>)}</div>
            <p className="jsv-hint" aria-live="polite">{copy(`${interests.length}/4 seçildi${interests.length === 4 ? ' · Değiştirmek için bir seçimi kaldır.' : ''}`, `${interests.length}/4 selected${interests.length === 4 ? ' · Remove one to choose another.' : ''}`, `${interests.length}/4 të zgjedhura${interests.length === 4 ? ' · Hiq një për të zgjedhur tjetër.' : ''}`)}</p>
          </fieldset>
          <label className="jsv-field" htmlFor="jsv-notes">{copy('Başka bir isteğin var mı?', 'Anything else you would like?', 'Ke ndonjë dëshirë tjetër?')}<small>{copy('İsteğe bağlı', 'Optional', 'Opsionale')}</small></label>
          <textarea ref={notesInput} id="jsv-notes" rows={3} maxLength={1000} value={notes} disabled={busy} placeholder={copy('Örn. Kalabalıktan uzak yerler, gün batımı ve iyi kahve. Çocuklarım 5 ve 8 yaşında.', 'E.g. Quiet places, sunsets and good coffee. My children are 5 and 8.', 'P.sh. Vende të qeta, perëndime dhe kafe të mirë. Fëmijët e mi janë 5 dhe 8 vjeç.')} aria-invalid={fieldError === 'notes'} aria-describedby={fieldError === 'notes' ? 'jsv-validation' : 'jsv-notes-count'} onChange={event => { setNotes(event.target.value); setFieldError(null); }} />
          <small id="jsv-notes-count" className="jsv-count">{notes.length} / 1000</small>
          <div className="jsv-summary"><span><Icon name="route" size={21} /></span><div><strong>{area?.name} · {copy(`${dayText} gün`, `${dayText} days`, `${dayText} ditë`)}</strong><p>{[partyChoices.find(choice => choice.value === party)?.label, paceChoices.find(choice => choice.value === pace)?.label, budgetChoices.find(choice => choice.value === budget)?.label].filter(Boolean).join(' · ')}</p></div></div>
          <p className="jsv-expectation">{copy('AI, tercihlerini ve mekânların konumlarını değerlendirerek günlerini planlar. Rotanı haritada görecek, durakları dilediğin gibi değiştirebileceksin.', 'AI plans your days around your preferences and place locations. View the itinerary on the map and change any stop afterwards.', 'AI planifikon ditët sipas preferencave dhe vendndodhjes së vendeve. Shihe itinerarin në hartë dhe ndrysho çdo ndalesë më pas.')}</p>
        </div>}

        </div>
        {storageError && <p className="jsv-draft-warning" role="status">{copy('Bu cihaz yanıtlarını saklayamıyor. Kaybetmemek için planın hazır olana kadar bu ekranı açık tut.', 'This device cannot keep your answers. Keep this screen open until your plan is ready.', 'Pajisja nuk mund t’i ruajë përgjigjet. Mbaje ekranin hapur derisa plani të jetë gati.')}</p>}
        {validationText && <p className="jsv-error" id="jsv-validation" role="alert">{validationText}</p>}
        {error && <p className="jsv-error" role="alert">{error}</p>}
        {busy && <div className="jsv-generating" role="status"><span className="jsv-spinner" aria-hidden="true" /><div><strong>{copy('Sana özel rota hazırlanıyor', 'Creating your personal itinerary', 'Po krijohet itinerari yt personal')}</strong><p>{copy('Mekânlar ve gün planın değerlendiriliyor. Bu işlem biraz sürebilir.', 'Reviewing places and your day plan. This may take a moment.', 'Po vlerësohen vendet dhe plani ditor. Kjo mund të zgjasë pak.')}</p></div></div>}
      </div>

      <footer className="jsv-footer">
        {busy ? onCancel && <button type="button" className="jsv-cancel" onClick={() => { submitted.current = false; onCancel(); }}>{copy('Durdur ve tercihleri düzenle', 'Stop and edit my choices', 'Ndalo dhe ndrysho zgjedhjet')}</button> : <>
          {step > 0 && <button type="button" className="jsv-back" onClick={() => { if (submitted.current || currentStep.current !== step) return; setFieldError(null); currentStep.current = step - 1; setStep(step - 1); }}><Icon name="back" size={19} /><span>{copy('Geri', 'Back', 'Prapa')}</span></button>}
          <button type="submit" className="jsv-primary">{step === 3 && <Icon name="sparkles" size={19} />}<span>{step === 3 ? copy('AI rotamı oluştur', 'Create my AI itinerary', 'Krijo itinerarin me AI') : copy('Devam et', 'Continue', 'Vazhdo')}</span>{step < 3 && <Icon name="chevron" size={19} />}</button>
        </>}
        {step === 3 && !busy && <small>{copy('Yürüyüş süreleri yalnız yolda geçen süredir; ziyaret ve molalar ayrıdır.', 'Walking times cover travel only; visits and breaks are separate.', 'Koha e ecjes përfshin vetëm rrugën; vizitat dhe pushimet janë veçmas.')}</small>}
      </footer>
    </form>
  </section>;
}
