import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../lib/i18n";
import { BrandMark } from "./BrandMark";
import { LanguageFlag } from "./LanguagePicker";
import { APP_LOCALES } from "../lib/locale";
import { readWelcomePreferences, saveWelcomePreferences, WELCOME_INTERESTS, type WelcomeIntent, type WelcomeInterest } from "../lib/onboardingPreferences";
import "./onboarding.css";

const languageNames = { tr: "Türkçe", en: "English", sq: "Shqip" };
const interestDetails: Record<WelcomeInterest, { icon: IconName; en: string; sq: string }> = {
  "Şehir": { icon: "home", en: "City", sq: "Qytet" },
  "Kültür": { icon: "book", en: "Culture", sq: "Kulturë" },
  "Yeme-içme": { icon: "heart", en: "Food", sq: "Ushqim" },
  "Deniz": { icon: "sun", en: "Coast", sq: "Bregdet" },
  "Doğa": { icon: "leaf", en: "Nature", sq: "Natyrë" },
  "Macera": { icon: "compass", en: "Adventure", sq: "Aventurë" },
};

export function Onboarding({ onComplete }: { onComplete: (destination?: WelcomeIntent) => void }) {
  const { locale, setLocale, copy } = useI18n();
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(readWelcomePreferences);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const finished = useRef(false);
  const last = step === 3;
  const intents: Array<{ id: WelcomeIntent; icon: IconName; title: string; text: string }> = [
    { id: "explore", icon: "compass", title: copy("İlham arıyorum", "I need inspiration", "Kërkoj frymëzim"), text: copy("Ülkeleri ve gidilecek yerleri keşfet.", "Discover countries and places to go.", "Zbulo shtete dhe vende për t'u vizituar.") },
    { id: "route", icon: "route", title: copy("Gezimi planlıyorum", "I'm planning a trip", "Po planifikoj një udhëtim"), text: copy("Sürene ve bütçene uygun bir rota hazırla.", "Build a route for your time and budget.", "Krijo një itinerar sipas kohës dhe buxhetit.") },
    { id: "companion", icon: "suitcase", title: copy("Şu an yoldayım", "I'm travelling now", "Jam në udhëtim tani"), text: copy("Harita, çeviri ve para araçlarını aç.", "Open maps, translation and money tools.", "Hap hartat, përkthimin dhe mjetet e parasë.") },
  ];
  const intent = preferences.intent || "explore";
  const guide = intent === "route" ? {
    icon: "route" as const, label: copy("Rota oluştur", "Plan a route", "Planifiko itinerarin"),
    steps: [copy("Çıkış şehrini ve süreni seç.", "Choose your departure city and duration.", "Zgjidh qytetin e nisjes dhe kohëzgjatjen."), copy("Bütçeni ve ilgi alanlarını ayarla.", "Set your budget and interests.", "Përcakto buxhetin dhe interesat."), copy("Planını kaydet; Planlar'dan tekrar aç.", "Save your plan; reopen it from Plans.", "Ruaje planin; hape përsëri te Planet.")],
    action: copy("Rotamı oluşturmaya başla", "Start planning my route", "Fillo planifikimin e itinerarit"),
  } : intent === "companion" ? {
    icon: "suitcase" as const, label: copy("Yol araçların", "Your travel tools", "Mjetet e udhëtimit"),
    steps: [copy("Alt menüden Araçlar'a dokun.", "Tap Tools in the bottom menu.", "Prek Mjetet në menunë e poshtme."), copy("Harita, çeviri veya para aracını seç.", "Choose maps, translation or money tools.", "Zgjidh hartat, përkthimin ose paratë."), copy("Gerektiğinde konumunu kullan veya bir yer seç.", "Use your location when needed, or choose a place.", "Përdor vendndodhjen kur duhet, ose zgjidh një vend.")],
    action: copy("Araçları aç", "Open travel tools", "Hap mjetet e udhëtimit"),
  } : {
    icon: "compass" as const, label: copy("Bir sonraki keşfin", "Your next discovery", "Zbulimi yt i radhës"),
    steps: [copy("Merak ettiğin ülkeyi bul.", "Find a country you're curious about.", "Gjej një shtet që të tërheq."), copy("Yerleri incele; beğendiklerini favorile.", "Explore places and favourite your picks.", "Zbulo vende dhe ruaj të preferuarat."), copy("Bir yer seçince rotanı planlamaya geç.", "Pick a place, then start planning your route.", "Zgjidh një vend, pastaj planifiko itinerarin.")],
    action: copy("Ülkeleri keşfet", "Explore countries", "Zbulo shtetet"),
  };
  const headings = [copy("Önce dilini seç", "Choose your language", "Zgjidh gjuhën tënde"), copy("Bugün ne yapmak istersin?", "What brings you here?", "Çfarë dëshiron të bësh sot?"), copy("Gezilerde seni ne çeker?", "What do you love on a trip?", "Çfarë të pëlqen në udhëtim?"), copy("İlk adımın hazır", "Your first step is ready", "Hapi yt i parë është gati")];
  const descriptions = [copy("Uygulama seçtiğin dilde devam edecek.", "The app will continue in your chosen language.", "Aplikacioni do të vazhdojë në gjuhën që zgjedh."), copy("Seni doğrudan işine yarayan yere götürelim.", "Let's start with the part you need.", "Le të fillojmë me pjesën që të duhet."), copy("En fazla 4 seçim. Yeni rota planlarında hazır gelir; sonra değiştirebilirsin.", "Choose up to 4. We'll prefill new route plans; you can change them later.", "Zgjidh deri në 4. Plotësojmë planet e reja; mund t'i ndryshosh më vonë."), copy("Küçük bir başlangıç, kolay bir yolculuk.", "A small start for an easier journey.", "Një fillim i vogël për një udhëtim më të lehtë.")];

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
        <span className="welcome-topic-icon" aria-hidden="true"><Icon name={step === 0 ? "languages" : step === 1 ? "compass" : step === 2 ? "heart" : "check"} size={29} /></span>
        <h1 ref={headingRef} id="welcome-title" tabIndex={-1}>{headings[step]}</h1>
        <p id="welcome-description">{descriptions[step]}</p>
        {step === 0 && <div className="welcome-language-list" role="group" aria-label={copy("Uygulama dili", "App language", "Gjuha e aplikacionit")}>{APP_LOCALES.map(language => <button type="button" key={language} lang={language} aria-pressed={locale === language} onClick={() => setLocale(language)}><LanguageFlag locale={language} /><strong>{languageNames[language]}</strong><span className="welcome-selection" aria-hidden="true">{locale === language && <Icon name="check" size={18} />}</span></button>)}</div>}
        {step === 1 && <div className="welcome-intent-list" role="group" aria-labelledby="welcome-title">{intents.map(item => <button type="button" key={item.id} aria-pressed={preferences.intent === item.id} onClick={() => setPreferences(previous => ({ ...previous, intent: item.id }))}><span className="welcome-option-icon"><Icon name={item.icon} size={25} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><span className="welcome-selection" aria-hidden="true">{preferences.intent === item.id && <Icon name="check" size={17} />}</span></button>)}</div>}
        {step === 2 && <><div className="welcome-interest-list" role="group" aria-labelledby="welcome-title">{WELCOME_INTERESTS.map(interest => { const detail = interestDetails[interest], selected = preferences.interests.includes(interest); return <button type="button" key={interest} aria-pressed={selected} disabled={!selected && preferences.interests.length >= 4} onClick={() => toggleInterest(interest)}><Icon name={detail.icon} size={26} /><strong>{copy(interest, detail.en, detail.sq)}</strong><span className="welcome-selection" aria-hidden="true">{selected && <Icon name="check" size={15} />}</span></button>; })}</div><p className="welcome-selection-count" role="status">{copy(`${preferences.interests.length}/4 seçildi`, `${preferences.interests.length}/4 selected`, `${preferences.interests.length}/4 të zgjedhura`)}</p></>}
        {last && <><div className="welcome-guide"><div className="welcome-guide-preview" aria-hidden="true"><span><Icon name={guide.icon} size={32}/></span><strong>{guide.label}</strong><div className="welcome-route-line"><i/><span/><i/><span/><i/></div></div><ol role="list">{guide.steps.map((instruction, index) => <li key={instruction}><span className="welcome-guide-number" aria-hidden="true">{index + 1}</span><span>{instruction}</span></li>)}</ol></div><div className="welcome-guide-tip"><Icon name="bookmark" size={20}/><p>{copy("Kaydettiklerin Planlar'da. Gezginlere soru sormak için Topluluk'a geç.", "Your saved items live in Plans. Visit Community to ask other travellers.", "Të ruajturat gjenden te Planet. Shko te Komuniteti për të pyetur udhëtarët.")}</p></div></>}
      </div>
    </section>
    <footer className="welcome-footer">
      <div className="welcome-footer-inner"><div className="welcome-footer-main">{step > 0 && <button type="button" className="welcome-back" onClick={() => setStep(value => Math.max(0, value - 1))} aria-label={copy("Geri", "Back", "Prapa")}><Icon name="back" size={21}/></button>}<button type="button" className="welcome-next" onClick={() => last ? finish(intent) : setStep(value => Math.min(3, value + 1))}>{last ? guide.action : copy("Devam et", "Continue", "Vazhdo")}<Icon name="chevron" size={20}/></button></div>
        {step > 0 && !last ? <button type="button" className="welcome-skip" onClick={() => setStep(value => Math.min(3, value + 1))}>{copy("Bu adımı geç", "Skip this step", "Kalo këtë hap")}</button> : last ? <button type="button" className="welcome-skip" onClick={() => finish()}>{copy("Ana sayfayla başla", "Start from home", "Fillo nga faqja kryesore")}</button> : <p className="welcome-footer-note">{copy("Dilini daha sonra üst menüden değiştirebilirsin.", "You can change language later from the top menu.", "Gjuhën mund ta ndryshosh më vonë nga menuja e sipërme.")}</p>}
      </div>
    </footer>
  </div>;
}
