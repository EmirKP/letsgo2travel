import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/useTheme";
import type { ThemePreference } from "../lib/theme";
import { WelcomeArtwork, type WelcomeArtworkKind } from "./WelcomeArtwork";
import { TravelToolArtwork } from "./TravelToolArtwork";
import { BrandMark } from "./BrandMark";
import { LanguageFlag } from "./LanguagePicker";
import { APP_LOCALES } from "../lib/locale";
import { readWelcomePreferences, saveWelcomePreferences, WELCOME_INTERESTS, type WelcomeIntent, type WelcomeInterest } from "../lib/onboardingPreferences";
import "./onboarding.css";

const languageNames = { tr: "Türkçe", en: "English", sq: "Shqip" };
const interestDetails: Record<WelcomeInterest, { artwork: WelcomeArtworkKind; en: string; sq: string }> = {
  "Şehir": { artwork: "city", en: "City", sq: "Qytet" },
  "Kültür": { artwork: "culture", en: "Culture", sq: "Kulturë" },
  "Yeme-içme": { artwork: "food", en: "Food", sq: "Ushqim" },
  "Deniz": { artwork: "coast", en: "Coast", sq: "Bregdet" },
  "Doğa": { artwork: "nature", en: "Nature", sq: "Natyrë" },
  "Macera": { artwork: "adventure", en: "Adventure", sq: "Aventurë" },
};

export function Onboarding({ onComplete, signedIn = false }: { onComplete: (destination?: WelcomeIntent) => void; signedIn?: boolean }) {
  const { locale, setLocale, pendingLocale, failedLocale, copy } = useI18n();
  const { preference, setPreference } = useTheme();
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(readWelcomePreferences);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const finished = useRef(false);
  const last = step === 3;
  const intents: Array<{ id: WelcomeIntent; artwork: "globe" | "explore" | "trips"; title: string; text: string }> = [
    { id: "explore", artwork: "globe", title: copy("İlham arıyorum", "I need inspiration", "Kërkoj frymëzim"), text: copy("Ülkeleri ve gidilecek yerleri keşfet.", "Discover countries and places to go.", "Zbulo shtete dhe vende për t'u vizituar.") },
    { id: "route", artwork: "explore", title: copy("Gezimi planlıyorum", "I'm planning a trip", "Po planifikoj një udhëtim"), text: copy("Sürene ve bütçene uygun bir rota hazırla.", "Build a route for your time and budget.", "Krijo një itinerar sipas kohës dhe buxhetit.") },
    { id: "companion", artwork: "trips", title: copy("Şu an yoldayım", "I'm travelling now", "Jam në udhëtim tani"), text: copy("Harita, çeviri ve para araçlarını aç.", "Open maps, translation and money tools.", "Hap hartat, përkthimin dhe mjetet e parasë.") },
  ];
  const intent = preferences.intent || "explore";
  const themes: Array<{ id: ThemePreference; title: string; text: string }> = [
    { id: "light", title: copy("Açık", "Light", "E çelët"), text: copy("Aydınlık ve ferah", "Bright and clear", "E ndritshme dhe e qartë") },
    { id: "dark", title: copy("Koyu", "Dark", "E errët"), text: copy("Koyu arka plan", "A darker background", "Sfond i errët") },
    { id: "system", title: copy("Cihazın temasını kullan", "Use device appearance", "Përdor pamjen e pajisjes"), text: copy("Telefonunla birlikte değişir", "Changes with your phone", "Ndryshon bashkë me telefonin") },
  ];
  const headings = [copy("Önce dilini seç", "Choose your language", "Zgjidh gjuhën tënde"), copy("Nasıl görünsün?", "Choose your appearance", "Si dëshiron të duket?"), copy("Bugün ne yapmak istersin?", "What brings you here?", "Çfarë dëshiron të bësh sot?"), copy("Gezilerde seni ne çeker?", "What do you love on a trip?", "Çfarë të pëlqen në udhëtim?")];
  const descriptions = [copy("Uygulama seçtiğin dilde devam edecek.", "The app will continue in your chosen language.", "Aplikacioni do të vazhdojë në gjuhën që zgjedh."), copy("Bir görünüm seç. Daha sonra Profil'den değiştirebilirsin.", "Choose an appearance. You can change it later in Profile.", "Zgjidh pamjen. Mund ta ndryshosh më vonë te Profili."), copy("Seni doğrudan işine yarayan yere götürelim.", "Let's start with the part you need.", "Le të fillojmë me pjesën që të duhet."), copy("En fazla 4 seçim. Yeni rota planlarında hazır gelir; sonra değiştirebilirsin.", "Choose up to 4. We'll prefill new route plans; you can change them later.", "Zgjidh deri në 4. Plotësojmë planet e reja; mund t'i ndryshosh më vonë.")];
  const finishLabel = signedIn ? copy("Keşfetmeye başla", "Start exploring", "Fillo të zbulosh") : copy("Giriş yap veya hesap oluştur", "Sign in or create account", "Hyr ose krijo llogari");

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
      const first = focusable[0], lastItem = focusable[focusable.length - 1];
      if (!first || !lastItem) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        event.preventDefault(); lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => dialog.removeEventListener("keydown", trapFocus);
  }, []);

  function finish(destination?: WelcomeIntent) {
    if (finished.current) return;
    finished.current = true;
    saveWelcomePreferences(preferences);
    onComplete(destination);
  }
  function toggleInterest(interest: WelcomeInterest) {
    setPreferences(previous => ({ ...previous, interests: previous.interests.includes(interest)
      ? previous.interests.filter(item => item !== interest)
      : previous.interests.length < 4 ? [...previous.interests, interest] : previous.interests }));
  }

  return <div ref={dialogRef} className="welcome-setup" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" data-no-gesture>
    <header className="welcome-header"><span className="welcome-brand"><BrandMark /></span><span className="welcome-step-count" aria-label={copy(`Adım ${step + 1} / 4`, `Step ${step + 1} of 4`, `Hapi ${step + 1} nga 4`)}>{step + 1}<span>/ 4</span></span></header>
    <div className="welcome-progress" aria-hidden="true">{[0, 1, 2, 3].map(index => <span key={index} className={index <= step ? "is-complete" : ""} />)}</div>
    <section ref={contentRef} className="welcome-body">
      <div className="welcome-inner">
        <span className="welcome-topic-icon" aria-hidden="true"><TravelToolArtwork kind={step === 0 ? "translate" : step === 1 ? "settings" : step === 2 ? "explore" : "globe"} size={64} /></span>
        <h1 ref={headingRef} id="welcome-title" tabIndex={-1}>{headings[step]}</h1>
        <p id="welcome-description">{descriptions[step]}</p>
        {step === 0 && <div className="welcome-language-list" role="group" aria-label={copy("Uygulama dili", "App language", "Gjuha e aplikacionit")}>{APP_LOCALES.map(language => <button type="button" key={language} lang={language} aria-pressed={locale === language} aria-busy={pendingLocale === language} onClick={() => void setLocale(language)}><LanguageFlag locale={language} /><strong>{languageNames[language]}</strong><span className="welcome-selection" aria-hidden="true">{locale === language && <Icon name="check" size={18} />}</span></button>)}</div>}
        {step === 0 && pendingLocale && <p role="status">{copy('Dil yükleniyor…', 'Loading language…', 'Duke ngarkuar gjuhën…')}</p>}
        {step === 0 && failedLocale && <p role="alert">{copy('Dil yüklenemedi. Tekrar seç veya başka bir dil kullan.', 'Language could not load. Select it again or choose another language.', 'Gjuha nuk u ngarkua. Zgjidhe përsëri ose përdor një gjuhë tjetër.')}</p>}
        {step === 2 && <div className="welcome-intent-list" role="group" aria-labelledby="welcome-title">{intents.map(item => <button type="button" key={item.id} aria-pressed={preferences.intent === item.id} onClick={() => setPreferences(previous => ({ ...previous, intent: item.id }))}><span className="welcome-option-icon"><TravelToolArtwork kind={item.artwork} size={62} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><span className="welcome-selection" aria-hidden="true">{preferences.intent === item.id && <Icon name="check" size={17} />}</span></button>)}</div>}
        {step === 3 && <><div className="welcome-interest-list" role="group" aria-labelledby="welcome-title">{WELCOME_INTERESTS.map(interest => { const detail = interestDetails[interest], selected = preferences.interests.includes(interest); return <button type="button" key={interest} aria-pressed={selected} disabled={!selected && preferences.interests.length >= 4} onClick={() => toggleInterest(interest)}><WelcomeArtwork kind={detail.artwork} size={56} /><strong>{copy(interest, detail.en, detail.sq)}</strong><span className="welcome-selection" aria-hidden="true">{selected && <Icon name="check" size={15} />}</span></button>; })}</div><p className="welcome-selection-count" role="status">{copy(`${preferences.interests.length}/4 seçildi`, `${preferences.interests.length}/4 selected`, `${preferences.interests.length}/4 të zgjedhura`)}</p></>}
        {step === 1 && <div className="welcome-theme-list" role="group" aria-labelledby="welcome-title">{themes.map(item => <button type="button" key={item.id} aria-pressed={preference === item.id} onClick={() => setPreference(item.id)}><span className={`welcome-theme-preview is-${item.id}`} aria-hidden="true"><i/><span/><span/><b/></span><span className="welcome-theme-copy"><strong>{item.title}</strong><small>{item.text}</small></span><span className="welcome-selection" aria-hidden="true">{preference === item.id && <Icon name="check" size={17}/>}</span></button>)}</div>}

      </div>
    </section>
    <footer className="welcome-footer">
      <div className="welcome-footer-inner"><div className="welcome-footer-main">{step > 0 && <button type="button" className="welcome-back" onClick={() => setStep(Math.max(0, step - 1))} aria-label={copy("Geri", "Back", "Prapa")}><Icon name="back" size={21}/></button>}<button type="button" className="welcome-next" disabled={Boolean(pendingLocale)} onClick={() => last ? finish(intent) : setStep(Math.min(3, step + 1))}>{last ? finishLabel : copy("Devam et", "Continue", "Vazhdo")}<Icon name="chevron" size={20}/></button></div>
        {step === 2 ? <button type="button" className="welcome-skip" onClick={() => setStep(3)}>{copy("Bu adımı geç", "Skip this step", "Kalo këtë hap")}</button> : last ? <p className="welcome-footer-note">{copy("Seçim yapmak zorunlu değil. Sonradan değiştirebilirsin.", "Choosing interests is optional. You can change them later.", "Interesat janë sipas dëshirës. Mund t'i ndryshosh më vonë.")}</p> : <p className="welcome-footer-note">{step === 0 ? copy("Dilini daha sonra üst menüden değiştirebilirsin.", "You can change language later from the top menu.", "Gjuhën mund ta ndryshosh më vonë nga menuja e sipërme.") : copy("Seçtiğin görünüm hemen uygulanır.", "Your chosen appearance applies immediately.", "Pamja që zgjedh zbatohet menjëherë.")}</p>}

      </div>
    </footer>
  </div>;
}
