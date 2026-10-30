import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/useTheme";
import type { ThemePreference } from "../lib/theme";
import { WelcomeArtwork, type WelcomeArtworkKind } from "./WelcomeArtwork";
import { TravelToolArtwork } from "./TravelToolArtwork";
import { BrandMark } from "./BrandMark";
import { LanguageFlag } from "./LanguagePicker";
import { CountryPicker } from "./CountryPicker";
import { PASSPORTS } from "../../../lib/country-intelligence/passports";
import { hasPassportPreference, readPassportPreference, savePassportPreference } from "../lib/passportPreference";
import { APP_LOCALES } from "../lib/locale";
import { readWelcomePreferences, saveWelcomePreferences, WELCOME_INTERESTS, type WelcomeIntent, type WelcomeInterest } from "../lib/onboardingPreferences";
import "./onboarding.css";

const languageNames = { tr: "Türkçe", en: "English", sq: "Shqip", ro: "Română" };
const interestDetails: Record<WelcomeInterest, { artwork: WelcomeArtworkKind; en: string; sq: string }> = {
  "Şehir": { artwork: "city", en: "City", sq: "Qytet" },
  "Kültür": { artwork: "culture", en: "Culture", sq: "Kulturë" },
  "Yeme-içme": { artwork: "food", en: "Food", sq: "Ushqim" },
  "Deniz": { artwork: "coast", en: "Coast", sq: "Bregdet" },
  "Doğa": { artwork: "nature", en: "Nature", sq: "Natyrë" },
  "Macera": { artwork: "adventure", en: "Adventure", sq: "Aventurë" },
};

export function Onboarding({ onComplete, signedIn = false, guestAllowed = true }: { onComplete: (destination?: WelcomeIntent, options?: { guest: boolean }) => void; signedIn?: boolean; guestAllowed?: boolean }) {
  const { locale, setLocale, pendingLocale, failedLocale, copy } = useI18n();
  const { preference, setPreference } = useTheme();
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(readWelcomePreferences);
  const [passport, setPassport] = useState(readPassportPreference);
  const [passportChanged, setPassportChanged] = useState(false);
  const [passportError, setPassportError] = useState(false);
  const passportOptions = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return Object.keys(PASSPORTS).map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const finished = useRef(false);
  const last = step === 4;
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
  headings.push(copy("Hangi pasaportla seyahat edeceksin?", "Which passport will you travel with?", "Me cilën pasaportë do të udhëtosh?"));
  descriptions.push(copy("İsteğe bağlı. Ülke ve giriş önerilerini seyahatte kullanacağın pasaporta göre gösterelim.", "Optional. Tailor destination and entry guidance to the passport you will use.", "Sipas dëshirës. Përshtatim sugjerimet e shteteve dhe hyrjes sipas pasaportës që do të përdorësh."));

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])'));
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

  function finish(destination?: WelcomeIntent, skipPassport = false, guest = false) {
    if (finished.current) return;
    if (!skipPassport && passportChanged) {
      if (!hasPassportPreference(passport)) return;
      if (!savePassportPreference(passport.country, passport.type)) { setPassportError(true); return; }
    }
    finished.current = true;
    saveWelcomePreferences(preferences);
    onComplete(destination, guest ? { guest: true } : undefined);
  }
  function toggleInterest(interest: WelcomeInterest) {
    setPreferences(previous => ({ ...previous, interests: previous.interests.includes(interest)
      ? previous.interests.filter(item => item !== interest)
      : previous.interests.length < 4 ? [...previous.interests, interest] : previous.interests }));
  }

  return <div ref={dialogRef} className="welcome-setup" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" data-no-gesture>
    <header className="welcome-header"><span className="welcome-brand"><BrandMark /></span><span className="welcome-step-count" aria-label={copy(`Adım ${step + 1} / 5`, `Step ${step + 1} of 5`, `Hapi ${step + 1} nga 5`)}>{step + 1}<span>/ 5</span></span></header>
    <div className="welcome-progress" aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <span key={index} className={index <= step ? "is-complete" : ""} />)}</div>
    <section ref={contentRef} className="welcome-body">
      <div className="welcome-inner">
        <span className="welcome-topic-icon" aria-hidden="true"><TravelToolArtwork kind={step === 0 ? "translate" : step === 1 ? "settings" : step === 2 ? "explore" : last ? "passport" : "globe"} size={64} /></span>
        <h1 ref={headingRef} id="welcome-title" tabIndex={-1}>{headings[step]}</h1>
        <p id="welcome-description">{descriptions[step]}</p>
        {step === 0 && <div className="welcome-language-list" role="group" aria-label={copy("Uygulama dili", "App language", "Gjuha e aplikacionit")}>{APP_LOCALES.map(language => <button type="button" key={language} lang={language} aria-pressed={locale === language} aria-busy={pendingLocale === language} onClick={() => void setLocale(language)}><LanguageFlag locale={language} /><strong>{languageNames[language]}</strong><span className="welcome-selection" aria-hidden="true">{locale === language && <Icon name="check" size={18} />}</span></button>)}</div>}
        {step === 0 && pendingLocale && <p role="status">{copy('Dil yükleniyor…', 'Loading language…', 'Duke ngarkuar gjuhën…')}</p>}
        {step === 0 && failedLocale && <p role="alert">{copy('Dil yüklenemedi. Tekrar seç veya başka bir dil kullan.', 'Language could not load. Select it again or choose another language.', 'Gjuha nuk u ngarkua. Zgjidhe përsëri ose përdor një gjuhë tjetër.')}</p>}
        {step === 2 && <div className="welcome-intent-list" role="group" aria-labelledby="welcome-title">{intents.map(item => <button type="button" key={item.id} aria-pressed={preferences.intent === item.id} onClick={() => setPreferences(previous => ({ ...previous, intent: item.id }))}><span className="welcome-option-icon"><TravelToolArtwork kind={item.artwork} size={62} /></span><span><strong>{item.title}</strong><small>{item.text}</small></span><span className="welcome-selection" aria-hidden="true">{preferences.intent === item.id && <Icon name="check" size={17} />}</span></button>)}</div>}
        {step === 3 && <><div className="welcome-interest-list" role="group" aria-labelledby="welcome-title">{WELCOME_INTERESTS.map(interest => { const detail = interestDetails[interest], selected = preferences.interests.includes(interest); return <button type="button" key={interest} aria-pressed={selected} disabled={!selected && preferences.interests.length >= 4} onClick={() => toggleInterest(interest)}><WelcomeArtwork kind={detail.artwork} size={56} /><strong>{copy(interest, detail.en, detail.sq)}</strong><span className="welcome-selection" aria-hidden="true">{selected && <Icon name="check" size={15} />}</span></button>; })}</div><p className="welcome-selection-count" role="status">{copy(`${preferences.interests.length}/4 seçildi`, `${preferences.interests.length}/4 selected`, `${preferences.interests.length}/4 të zgjedhura`)}</p></>}
        {step === 1 && <div className="welcome-theme-list" role="group" aria-labelledby="welcome-title">{themes.map(item => <button type="button" key={item.id} aria-pressed={preference === item.id} onClick={() => setPreference(item.id)}><span className={`welcome-theme-preview is-${item.id}`} aria-hidden="true"><i/><span/><span/><b/></span><span className="welcome-theme-copy"><strong>{item.title}</strong><small>{item.text}</small></span><span className="welcome-selection" aria-hidden="true">{preference === item.id && <Icon name="check" size={17}/>}</span></button>)}</div>}
        {last && <div className="welcome-passport-fields">
          <CountryPicker value={passport.country} options={passportOptions} label={copy("Pasaportu düzenleyen ülke", "Passport issuing country", "Shteti që lëshon pasaportën")} placeholder={copy("Ülke seç", "Choose country", "Zgjidh shtetin")} onChange={country => { setPassport(current => ({ ...current, country })); setPassportChanged(true); setPassportError(false); }} />
          <label className="welcome-passport-type">{copy("Pasaport türü", "Passport type", "Lloji i pasaportës")}<select value={passport.type} onChange={event => { setPassport(current => ({ ...current, type: event.target.value })); setPassportChanged(true); setPassportError(false); }}>
            <option value="">{copy("Tür seç", "Choose type", "Zgjidh llojin")}</option>
            <option value="ordinary">{copy("Umuma mahsus (normal)", "Ordinary (regular)", "E zakonshme")}</option>
            <option value="special">{copy("Hususi", "Special", "Speciale")}</option>
            <option value="service">{copy("Hizmet", "Service", "Shërbimi")}</option>
            <option value="diplomatic">{copy("Diplomatik", "Diplomatic", "Diplomatike")}</option>
          </select></label>
          <p>{copy("Bu seçim vatandaşlığını veya yaşadığın ülkeyi değiştirmez. Pasaport numarası ya da belge istemiyoruz. Daha sonra Profil → Pasaport tercihim bölümünden değiştirebilirsin.", "This does not set your citizenship or country of residence. No passport number or document is needed. Change it later in Profile → My passport preference.", "Kjo zgjedhje nuk cakton shtetësinë apo vendbanimin. Nuk kërkojmë numër ose dokument pasaporte. Ndryshoje më vonë te Profili → Preferenca ime e pasaportës.")}</p>
          {!hasPassportPreference(passport) && <p className="welcome-passport-hint">{copy("Şimdi geçersen bir pasaport varsaymayız; giriş koşulları doğrulama gerektirir.", "If you skip, we won't assume a passport; entry conditions will need verification.", "Nëse e kalon, nuk supozojmë pasaportë; kushtet e hyrjes do të kërkojnë verifikim.")}</p>}
          {passportError && <p role="alert">{copy("Seçimin kaydedilemedi. Tekrar dene veya bu adımı geç; önceki seçimin korunur.", "Your choice could not be saved. Retry or skip this step; your previous choice is kept.", "Zgjedhja nuk u ruajt. Provo sërish ose kalo hapin; zgjedhja e mëparshme ruhet.")}</p>}
        </div>}

      </div>
    </section>
    <footer className="welcome-footer">
      <div className="welcome-footer-inner"><div className="welcome-footer-main">{step > 0 && <button type="button" className="welcome-back" onClick={() => setStep(Math.max(0, step - 1))} aria-label={copy("Geri", "Back", "Prapa")}><Icon name="back" size={21}/></button>}<button type="button" className="welcome-next" disabled={Boolean(pendingLocale) || (last && passportChanged && !hasPassportPreference(passport))} onClick={() => last ? finish(intent) : setStep(Math.min(4, step + 1))}>{last ? finishLabel : copy("Devam et", "Continue", "Vazhdo")}<Icon name="chevron" size={20}/></button></div>
        {step === 2 || last ? <button type="button" className="welcome-skip" onClick={() => last ? finish(intent, true) : setStep(3)}>{last ? copy('Pasaportu sonra seç', 'Choose passport later', 'Zgjidhe pasaportën më vonë') : copy("Bu adımı geç", "Skip this step", "Kalo këtë hap")}</button> : step === 3 ? <p className="welcome-footer-note">{copy("Seçim yapmak zorunlu değil. Sonradan değiştirebilirsin.", "Choosing interests is optional. You can change them later.", "Interesat janë sipas dëshirës. Mund t'i ndryshosh më vonë.")}</p> : <p className="welcome-footer-note">{step === 0 ? copy("Dilini daha sonra ekranın üstündeki bayrak düğmesinden değiştirebilirsin.", "You can change language later using the flag button at the top.", "Gjuhën mund ta ndryshosh më vonë nga butoni me flamur lart.") : copy("Seçtiğin görünüm hemen uygulanır.", "Your chosen appearance applies immediately.", "Pamja që zgjedh zbatohet menjëherë.")}</p>}
        {!signedIn && !last && <button type="button" className="welcome-guest" disabled={Boolean(pendingLocale) || !guestAllowed} onClick={() => finish(intent, true, true)}>{copy('Misafir olarak keşfet', 'Explore as a guest', 'Eksploro si vizitor')}<Icon name="chevron" size={17}/></button>}

      </div>
    </footer>
  </div>;
}
