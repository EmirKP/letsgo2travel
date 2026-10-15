import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../lib/i18n';
import { knownJourneyArea, searchJourneyArea, type JourneyArea } from '../lib/mapJourneyClient';
import { Icon, type IconName } from './Icon';
import './journey-setup-survey.css';

export type JourneySurveyValues = {
  area: JourneyArea;
  dayCount: number;
  startDate: string | null;
  party: 'solo' | 'couple' | 'friends' | 'family';
  budget: 'economical' | 'moderate' | 'comfortable';
  pace: 'relaxed' | 'balanced' | 'busy';
  walking: 'light' | 'standard';
  interests: ('culture' | 'food' | 'shopping' | 'nature')[];
  notes: string;
};

type Props = {
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
type Choice<T extends string> = { value: T; label: string; icon?: IconName };
type FieldError = 'destination' | 'query' | 'days' | 'date' | 'interests' | 'notes' | null;
type SearchState = 'idle' | 'loading' | 'empty' | 'error';
const EXAMPLE_CITIES = ['İstanbul', 'Paris', 'Tokyo', 'Tirana'];
const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

function ChoiceGroup<T extends string>({ label, name, choices, value, onChange, disabled, hint }: {
  label: string; name: string; choices: Choice<T>[]; value: T; onChange: (value: T) => void; disabled: boolean; hint?: string;
}) {
  return <fieldset className="jsv-choices" disabled={disabled}>
    <legend>{label}</legend>
    {hint && <p className="jsv-hint">{hint}</p>}
    <div className="jsv-choice-row">
      {choices.map(choice => <label key={choice.value} className={`jsv-choice${value === choice.value ? ' is-selected' : ''}`}>
        <input type="radio" name={name} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
        {choice.icon && <Icon name={choice.icon} size={18} />}
        <span>{choice.label}</span>
      </label>)}
    </div>
  </fieldset>;
}

/** Only resolved destinations reach generation; typed text never reuses an old city's coordinates. */
export function JourneySetupSurvey({ initialCity = '', initialValues, busy = false, error = '', onGenerate, onCancel, savedPlans = [], onOpenSaved }: Props) {
  const { copy, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState(initialValues?.area.name || initialCity);
  const [area, setArea] = useState<JourneyArea | null>(() => initialValues?.area || knownJourneyArea(initialCity));
  const [results, setResults] = useState<JourneyArea[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [dayText, setDayText] = useState(String(initialValues?.dayCount ?? 3));
  const [startDate, setStartDate] = useState(initialValues?.startDate || '');
  const [party, setParty] = useState<JourneySurveyValues['party']>(initialValues?.party || 'solo');
  const [budget, setBudget] = useState<JourneySurveyValues['budget']>(initialValues?.budget || 'moderate');
  const [pace, setPace] = useState<JourneySurveyValues['pace']>(initialValues?.pace || 'balanced');
  const [walking, setWalking] = useState<JourneySurveyValues['walking']>(initialValues?.walking || 'standard');
  const [interests, setInterests] = useState<JourneySurveyValues['interests']>(() => initialValues ? [...initialValues.interests] : ['culture', 'food']);
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const cityInput = useRef<HTMLInputElement>(null);
  const daysInput = useRef<HTMLInputElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const interestsField = useRef<HTMLFieldSetElement>(null);
  const notesInput = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const submitted = useRef(false);
  const currentStep = useRef(0);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [step]);
  useEffect(() => {
    sequence.current++;
    request.current?.abort();
    request.current = null;
    setSearchState('idle');
    setResults([]);
    return () => { sequence.current++; request.current?.abort(); request.current = null; };
  }, [locale]);
  useEffect(() => { if (!busy) submitted.current = false; }, [busy, error]);

  const steps = [copy('Nereye', 'Where', 'Ku'), copy('Ne zaman', 'When', 'Kur'), copy('Gezi tarzın', 'Your style', 'Stili yt'), copy('İlgi alanların', 'Your interests', 'Interesat')];
  const titles = [copy('Nereye gitmek istiyorsun?', 'Where would you like to go?', 'Ku dëshiron të shkosh?'), copy('Kaç gün keşfedeceksin?', 'How many days will you explore?', 'Sa ditë do të eksplorosh?'), copy('Nasıl bir gezi olsun?', 'What is your travel style?', 'Çfarë udhëtimi dëshiron?'), copy('Seni en çok ne heyecanlandırır?', 'What would you love to discover?', 'Çfarë dëshiron të zbulosh?')];
  const descriptions = [copy('Şehrini seç. Yapay zekâ, kısa yanıtlarına göre sana özel bir gezi planlasın.', 'Choose a city. AI will plan a personal trip from your short answers.', 'Zgjidh qytetin. AI do të planifikojë një udhëtim personal sipas përgjigjeve të tua.'), copy('Gün sayısı yeterli. Tarihlerin belli değilse boş bırakabilirsin.', 'The number of days is enough. Leave the date empty if you have not decided.', 'Mjafton numri i ditëve. Lëre datën bosh nëse nuk e ke vendosur.'), copy('Rotanın temposunu ve önerilerini sana göre ayarlayalım.', 'Let’s match the pace and suggestions to you.', 'Le ta përshtatim ritmin dhe sugjerimet me ty.'), copy('Bir veya daha fazla seçim yap. İstersen özel bir isteğini de ekle.', 'Choose one or more. You can also add a special request.', 'Zgjidh një ose më shumë. Mund të shtosh edhe një kërkesë të veçantë.')];
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
    { value: 'culture', label: copy('Tarih & kültür', 'History & culture', 'Histori & kulturë'), icon: 'book' },
    { value: 'food', label: copy('Yerel lezzetler', 'Local food', 'Ushqim vendas'), icon: 'heart' },
    { value: 'nature', label: copy('Doğa & manzara', 'Nature & views', 'Natyrë & pamje'), icon: 'leaf' },
    { value: 'shopping', label: copy('Alışveriş & pazarlar', 'Shops & markets', 'Dyqane & tregje'), icon: 'suitcase' },
  ];
  const validationText = fieldError === 'query' ? copy('Aramak için en az 3 karakter yaz.', 'Enter at least 3 characters to search.', 'Shkruaj të paktën 3 karaktere për të kërkuar.')
    : fieldError === 'destination' ? copy('Önce bir şehir ara ve sonuçlardan seç.', 'Search for a city and choose a result first.', 'Kërko një qytet dhe zgjidh një rezultat fillimisht.')
    : fieldError === 'days' ? copy('1 ile 14 arasında bir gün sayısı yaz.', 'Enter a whole number of days from 1 to 14.', 'Shkruaj një numër të plotë ditësh nga 1 deri në 14.')
      : fieldError === 'date' ? copy('Geçerli bir tarih seç veya tarih alanını boş bırak.', 'Choose a valid date or leave it empty.', 'Zgjidh një datë të vlefshme ose lëre bosh.')
        : fieldError === 'interests' ? copy('En az bir ilgi alanı seç.', 'Choose at least one interest.', 'Zgjidh të paktën një interes.')
          : fieldError === 'notes' ? copy('Özel isteğini 1.000 karakterle sınırla.', 'Keep your request within 1,000 characters.', 'Kufizoje kërkesën në 1.000 karaktere.') : '';

  function clearSearch() {
    sequence.current++;
    request.current?.abort();
    request.current = null;
    setResults([]);
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
  }
  async function findCity() {
    if (busy || request.current || searchState === 'loading') return;
    if (query.trim().length < 3) { setFieldError('query'); cityInput.current?.focus(); return; }
    clearSearch();
    const id = ++sequence.current;
    const controller = new AbortController();
    request.current = controller;
    setSearchState('loading');
    setFieldError(null);
    try {
      const found = await searchJourneyArea(query.trim(), controller.signal, locale);
      if (sequence.current !== id || controller.signal.aborted) return;
      setResults(found);
      setSearchState(found.length ? 'idle' : 'empty');
    } catch {
      if (sequence.current === id && !controller.signal.aborted) setSearchState('error');
    } finally {
      if (sequence.current === id) request.current = null;
    }
  }
  function fail(field: FieldError) {
    setFieldError(field);
    const element = field === 'destination' || field === 'query' ? cityInput.current : field === 'days' ? daysInput.current
      : field === 'date' ? dateInput.current : field === 'interests' ? interestsField.current : notesInput.current;
    element?.focus();
  }
  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitted.current || currentStep.current !== step) return;
    if (step === 0 && !area) { fail('destination'); return; }
    const dayCount = Number(dayText);
    if (step === 1 && (!/^\d{1,2}$/.test(dayText) || dayCount < 1 || dayCount > 14)) { fail('days'); return; }
    if (step === 1 && !validDate(startDate)) { fail('date'); return; }
    if (step < 3) { clearSearch(); setFieldError(null); currentStep.current = step + 1; setStep(step + 1); return; }
    if (!interests.length) { fail('interests'); return; }
    if (notes.length > 1000) { fail('notes'); return; }
    if (!area) { currentStep.current = 0; setStep(0); setFieldError('destination'); return; }
    submitted.current = true;
    setFieldError(null);
    onGenerate({ area, dayCount, startDate: startDate || null, party, budget, pace, walking, interests: [...interests], notes: notes.trim() });
  }

  return <section className="jsv-shell" aria-label={copy('Sana özel rota', 'Your personal itinerary', 'Itinerari yt personal')} aria-busy={busy}>
    <div className="jsv-topline"><span><Icon name="sparkles" size={16} />{copy('SANA ÖZEL ROTA', 'YOUR PERSONAL ITINERARY', 'ITINERARI YT PERSONAL')}</span><span>{copy(`${step + 1} / 4 adım`, `Step ${step + 1} of 4`, `Hapi ${step + 1} nga 4`)}</span></div>
    <ol className="jsv-progress" aria-label={copy('Planlama adımları', 'Planning steps', 'Hapat e planifikimit')}>
      {steps.map((name, index) => <li key={index} className={index <= step ? 'is-reached' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true" /><span>{name}</span></li>)}
    </ol>
    <form className="jsv-form" noValidate onSubmit={advance}>
      <div className="jsv-scroll" ref={scroll}>
        <div className="jsv-heading">
          <span className="jsv-heading-icon"><Icon name={(['globe', 'calendar', 'compass', 'sparkles'] as const)[step]} size={27} /></span>
          <h3 ref={heading} tabIndex={-1}>{titles[step]}</h3>
          <p>{descriptions[step]}</p>
        </div>

        {step === 0 && <div className="jsv-destination">
          <label className="jsv-field" htmlFor="jsv-city">{copy('Gideceğin şehir', 'Destination city', 'Qyteti i destinacionit')}</label>
          <div className="jsv-search">
            <Icon name="search" size={20} />
            <input ref={cityInput} id="jsv-city" type="search" value={query} maxLength={160} autoComplete="off" enterKeyHint="search" placeholder={copy('Şehir veya bölge yaz', 'Enter a city or area', 'Shkruaj një qytet ose zonë')} disabled={busy} aria-invalid={fieldError === 'destination' || fieldError === 'query'} aria-describedby={fieldError === 'destination' || fieldError === 'query' ? 'jsv-validation' : 'jsv-city-hint'} onChange={event => editQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void findCity(); } }} />
            <button type="button" className="jsv-search-button" disabled={busy || searchState === 'loading'} onClick={() => void findCity()}>{searchState === 'loading' ? copy('Aranıyor…', 'Searching…', 'Duke kërkuar…') : copy('Ara', 'Search', 'Kërko')}</button>
          </div>
          <p id="jsv-city-hint" className="jsv-hint">{copy('Aklındaki herhangi bir şehri ara, ardından doğru sonucu seç.', 'Search for any city you have in mind, then choose the matching result.', 'Kërko çdo qytet që ke në mendje, pastaj zgjidh rezultatin e duhur.')}</p>
          <div className="jsv-search-feedback" aria-live="polite">
            {searchState === 'loading' && <p className="jsv-hint">{copy('Şehir bulunuyor…', 'Finding your city…', 'Duke gjetur qytetin…')}</p>}
            {searchState === 'empty' && <p className="jsv-search-message">{copy('Bu adla sonuç bulunamadı. Şehirle birlikte ülke adını da yazmayı dene.', 'No match found. Try adding the country to the city name.', 'Nuk u gjet rezultat. Provo të shtosh shtetin pas qytetit.')}</p>}
            {searchState === 'error' && <p className="jsv-search-message">{copy('Şehir araması şu anda yanıt vermiyor. Ara düğmesiyle tekrar deneyebilir veya aşağıdaki şehirlerden birini seçebilirsin.', 'City search is not responding. Search again or choose one of the cities below.', 'Kërkimi nuk po përgjigjet. Provo përsëri ose zgjidh një nga qytetet më poshtë.')}</p>}
          </div>
          {results.length > 0 && <ul className="jsv-results" aria-label={copy('Şehir sonuçları', 'City results', 'Rezultatet e qyteteve')}>
            {results.map((result, index) => <li key={`${result.latitude}:${result.longitude}:${index}`}><button type="button" onClick={() => chooseArea(result)} disabled={busy}><Icon name="map" size={19} /><span>{result.name}{result.address && result.address !== result.name && <small>{result.address}</small>}</span><Icon name="chevron" size={17} /></button></li>)}
          </ul>}
          {area && <div className="jsv-selected" role="status"><span><Icon name="check" size={20} /></span><div><small>{copy('Gideceğin yer', 'Your destination', 'Destinacioni yt')}</small><strong>{area.name}</strong>{area.address && area.address !== area.name && <small>{area.address}</small>}</div></div>}
          <div className="jsv-examples"><small>{copy('Bir fikirle başla', 'Start with an idea', 'Fillo me një ide')}</small><div>{EXAMPLE_CITIES.map(city => <button type="button" key={city} disabled={busy} onClick={() => { const known = knownJourneyArea(city); if (known) chooseArea(known); }}><Icon name="map" size={14} />{city}</button>)}</div></div>
          {savedPlans.length > 0 && onOpenSaved && <details className="jsv-saved"><summary><Icon name="bookmark" size={17} />{copy('Kayıtlı planlarım', 'My saved plans', 'Planet e mia të ruajtura')}<span>{savedPlans.length}</span></summary><div>{savedPlans.map(plan => <button type="button" key={plan.id} disabled={busy} onClick={() => { clearSearch(); onOpenSaved(plan.id); }}><span><strong>{plan.city}</strong><small>{copy(`${plan.dayCount} gün`, `${plan.dayCount} days`, `${plan.dayCount} ditë`)}</small></span><Icon name="chevron" size={18} /></button>)}</div></details>}
        </div>}

        {step === 1 && <div className="jsv-timing">
          <label className="jsv-field" htmlFor="jsv-days">{copy('Kaç gün?', 'How many days?', 'Sa ditë?')}</label>
          <div className="jsv-days-input"><input ref={daysInput} id="jsv-days" type="number" inputMode="numeric" min={1} max={14} step={1} value={dayText} disabled={busy} aria-invalid={fieldError === 'days'} aria-describedby={fieldError === 'days' ? 'jsv-validation' : 'jsv-days-hint'} onChange={event => { setDayText(event.target.value); setFieldError(null); }} /><span>{copy('gün', 'days', 'ditë')}</span></div>
          <p className="jsv-hint" id="jsv-days-hint">{copy('1–14 gün arasında, gün gün bir gezi planı.', 'A day-by-day itinerary for 1–14 days.', 'Një plan ditë pas dite, nga 1 deri në 14 ditë.')}</p>
          <div className="jsv-day-shortcuts">{[1, 3, 5, 7].map(count => <button type="button" aria-pressed={dayText === String(count)} key={count} disabled={busy} onClick={() => { setDayText(String(count)); setFieldError(null); }}>{copy(`${count} gün`, `${count} ${count === 1 ? 'day' : 'days'}`, `${count} ditë`)}</button>)}</div>
          <label className="jsv-field jsv-date-label" htmlFor="jsv-date">{copy('Başlangıç tarihi', 'Start date', 'Data e fillimit')}<small>{copy('İsteğe bağlı', 'Optional', 'Opsionale')}</small></label>
          <input ref={dateInput} className="jsv-date" id="jsv-date" type="date" value={startDate} disabled={busy} aria-invalid={fieldError === 'date'} aria-describedby={fieldError === 'date' ? 'jsv-validation' : undefined} onChange={event => { setStartDate(event.target.value); setFieldError(null); }} />
          {startDate ? <button type="button" className="jsv-text-button" disabled={busy} onClick={() => { setStartDate(''); setFieldError(null); }}>{copy('Tarihim henüz belli değil', 'My dates are not decided yet', 'Nuk i kam vendosur ende datat')}</button> : <p className="jsv-hint">{copy('Tarih seçmeden de devam edebilirsin.', 'You can continue without a date.', 'Mund të vazhdosh pa zgjedhur datë.')}</p>}
        </div>}

        {step === 2 && <div className="jsv-style">
          <ChoiceGroup<JourneySurveyValues['party']> label={copy('Kiminle gidiyorsun?', 'Who are you travelling with?', 'Me kë po udhëton?')} name="jsv-party" choices={partyChoices} value={party} onChange={setParty} disabled={busy} />
          <ChoiceGroup<JourneySurveyValues['budget']> label={copy('Bütçen nasıl olsun?', 'What is your budget style?', 'Çfarë buxheti dëshiron?')} name="jsv-budget" choices={budgetChoices} value={budget} onChange={setBudget} disabled={busy} />
          <ChoiceGroup<JourneySurveyValues['pace']> label={copy('Günlerin nasıl geçsin?', 'How full should your days be?', 'Sa të mbushura t’i kesh ditët?')} name="jsv-pace" choices={paceChoices} value={pace} onChange={setPace} disabled={busy} hint={copy('Sakin: daha az durak ve daha çok mola.', 'Relaxed means fewer stops and more breaks.', 'I qetë do të thotë më pak ndalesa dhe më shumë pushime.')} />
          <ChoiceGroup<JourneySurveyValues['walking']> label={copy('Ne kadar yürümek istersin?', 'How much would you like to walk?', 'Sa dëshiron të ecësh?')} name="jsv-walking" choices={walkingChoices} value={walking} onChange={setWalking} disabled={busy} />
        </div>}

        {step === 3 && <div className="jsv-final">
          <fieldset ref={interestsField} className="jsv-interests" tabIndex={-1} disabled={busy} aria-invalid={fieldError === 'interests'} aria-describedby={fieldError === 'interests' ? 'jsv-validation' : undefined}>
            <legend>{copy('İlgi alanların', 'Your interests', 'Interesat e tua')}</legend>
            <div>{interestChoices.map(choice => <label key={choice.value} className={interests.includes(choice.value) ? 'is-selected' : ''}><input type="checkbox" value={choice.value} checked={interests.includes(choice.value)} onChange={() => { setInterests(current => current.includes(choice.value) ? current.filter(item => item !== choice.value) : [...current, choice.value]); setFieldError(null); }} /><Icon name={choice.icon!} size={23} /><strong>{choice.label}</strong><span className="jsv-check" aria-hidden="true">{interests.includes(choice.value) && <Icon name="check" size={13} />}</span></label>)}</div>
          </fieldset>
          <label className="jsv-field" htmlFor="jsv-notes">{copy('Başka bir isteğin var mı?', 'Anything else you would like?', 'Ke ndonjë dëshirë tjetër?')}<small>{copy('İsteğe bağlı', 'Optional', 'Opsionale')}</small></label>
          <textarea ref={notesInput} id="jsv-notes" rows={3} maxLength={1000} value={notes} disabled={busy} placeholder={copy('Örn. Kalabalıktan uzak yerler, gün batımı ve iyi kahve. Çocuklarım 5 ve 8 yaşında.', 'E.g. Quiet places, sunsets and good coffee. My children are 5 and 8.', 'P.sh. Vende të qeta, perëndime dhe kafe të mirë. Fëmijët e mi janë 5 dhe 8 vjeç.')} aria-invalid={fieldError === 'notes'} aria-describedby={fieldError === 'notes' ? 'jsv-validation' : 'jsv-notes-count'} onChange={event => { setNotes(event.target.value); setFieldError(null); }} />
          <small id="jsv-notes-count" className="jsv-count">{notes.length} / 1000</small>
          <div className="jsv-summary"><span><Icon name="route" size={21} /></span><div><strong>{area?.name} · {copy(`${dayText} gün`, `${dayText} days`, `${dayText} ditë`)}</strong><p>{[partyChoices.find(choice => choice.value === party)?.label, paceChoices.find(choice => choice.value === pace)?.label, budgetChoices.find(choice => choice.value === budget)?.label].filter(Boolean).join(' · ')}</p></div></div>
          <p className="jsv-expectation">{copy('AI, tercihlerini ve mekânların konumlarını değerlendirerek günlerini planlar. Rotanı haritada görecek, durakları dilediğin gibi değiştirebileceksin.', 'AI plans your days around your preferences and place locations. View the itinerary on the map and change any stop afterwards.', 'AI planifikon ditët sipas preferencave dhe vendndodhjes së vendeve. Shihe itinerarin në hartë dhe ndrysho çdo ndalesë më pas.')}</p>
        </div>}

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
