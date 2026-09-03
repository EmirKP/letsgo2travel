import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3, flagEmoji } from "../data/countryIso";
import { ApiError, requestJson } from "../lib/api";
import type { AuthUser } from "../types";
import { useI18n } from "../lib/i18n";

// Soru formunda ülke SEÇİLİR (kod yazılmaz); ada göre sıralı, bayraklı.
type CommunityAnswer = {
  id: string;
  body: string;
  createdAt: string;
  username: string;
};

type CommunityQuestionDetail = Omit<CommunityQuestion, "answerCount"> & {
  answers: CommunityAnswer[];
  totalAnswerCount?: number;
  shownAnswerCount?: number;
  hiddenAnswerCount?: number;
  hasFullAccess?: boolean;
};

type CommunityScreenProps = {
  user: AuthUser | null;
  accessToken: string;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
};

export type CommunityLeader = {
  username: string;
  visitedCount: number;
  points: number;
  level: string;
  verified: boolean;
};

type CommunityQuestion = {
  id: string;
  countryCode: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  username: string;
  answerCount: number;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10_000_000, Math.round(number))) : 0;
}

function normalizeLeader(value: unknown): CommunityLeader | null {
  const item = record(value);
  const username = text(item.username, 40);
  if (!username) return null;

  // Doğrulama rozeti yalnızca API açıkça boolean true döndürürse görünür.
  // Ziyaret/puan/seviye değerlerinden doğrulama sonucu türetilmez.
  const verified = item.verified === true
    || item.is_verified === true
    || item.documented_traveler === true
    || item.documentedTraveler === true;

  return {
    username,
    visitedCount: count(item.visitedCount ?? item.visited_count),
    points: count(item.points),
    level: text(item.level, 80),
    verified,
  };
}

function normalizeQuestion(value: unknown): CommunityQuestion | null {
  const item = record(value);
  const id = text(item.id, 80);
  const title = text(item.title, 160);
  const body = text(item.body, 800);
  const countryCode = text(item.countryCode ?? item.country_code, 2).toUpperCase();
  if (!id || !title || !body || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    id,
    countryCode,
    title,
    body,
    category: text(item.category, 60) || "general",
    createdAt: text(item.createdAt ?? item.created_at, 40),
    username: text(item.username, 40) || "anonim_gezgin",
    answerCount: count(item.answerCount ?? item.answer_count),
  };
}

function formatQuestionDate(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function questionScopeLabel(countryCode: string, general = "Genel") {
  return countryCode === "ZZ" ? `🌍 ${general}` : `${flagEmoji(countryCode)} ${countryCode}`;
}

function userName(user: AuthUser | null) {
  if (!user) return "";
  return text(
    user.user_metadata?.username
      || user.user_metadata?.preferred_username
      || user.email?.split("@")[0],
    40,
  );
}

function initials(username: string) {
  return username
    .split(/[._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toLocaleUpperCase("tr-TR"))
    .join("") || "K";
}

export function CommunityScreen({ user, accessToken, onOpenAccount, onNotice }: CommunityScreenProps) {
  const { copy, countryName, dateLocale, locale } = useI18n();
  const questionCountries = useMemo(() => [...COUNTRY_LIST]
    .map((country) => ({ name: countryName(country.alpha3, country.name), alpha2: alpha2FromAlpha3(country.alpha3) }))
    .filter((country) => /^[A-Z]{2}$/.test(country.alpha2))
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);
  const [tab, setTab] = useState<"feed" | "league">("feed");
  const [leaders, setLeaders] = useState<CommunityLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<CommunityQuestion[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [questionOpen, setQuestionOpen] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [questionTitle, setQuestionTitle] = useState("");
  const [questionBody, setQuestionBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [detail, setDetail] = useState<CommunityQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [answerBody, setAnswerBody] = useState("");
  const [answerPosting, setAnswerPosting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const detailGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const feedGeneration = useRef(0);
  const currentUsername = useMemo(() => userName(user).toLocaleLowerCase("tr-TR"), [user]);
  const shownAnswerCount = detail?.answers.length || 0;
  const hiddenAnswerCount = count(detail?.hiddenAnswerCount);
  const totalAnswerCount = Math.max(
    count(detail?.totalAnswerCount),
    shownAnswerCount + hiddenAnswerCount,
  );

  const selectTab = (nextTab: "feed" | "league") => {
    setTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`community-tab-${nextTab}`)?.focus());
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    selectTab(tab === "feed" ? "league" : "feed");
  };

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const response = await requestJson<{ data?: unknown }>("/api/kasifler-ligi", { timeoutMs: 15_000 });
      if (generation !== requestGeneration.current) return;
      const rows = Array.isArray(response.data) ? response.data.slice(0, 100) : [];
      setLeaders(rows.flatMap((item) => {
        const leader = normalizeLeader(item);
        return leader ? [leader] : [];
      }));
    } catch {
      if (generation === requestGeneration.current) {
        setLeaders([]);
        setError(copy("Gezgin sıralaması şu anda yüklenemedi. Bağlantını kontrol edip tekrar dene.", "The traveller ranking could not be loaded. Check your connection and try again."));
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [copy]);

  const loadFeed = useCallback(async () => {
    const generation = ++feedGeneration.current;
    setFeedLoading(true);
    setFeedError("");
    try {
      const response = await requestJson<{ data?: unknown }>("/api/country-community/feed", { timeoutMs: 15_000 });
      if (generation !== feedGeneration.current) return;
      const rows = Array.isArray(response.data) ? response.data : [];
      setQuestions(rows.flatMap((item) => {
        const question = normalizeQuestion(item);
        return question ? [question] : [];
      }));
    } catch {
      if (generation === feedGeneration.current) {
        setQuestions([]);
        setFeedError(copy("Topluluk akışı şu anda yüklenemedi. Bağlantını kontrol edip tekrar dene.", "The community feed could not be loaded. Check your connection and try again."));
      }
    } finally {
      if (generation === feedGeneration.current) setFeedLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void loadFeed();
    return () => {
      requestGeneration.current += 1;
      feedGeneration.current += 1;
    };
  }, [loadFeed]);

  useEffect(() => {
    // Lig verisi, kullanıcı yalnız akışa bakarken gereksiz bir ağ ve veri
    // tabanı isteği oluşturmasın. İlk kez Lig sekmesi açıldığında yüklenir.
    if (tab === "league" && !loaded && !loading) void load();
  }, [load, loaded, loading, tab]);

  const openDetail = useCallback(async (questionId: string) => {
    const generation = ++detailGeneration.current;
    setDetailId(questionId);
    setDetail(null);
    setDetailError("");
    setAnswerBody("");
    setDetailLoading(true);
    try {
      const response = await requestJson<{ data?: CommunityQuestionDetail }>(`/api/country-community/questions/${encodeURIComponent(questionId)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        timeoutMs: 15_000,
      });
      if (generation !== detailGeneration.current) return;
      if (!response.data) throw new Error(copy("Soru bulunamadı.", "Question not found."));
      setDetail(response.data);
    } catch (requestError) {
      if (generation === detailGeneration.current) {
        setDetailError(locale === "tr" && requestError instanceof ApiError && requestError.message ? requestError.message : copy("Soru detayı yüklenemedi. Tekrar dene.", "Question details could not be loaded. Try again."));
      }
    } finally {
      if (generation === detailGeneration.current) setDetailLoading(false);
    }
  }, [accessToken, copy, locale]);

  const closeDetail = () => {
    detailGeneration.current += 1;
    setDetailId("");
    setDetail(null);
    setDetailError("");
    setAnswerBody("");
    setUnlocking(false);
  };

  const submitAnswer = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!detail) return;
    const body = answerBody.trim();
    if (body.length < 3) return onNotice(copy("Cevap en az 3 karakter olmalı.", "Your answer must be at least 3 characters."));
    if (answerPosting) return;
    setAnswerPosting(true);
    try {
      const result = await requestJson<{ moderation?: { action?: string } }>("/api/country-community/answers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { countryCode: detail.countryCode, questionId: detail.id, body },
      });
      setAnswerBody("");
      onNotice(result.moderation?.action === "visible" ? copy("Cevabın yayınlandı.", "Your answer is live.") : copy("Cevabın incelemeye alındı.", "Your answer was sent for review."));
      if (result.moderation?.action === "visible") await openDetail(detail.id);
    } catch (requestError) {
      // 403: cevap için Belgeli Gezgin doğrulaması gerekir — teknik detay
      // göstermeden anlaşılır biçimde aktarılır.
      onNotice(locale === "tr" && requestError instanceof ApiError && requestError.message
        ? requestError.message
        : copy("Cevap gönderilemedi. Tekrar dene.", "The answer could not be sent. Try again."));
    } finally {
      setAnswerPosting(false);
    }
  };

  const unlockReplies = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!detail || unlocking) return;
    setUnlocking(true);
    try {
      await requestJson<{ data?: { unlocked?: boolean } }>(
        `/api/country-community/questions/${encodeURIComponent(detail.id)}/unlock`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          timeoutMs: 15_000,
        },
      );
      onNotice(copy("Ülke kilidi açıldı. Tüm cevaplar artık görünür.", "Country access unlocked. All answers are now visible."));
      await openDetail(detail.id);
    } catch (requestError) {
      onNotice(locale === "tr" && requestError instanceof ApiError && requestError.message
        ? requestError.message
        : copy("Ülke kilidi şu anda açılamadı. Tekrar dene.", "Country access could not be unlocked. Try again."));
    } finally {
      setUnlocking(false);
    }
  };

  const submitQuestion = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!/^[A-Z]{2}$/.test(countryCode)) return onNotice(copy("Önce soru sorduğun ülkeyi seç.", "Choose the country your question is about."));
    if (questionTitle.trim().length < 5) return onNotice(copy("Başlık en az 5 karakter olmalı.", "The title must be at least 5 characters."));
    if (questionBody.trim().length < 10) return onNotice(copy("Açıklama en az 10 karakter olmalı.", "The description must be at least 10 characters."));
    if (posting) return;
    setPosting(true);
    try {
      const result = await requestJson<{ moderation?: { action?: string } }>("/api/country-community/questions", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { countryCode, title: questionTitle.trim(), body: questionBody.trim(), category: "general" },
      });
      setQuestionOpen(false);
      setCountryCode("");
      setQuestionTitle("");
      setQuestionBody("");
      if (result.moderation?.action === "visible") await loadFeed();
      onNotice(result.moderation?.action === "visible" ? copy("Sorun toplulukta yayınlandı.", "Your question is live in the community.") : copy("Sorun incelemeye alındı.", "Your question was sent for review."));
    } catch (requestError) {
      onNotice(locale === "tr" && requestError instanceof Error ? requestError.message : copy("Soru gönderilemedi.", "The question could not be sent."));
    } finally {
      setPosting(false);
    }
  };

  return <div className="screen community-native-screen">
    <section className="page-intro compact-intro community-native-intro">
      <span className="page-icon"><Icon name="users" size={27} /></span>
      <div><small>{copy("TOPLULUK", "COMMUNITY")}</small><h1>{copy("Sor, gerçek deneyimleri oku", "Ask and read real experiences")}</h1><p>{copy("Gezginlerin sorularını ve paylaştığı deneyimleri gör; istersen sıralamaya katıl.", "Read travellers' questions and experiences, or join the ranking.")}</p></div>
    </section>

    <div className="segmented community-tabs" role="tablist" aria-label={copy("Topluluk bölümleri", "Community sections")}>
      <button id="community-tab-feed" type="button" role="tab" aria-selected={tab === "feed"} aria-controls="community-panel-feed" tabIndex={tab === "feed" ? 0 : -1} className={tab === "feed" ? "active" : ""} onKeyDown={handleTabKeyDown} onClick={() => setTab("feed")}><Icon name="compass" size={16} /> {copy("Sorular", "Questions")}</button>
      <button id="community-tab-league" type="button" role="tab" aria-selected={tab === "league"} aria-controls="community-panel-league" tabIndex={tab === "league" ? 0 : -1} className={tab === "league" ? "active" : ""} onKeyDown={handleTabKeyDown} onClick={() => setTab("league")}><Icon name="users" size={16} /> {copy("Gezgin sıralaması", "Traveller ranking")}</button>
    </div>

    <section id="community-panel-league" className="community-tab-panel" role="tabpanel" aria-labelledby="community-tab-league" tabIndex={tab === "league" ? 0 : -1} hidden={tab !== "league"}><section className="community-native-summary">
      <div><span><Icon name="globe" size={20} /></span><strong>{leaders.length}</strong><small>{copy("Sıralamadaki gezgin", "Ranked travellers")}</small></div>
      <button className="secondary-button" disabled={loading} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} {copy("Yenile", "Refresh")}
      </button>
    </section>

    {!user && <section className="community-account-nudge">
      <span><Icon name="user" size={23} /></span>
      <div><strong>{copy("Kendi kaşif alanını oluştur", "Create your Explorer space")}</strong><p>{copy("Ziyaretlerini aynı hesapta saklamak ve lig tercihini yönetmek için giriş yap.", "Sign in to keep visits together and manage your league preference.")}</p></div>
      <button type="button" onClick={onOpenAccount} aria-label={copy("Giriş yap veya hesap aç", "Sign in or create account")}><Icon name="chevron" size={18} /></button>
    </section>}

    {error && <div className="info-box error community-native-error" role="alert">
      <Icon name="alert" size={20} /><p>{error}</p><button disabled={loading} onClick={() => void load()}>{copy("Tekrar dene", "Try again")}</button>
    </div>}

    {loading && !loaded ? <div className="skeleton-list community-native-loading" aria-label={copy("Gezgin sıralaması yükleniyor", "Loading traveller ranking")}><div /><div /><div /></div>
      : !error && !leaders.length ? <div className="empty-state community-native-empty">
        <span><Icon name="users" size={30} /></span><strong>{copy("Sıralama henüz boş", "The ranking is empty")}</strong><p>{copy("Görünür olmayı seçen ilk gezginler burada listelenecek.", "Travellers who opt in will appear here.")}</p>
      </div>
      : leaders.length > 0 && <div className="community-leader-list" aria-live="polite">
        {leaders.map((leader, index) => {
          const isCurrentUser = Boolean(currentUsername) && leader.username.toLocaleLowerCase("tr-TR") === currentUsername;
          return <article className={`community-leader-card${isCurrentUser ? " current-user" : ""}`} key={`${leader.username}-${index}`}>
            <span className={`community-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</span>
            <span className="community-avatar" aria-hidden="true">{initials(leader.username)}</span>
            <div className="community-leader-identity">
              <div><strong>@{leader.username}</strong>{isCurrentUser && <em>{copy("Sen", "You")}</em>}</div>
              <small>{leader.level || copy("Seviye belirtilmedi", "Level not specified")}</small>
              {leader.verified && <span className="community-verified"><Icon name="shield" size={14} /> {copy("Doğrulanmış gezgin", "Verified traveller")}</span>}
            </div>
            <div className="community-leader-stats">
              <span><strong>{leader.visitedCount}</strong><small>{copy("ülke", "countries")}</small></span>
              <span><strong>{leader.points}</strong><small>{copy("puan", "points")}</small></span>
            </div>
          </article>;
        })}
      </div>}

    <div className="info-box community-privacy-note"><Icon name="shield" size={20} /><p>{copy("Sıralama yalnızca katılmayı seçen kullanıcıları ve güvenli profil özetlerini gösterir.", "The ranking shows only people who opted in and a safe profile summary.")}</p></div></section>

    <section id="community-panel-feed" className="community-feed" role="tabpanel" aria-labelledby="community-tab-feed" tabIndex={tab === "feed" ? 0 : -1} hidden={tab !== "feed"}>
      <div className="community-feed-toolbar"><div><small>{copy("ÜLKE TOPLULUKLARI", "COUNTRY COMMUNITIES")}</small><h2>{copy("Gezginlerin soruları", "Traveller questions")}</h2></div><button onClick={() => user ? setQuestionOpen((open) => !open) : onOpenAccount()}><Icon name={questionOpen ? "close" : "plus"} size={17} /> {questionOpen ? copy("Kapat", "Close") : copy("Soru sor", "Ask")}</button></div>
      {questionOpen && <div className="form-card community-question-form">
        <label>{copy("Ülke", "Country")}
          <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            <option value="" disabled>{copy("Hangi ülkeyle ilgili?", "Which country is this about?")}</option>
            {questionCountries.map((country) => <option key={country.alpha2} value={country.alpha2}>{flagEmoji(country.alpha2)} {country.name}</option>)}
          </select>
        </label>
        <label>{copy("Başlık", "Title")}<input value={questionTitle} maxLength={160} onChange={(event) => setQuestionTitle(event.target.value)} placeholder={copy("Gezginlere ne sormak istiyorsun?", "What would you like to ask travellers?")} /></label>
        <label>{copy("Açıklama", "Description")}<textarea value={questionBody} maxLength={4000} onChange={(event) => setQuestionBody(event.target.value)} placeholder={copy("Sorunu anlaşılır biçimde anlat…", "Explain your question clearly…")} /></label>
        <button className="primary-wide" disabled={posting} onClick={() => void submitQuestion()}>{posting ? <span className="button-loader" /> : <Icon name="users" size={18} />} {posting ? copy("Gönderiliyor", "Sending") : copy("Topluluğa gönder", "Post to community")}</button>
      </div>}
      {feedError && <div className="info-box error community-native-error" role="alert"><Icon name="alert" size={20} /><p>{feedError}</p><button disabled={feedLoading} onClick={() => void loadFeed()}>{copy("Tekrar dene", "Try again")}</button></div>}
      {feedLoading ? <div className="skeleton-list community-native-loading"><div /><div /><div /></div>
        : questions.length ? <div className="community-question-list">{questions.map((question) => <article key={question.id}>
          <button type="button" className="community-question-open" onClick={() => void openDetail(question.id)} aria-label={copy(`Soruyu aç: ${question.title}`, `Open question: ${question.title}`)}>
            <header><span>{questionScopeLabel(question.countryCode, copy("Genel", "General"))}</span><div><strong>@{question.username}</strong><small>{formatQuestionDate(question.createdAt, dateLocale)}</small></div><em>{copy(`${question.answerCount} cevap`, `${question.answerCount} answers`)}</em></header>
            <h3>{question.title}</h3><p>{question.body}</p>
          </button>
        </article>)}</div>
        : !feedError && <div className="empty-state"><span><Icon name="users" size={28} /></span><strong>{copy("Henüz görünür soru yok", "No visible questions yet")}</strong><p>{copy("İlk soruyu sorarak ülke topluluğunu başlatabilirsin.", "Ask the first question to start this country community.")}</p></div>}
    </section>

    <Sheet open={Boolean(detailId)} title={copy("Soru detayı", "Question details")} onClose={closeDetail} size="large">
      {detailLoading && <div className="skeleton-list"><div /><div /></div>}
      {detailError && !detailLoading && <div className="info-box error" role="alert"><Icon name="alert" size={19} /><p>{detailError}</p><button onClick={() => detailId && void openDetail(detailId)}>{copy("Tekrar dene", "Try again")}</button></div>}
      {detail && !detailLoading && <div className="community-question-detail">
        <header><span>{questionScopeLabel(detail.countryCode, copy("Genel", "General"))}</span><div><strong>@{detail.username}</strong><small>{formatQuestionDate(detail.createdAt, dateLocale)}</small></div></header>
        <h3>{detail.title}</h3>
        <p>{detail.body}</p>
        <div className="community-answers">
          <div className="section-heading"><div><span>{copy("CEVAPLAR", "ANSWERS")}</span><h2>{totalAnswerCount ? copy(`${totalAnswerCount} cevap`, `${totalAnswerCount} answers`) : copy("Henüz cevap yok", "No answers yet")}</h2>{totalAnswerCount > 0 && <small>{hiddenAnswerCount > 0 ? copy(`${shownAnswerCount} gösteriliyor · ${hiddenAnswerCount} kilitli`, `${shownAnswerCount} shown · ${hiddenAnswerCount} locked`) : shownAnswerCount < totalAnswerCount ? copy(`${shownAnswerCount} gösteriliyor`, `${shownAnswerCount} shown`) : copy("Tüm cevaplar gösteriliyor", "All answers shown")}</small>}</div></div>
          {detail.answers.map((answer) => <article key={answer.id} className="community-answer">
            <header><strong>@{answer.username}</strong><small>{formatQuestionDate(answer.createdAt, dateLocale)}</small></header>
            <p>{answer.body}</p>
          </article>)}
          {hiddenAnswerCount > 0 && <div className="empty-inline community-unlock-box"><Icon name="lock" size={18} /><div><strong>{copy(`${hiddenAnswerCount} cevap kilitli`, `${hiddenAnswerCount} answers locked`)}</strong><span>{copy("Ücretsiz hesabınla ülke kilidini açıp tüm deneyimleri okuyabilirsin.", "Use your free account to unlock this country and read every experience.")}</span><button type="button" className="secondary-wide" disabled={unlocking} onClick={() => user ? void unlockReplies() : onOpenAccount()}>{unlocking ? <span className="button-loader dark" /> : <Icon name={user ? "unlock" : "user"} size={17} />} {user ? (unlocking ? copy("Açılıyor", "Unlocking") : copy("Tüm cevapların kilidini aç", "Unlock all answers")) : copy("Giriş yap ve kilidi aç", "Sign in and unlock")}</button></div></div>}
          {!shownAnswerCount && !hiddenAnswerCount && <div className="empty-inline"><Icon name="info" size={18} /><div><strong>{copy("İlk cevabı sen yaz", "Write the first answer")}</strong><span>{copy("Deneyimini paylaşarak gezginlere yardım et.", "Share your experience to help travellers.")}</span></div></div>}
        </div>
        {user ? <div className="community-answer-form">
          <label>{copy("Cevabın", "Your answer")}<textarea value={answerBody} maxLength={4000} onChange={(event) => setAnswerBody(event.target.value)} placeholder={copy("Deneyimini paylaş…", "Share your experience…")} /></label>
          <button className="primary-wide" disabled={answerPosting || answerBody.trim().length < 3} onClick={() => void submitAnswer()}>{answerPosting ? <span className="button-loader" /> : <Icon name="users" size={17} />} {answerPosting ? copy("Gönderiliyor", "Sending") : copy("Cevabı gönder", "Send answer")}</button>
        </div> : <button className="secondary-wide" onClick={onOpenAccount}><Icon name="user" size={17} /> {copy("Cevap yazmak için giriş yap", "Sign in to answer")}</button>}
      </div>}
    </Sheet>
  </div>;
}
