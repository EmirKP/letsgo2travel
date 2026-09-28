import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CountryFlag } from "../components/CountryFlag";
import { BrandMark } from "../components/BrandMark";
import { CountryPicker } from "../components/CountryPicker";
import { Icon, type IconName } from "../components/Icon";
import { Sheet } from "../components/Sheet";
import { CommunityBlocksSheet, CommunitySafetySheet } from "../components/CommunitySafetySheet";
import { SupportSheet } from "../components/SupportSheet";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { communityRegions, matchesCommunityRegion, type CommunityRegionId } from "../data/communityDiscovery";
import { readCommunityFollows, writeCommunityFollows } from "../lib/communityPreferences";
import { ApiError, requestJson } from "../lib/api";
import {
  communityCount as count,
  communityText as text,
  listCommunityQuestions,
  type CommunityQuestion,
  type CommunitySafetyTarget,
} from "../lib/community";
import { openExternal } from "../lib/native";
import type { AuthUser, ViewId } from "../types";
import { useI18n } from "../lib/i18n";
import communityCover from "../assets/community-reference/community-hero.webp";
import leagueCover from "../assets/community-reference/league-banner.webp";
import cappadocia from "../assets/home-reference/cappadocia.webp";
import bali from "../assets/home-reference/bali.webp";
import tokyo from "../assets/destination-artwork/tokyo.webp";
import eventsCover from "../assets/editorial/events.webp";
import "./reference-community-profile.css";
import "./reference-community.css";

type CommunityTab = "feed" | "following" | "groups" | "questions" | "events";

// Soru formunda ülke SEÇİLİR (kod yazılmaz); ada göre sıralı, bayraklı.
type CommunityAnswer = {
  id: string;
  body: string;
  createdAt: string;
  username: string;
  authorId: string | null;
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
  initialCountryCode?: string;
  onOpenAccount: () => void;
  onNotice: (message: string) => void;
  onNavigate: (view: ViewId) => void;
  onOpenNotifications: () => void;
  onOpenMenu: () => void;
  onSearchDestination: (query: string) => void;
  unreadCount: number;
};

export type CommunityLeader = {
  username: string;
  visitedCount: number;
  points: number;
  level: string;
  verified: boolean;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function formatQuestionDate(value: string, locale = "tr-TR") {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function questionScopeLabel(countryCode: string, countryLabels: ReadonlyMap<string, string>, general = "Genel") {
  const normalizedCode = countryCode.toUpperCase();
  const label = countryLabels.get(normalizedCode) || countryCode;
  return normalizedCode === "ZZ"
    ? <><span className="community-world-flag" aria-hidden="true"><Icon name="globe" size={18}/></span><b>{general}</b></>
    : <><CountryFlag code={countryCode} label={label} className="community-scope-flag" /><b>{label}</b></>;
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

export function CommunityScreen(props: CommunityScreenProps) {
  return <CommunityScreenForAccount key={props.user?.id || "guest"} {...props} />;
}

function CommunityScreenForAccount({ user, accessToken, initialCountryCode = "", onOpenAccount, onNotice, onNavigate, onOpenNotifications, onOpenMenu, onSearchDestination, unreadCount }: CommunityScreenProps) {
  const { copy, countryName, dateLocale, locale, setLocale } = useI18n();
  const questionCountries = useMemo(() => [...COUNTRY_LIST]
    .map((country) => ({ name: countryName(country.alpha3, country.name), alpha2: alpha2FromAlpha3(country.alpha3) }))
    .filter((country) => /^[A-Z]{2}$/.test(country.alpha2))
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);
  const questionCountryOptions = useMemo(() => questionCountries.map((country) => ({
    code: country.alpha2,
    flagCode: country.alpha2,
    name: country.name,
  })), [questionCountries]);
  const questionCountryLabels = useMemo(() => new Map(questionCountries.map(country => [country.alpha2, country.name])), [questionCountries]);
  const [tab, setTab] = useState<CommunityTab>("feed");
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [region, setRegion] = useState<CommunityRegionId>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [followedCountries, setFollowedCountries] = useState(() => readCommunityFollows(user?.id || null));
  const searchInput = useRef<HTMLInputElement>(null);
  const [leaders, setLeaders] = useState<CommunityLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<CommunityQuestion[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [countryFilter, setCountryFilter] = useState(() => /^[A-Z]{2}$/.test(initialCountryCode) ? initialCountryCode : "");
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
  const [safetyTarget, setSafetyTarget] = useState<CommunitySafetyTarget | null>(null);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const active = useRef(true);
  const detailGeneration = useRef(0);
  const requestGeneration = useRef(0);
  const feedGeneration = useRef(0);
  const currentUsername = useMemo(() => userName(user).toLocaleLowerCase("tr-TR"), [user]);
  const shownAnswerCount = detail?.answers.length || 0;
  const answerRemaining = 4000 - answerBody.length;
  const hiddenAnswerCount = count(detail?.hiddenAnswerCount);
  const totalAnswerCount = Math.max(
    count(detail?.totalAnswerCount),
    shownAnswerCount + hiddenAnswerCount,
  );
  const feedCountries = useMemo(() => {
    const codes = Array.from(new Set(questions.map((question) => question.countryCode)));
    if (countryFilter && !codes.includes(countryFilter)) codes.unshift(countryFilter);
    return codes.slice(0, 8);
  }, [countryFilter, questions]);
  const filteredQuestions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return questions.filter(question => (!countryFilter || question.countryCode === countryFilter)
      && matchesCommunityRegion(question.countryCode, region)
      && (tab !== "following" || followedCountries.includes(question.countryCode))
      && (sort !== "unanswered" || question.answerCount === 0)
      && (!query || [question.title, question.body, question.username, questionCountryLabels.get(question.countryCode)].join(" ").toLocaleLowerCase(locale).includes(query)))
      .sort((a, b) => sort === "answered" ? b.answerCount - a.answerCount || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }, [countryFilter, followedCountries, locale, questionCountryLabels, questions, region, search, sort, tab]);
  const regions = useMemo(() => communityRegions(locale), [locale]);
  const groups = useMemo(() => questionCountries.filter(country => matchesCommunityRegion(country.alpha2, region)
    && country.name.toLocaleLowerCase(locale).includes(groupSearch.trim().toLocaleLowerCase(locale))), [groupSearch, locale, questionCountries, region]);
  const tabs: { id: CommunityTab; label: string; icon: IconName }[] = [
    { id: "feed", label: copy("Keşfet", "Discover"), icon: "compass" },
    { id: "following", label: copy("Takip Ettiklerim", "Following"), icon: "users" },
    { id: "groups", label: copy("Ülke Grupları", "Country Groups"), icon: "globe" },
    { id: "questions", label: copy("Soru & Cevap", "Questions & Answers"), icon: "info" },
    { id: "events", label: copy("Etkinlikler", "Events"), icon: "calendar" },
  ];
  const inspirations = [
    { image: cappadocia, query: "Kapadokya", label: copy("Seyahat rotası", "Travel route"), title: copy("Kapadokya’da yeni bir sabah", "A new morning in Cappadocia"), body: copy("Peri bacaları, vadiler ve gökyüzünü renklendiren balonlar. Kendi rotanı oluştur.", "Fairy chimneys, valleys and colourful balloons. Build your own route."), country: copy("Türkiye", "Turkey"), code: "TR" },
    { image: tokyo, query: "Tokyo", label: copy("Şehir keşfi", "City discovery"), title: copy("Japonya’nın iki farklı yüzü", "Discover two sides of Japan"), body: copy("Tokyo’nun hareketli sokaklarından sakin tapınaklara. Keşfetmeye buradan başla.", "From lively Tokyo streets to quiet temples. Start exploring here."), country: copy("Japonya", "Japan"), code: "JP" },
    { image: bali, query: "Bali", label: copy("İlham al", "Find inspiration"), title: copy("Bali’de adanın ritmini yakala", "Find your island rhythm in Bali"), body: copy("Yeşilin ve mavinin buluştuğu rotalar. Bir sonraki seyahatine ilham bul.", "Where green meets blue. Find inspiration for your next journey."), country: copy("Endonezya", "Indonesia"), code: "ID" },
  ];
  const startQuestion = () => {
    if (!user || !accessToken) return onOpenAccount();
    if (countryFilter && countryFilter !== "ZZ") setCountryCode(countryFilter);
    setQuestionOpen(true);
  };
  const toggleFollow = (code: string) => {
    const next = followedCountries.includes(code) ? followedCountries.filter(item => item !== code) : [...followedCountries, code];
    if (!writeCommunityFollows(user?.id || null, next)) return onNotice(copy("Tercihin kaydedilemedi. Tekrar dene.", "Your preference could not be saved. Try again."));
    setFollowedCountries(next);
  };

  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);

  useEffect(() => {
    setCountryFilter(/^[A-Z]{2}$/.test(initialCountryCode) ? initialCountryCode : "");
  }, [initialCountryCode]);

  const selectTab = (nextTab: CommunityTab) => {
    setTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`community-tab-${nextTab}`)?.focus());
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex(item => item.id === tab);
    selectTab(tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].id);
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
      const next = await listCommunityQuestions(40, accessToken);
      if (generation !== feedGeneration.current) return;
      setQuestions(next);
    } catch {
      if (generation === feedGeneration.current) {
        setQuestions([]);
        setFeedError(copy("Topluluk akışı şu anda yüklenemedi. Bağlantını kontrol edip tekrar dene.", "The community feed could not be loaded. Check your connection and try again."));
      }
    } finally {
      if (generation === feedGeneration.current) setFeedLoading(false);
    }
  }, [accessToken, copy]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      requestGeneration.current += 1;
      feedGeneration.current += 1;
      detailGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    void loadFeed();
    // Feed refreshes must not invalidate an in-flight detail or league request.
    // Account changes still remount the keyed screen and invalidate all three.
    return () => { feedGeneration.current += 1; };
  }, [loadFeed]);

  useEffect(() => {
    // Lig verisi, kullanıcı yalnız akışa bakarken gereksiz bir ağ ve veri
    // tabanı isteği oluşturmasın. İlk kez Lig sekmesi açıldığında yüklenir.
    if (leagueOpen && !loaded && !loading) void load();
  }, [load, loaded, loading, leagueOpen]);

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

  const openSafety = (target: CommunitySafetyTarget) => {
    if (!user || !accessToken) return onOpenAccount();
    if (target.authorId === user.id) return;
    setSafetyTarget(target);
  };

  const authorButton = (item: { id: string; authorId: string | null; username: string }, targetType: "question" | "answer") => item.authorId === user?.id
    ? <strong className="community-author-self">@{item.username}</strong>
    : <button type="button" className="community-author-button" aria-haspopup="dialog"
      onClick={() => openSafety({ targetType, targetId: item.id, authorId: item.authorId, username: item.username })}
      aria-label={copy(`@${item.username} için kullanıcı seçenekleri`, `User options for @${item.username}`)}
    ><strong>@{item.username}</strong><Icon name="chevron" size={12} /></button>;

  const onBlocked = (blockedId: string) => {
    setSafetyTarget(null);
    setQuestions((rows) => rows.filter((row) => row.authorId !== blockedId));
    // Reload server-derived counts and access state after filtering any blocked reply.
    if (detail?.authorId === blockedId) closeDetail();
    else if (detail) void openDetail(detail.id);
    void loadFeed();
    onNotice(copy("Kullanıcı engellendi. Engellenen hesaplar bölümünden yönetebilirsin.", "User blocked. You can manage this in Blocked accounts."));
  };

  const submitAnswer = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!detail) return;
    const body = answerBody.trim();
    if (body.length < 3) return onNotice(copy("Cevap en az 3 karakter olmalı.", "Your answer must be at least 3 characters."));
    if (answerPosting) return;
    const generation = detailGeneration.current;
    setAnswerPosting(true);
    try {
      const result = await requestJson<{ moderation?: { action?: string } }>("/api/country-community/answers", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { countryCode: detail.countryCode, questionId: detail.id, body },
      });
      if (generation !== detailGeneration.current) return;
      setAnswerBody("");
      onNotice(result.moderation?.action === "visible" ? copy("Cevabın yayınlandı.", "Your answer is live.") : copy("Cevabın incelemeye alındı.", "Your answer was sent for review."));
      if (result.moderation?.action === "visible") await openDetail(detail.id);
    } catch (requestError) {
      // 403: cevap için Belgeli Gezgin doğrulaması gerekir — teknik detay
      // göstermeden anlaşılır biçimde aktarılır.
      if (!active.current || generation !== detailGeneration.current) return;
      onNotice(locale === "tr" && requestError instanceof ApiError && requestError.message
        ? requestError.message
        : copy("Cevap gönderilemedi. Tekrar dene.", "The answer could not be sent. Try again."));
    } finally {
      if (active.current) setAnswerPosting(false);
    }
  };

  const unlockReplies = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!detail || unlocking) return;
    const generation = detailGeneration.current;
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
      if (!active.current || generation !== detailGeneration.current) return;
      onNotice(copy("Ülke kilidi açıldı. Tüm cevaplar artık görünür.", "Country access unlocked. All answers are now visible."));
      await openDetail(detail.id);
    } catch (requestError) {
      if (!active.current || generation !== detailGeneration.current) return;
      onNotice(locale === "tr" && requestError instanceof ApiError && requestError.message
        ? requestError.message
        : copy("Ülke kilidi şu anda açılamadı. Tekrar dene.", "Country access could not be unlocked. Try again."));
    } finally {
      if (active.current) setUnlocking(false);
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
      if (!active.current) return;
      setQuestionOpen(false);
      setCountryCode("");
      setQuestionTitle("");
      setQuestionBody("");
      if (result.moderation?.action === "visible") await loadFeed();
      onNotice(result.moderation?.action === "visible" ? copy("Sorun toplulukta yayınlandı.", "Your question is live in the community.") : copy("Sorun incelemeye alındı.", "Your question was sent for review."));
    } catch (requestError) {
      if (!active.current) return;
      onNotice(locale === "tr" && requestError instanceof Error ? requestError.message : copy("Soru gönderilemedi.", "The question could not be sent."));
    } finally {
      if (active.current) setPosting(false);
    }
  };

  return <div className="screen community-native-screen reference-community community-social">
    <section className="cs-hero" aria-labelledby="community-welcome-title">
      <img className="cs-hero-image" src={communityCover} alt="" width={1600} height={800} fetchPriority="high"/>
      <header className="cs-header">
        <div className="cs-brand"><BrandMark/><p>{copy("Gezginler bir arada, dünya daha yakın.", "Travellers together, the world closer.")}</p></div>
        <div className="cs-header-actions">
          <button type="button" aria-label={copy("Toplulukta ara", "Search community")} aria-expanded={searchOpen} aria-controls="community-search" onClick={() => { setSearchOpen(open => !open); if (searchOpen) setSearch(""); if (tab === "groups" || tab === "events") setTab("feed"); }}><Icon name="search" size={23}/></button>
          <button type="button" aria-label={copy(`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ""}`, `Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`)} onClick={onOpenNotifications}><Icon name="bell" size={23}/>{unreadCount > 0 && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}</button>
          <button type="button" className="cs-profile" aria-label={copy("Profilini aç", "Open your profile")} onClick={() => onNavigate("profile")}>{user ? initials(userName(user)) : <Icon name="user" size={23}/>}</button>
          <button type="button" className="cs-menu" aria-label={copy("Menüyü aç", "Open menu")} onClick={onOpenMenu}><Icon name="menu" size={21}/></button>
          <button type="button" className="cs-language" aria-label={copy("Uygulama dilini İngilizce yap", "Switch app language to Turkish")} onClick={() => setLocale(locale === "tr" ? "en" : "tr")}>{locale.toUpperCase()}</button>
        </div>
      </header>
      <div className="cs-hero-copy"><h1 id="community-welcome-title">{copy("Topluluk", "Community")}</h1><p>{copy("Aynı tutkuyu paylaşan gezginlerle tanış, ilham al, deneyimlerini paylaş.", "Meet travellers who share your passion, find inspiration and share experiences.")}</p></div>
      <p className="cs-handwritten" aria-hidden="true">{copy("Daha Fazla", "More")}<br/>{copy("Hikâye", "Stories")}<br/><span>{copy("Daha Fazla Sen", "More You")}</span></p>
      <div className="cs-stats" aria-label={copy("Son yüklenen topluluk akışı", "Latest loaded community feed")}>
        <div><Icon name="users" size={24}/><span><strong>{feedLoading || feedError ? "—" : new Set(questions.map(item => item.authorId || item.username)).size}</strong><small>{copy("Akışta gezgin", "In this feed")}</small></span></div>
        <div><Icon name="globe" size={24}/><span><strong>{questionCountries.length}</strong><small>{copy("Ülke grubu", "Country groups")}</small></span></div>
        <div><Icon name="users" size={24}/><span><strong>{feedLoading || feedError ? "—" : questions.length}</strong><small>{copy("Güncel paylaşım", "Recent posts")}</small></span></div>
      </div>
    </section>

    <div className="cs-surface">
      <div className="cs-tabs" role="tablist" aria-label={copy("Topluluk bölümleri", "Community sections")}>
        {tabs.map(item => <button key={item.id} id={`community-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`community-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? "active" : ""} onKeyDown={handleTabKeyDown} onClick={() => setTab(item.id)}><Icon name={item.icon} size={20}/>{item.label}</button>)}
      </div>
      <div className="cs-regions" role="group" aria-label={copy("Bölgeye göre keşfet", "Discover by region")}>
        {regions.map(item => <button key={item.id} type="button" className={region === item.id ? "active" : ""} aria-pressed={region === item.id} onClick={() => { setRegion(item.id); setCountryFilter(""); if (tab === "events") setTab("feed"); }}><span>{item.id !== "all" && item.image ? <img src={item.image} alt="" width={80} height={80} loading="lazy"/> : <Icon name="globe" size={37}/>}</span><strong>{item.label}</strong></button>)}
      </div>
      <section className="cs-league-banner" aria-labelledby="cs-league-title">
        <img src={leagueCover} alt="" width={1200} height={300} loading="lazy"/>
        <span className="cs-trophy" aria-hidden="true"><Icon name="trophy" size={36}/></span><div><h2 id="cs-league-title">{copy("Kaşifler Ligi", "Explorers League")}</h2><p>{copy("Seyahat et, keşfet, ligde yerini al!", "Travel, explore, take your place!")}</p></div>
        <button type="button" aria-haspopup="dialog" onClick={() => setLeagueOpen(true)}>{copy("Ligi Keşfet", "Explore League")}<Icon name="chevron" size={20}/></button>
      </section>

      <div id="community-search" className="cs-search-panel" hidden={!searchOpen}>
        <label htmlFor="community-search-input">{copy("Toplulukta ara", "Search community")}</label><div><Icon name="search" size={20}/><input ref={searchInput} id="community-search-input" type="search" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} placeholder={copy("Ülke, konu veya gezgin…", "Country, topic or traveller…")}/><button type="button" aria-label={copy("Aramayı kapat", "Close search")} onClick={() => { setSearchOpen(false); setSearch(""); }}><Icon name="close" size={20}/></button></div>
      </div>

      {tab === "feed" && region === "all" && !countryFilter && !search && <section className="cs-inspiration" aria-labelledby="cs-inspiration-title">
        <div className="cs-section-heading"><h2 id="cs-inspiration-title">{copy("Keşfetmeye Değer", "Worth Exploring")}</h2><button type="button" onClick={() => onNavigate("explore")}>{copy("Tümünü Gör", "See All")}<Icon name="chevron" size={17}/></button></div>
        <div className="cs-inspiration-grid">{inspirations.map(item => <article key={item.code}><button type="button" className="cs-inspiration-open" onClick={() => onSearchDestination(item.query)}><div className="cs-inspiration-photo"><img src={item.image} alt="" width={320} height={205} loading="lazy" decoding="async"/><span>{item.label}</span></div><div className="cs-inspiration-copy"><h3>{item.title}</h3><p>{item.body}</p><small><CountryFlag code={item.code} label={item.country}/>{item.country}<Icon name="chevron" size={16}/></small></div></button></article>)}</div>
        <p className="cs-editorial-note">{copy("LetsGo2Travel’den seyahat fikirleri", "Travel ideas from LetsGo2Travel")}</p>
      </section>}

      {tab === "groups" && <section id="community-panel-groups" role="tabpanel" aria-labelledby="community-tab-groups" className="cs-groups" tabIndex={0}>
        <div className="cs-section-heading"><h2>{copy("Ülke Grupları", "Country Groups")}</h2><span>{groups.length}</span></div><p className="cs-section-intro">{copy("Bir ülke seç, gezginlerin sorularına katıl. Takip ettiğin gruplar bu cihazda saklanır.", "Choose a country and join the conversation. Followed groups are saved on this device.")}</p>
        <label className="cs-group-search"><Icon name="search" size={20}/><span className="sr-only">{copy("Ülke ara", "Search countries")}</span><input type="search" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} placeholder={copy("Ülke ara", "Search countries")}/></label>
        <div className="cs-group-grid">{groups.map(country => <article key={country.alpha2}><button type="button" className="cs-group-open" onClick={() => { setCountryFilter(country.alpha2); setRegion("all"); setSearch(""); setTab("questions"); }}><CountryFlag code={country.alpha2} label={country.name}/><span><strong>{country.name}</strong><small>{copy("Sohbete katıl", "Join the conversation")}</small></span></button><button type="button" className="cs-follow" aria-label={copy(`${country.name} grubunu ${followedCountries.includes(country.alpha2) ? "takipten çıkar" : "takip et"}`, `${followedCountries.includes(country.alpha2) ? "Unfollow" : "Follow"} ${country.name} group`)} aria-pressed={followedCountries.includes(country.alpha2)} onClick={() => toggleFollow(country.alpha2)}><Icon name={followedCountries.includes(country.alpha2) ? "check" : "plus"} size={20}/></button></article>)}</div>
        {!groups.length && <div className="empty-state"><Icon name="search" size={28}/><strong>{copy("Bu aramada ülke bulunamadı", "No countries found")}</strong><button type="button" className="secondary-button" onClick={() => { setGroupSearch(""); setRegion("all"); }}>{copy("Tüm ülkeleri göster", "Show all countries")}</button></div>}
      </section>}

      {tab === "events" && <section id="community-panel-events" role="tabpanel" aria-labelledby="community-tab-events" className="cs-events" tabIndex={0}><img src={eventsCover} alt="" width={900} height={500} loading="lazy"/><div><span>{copy("YENİ ANILAR BİRİKTİR", "MAKE NEW MEMORIES")}</span><h2>{copy("Seyahatine bir etkinlik ekle", "Add an event to your journey")}</h2><p>{copy("Gideceğin yerdeki konserleri, festivalleri ve etkinlikleri tarihine göre keşfet.", "Find concerts, festivals and events for your destination and dates.")}</p><button type="button" onClick={() => onNavigate("events")}>{copy("Etkinlikleri keşfet", "Discover events")}<Icon name="chevron" size={20}/></button></div></section>}

      {(tab === "feed" || tab === "following" || tab === "questions") && <section id={`community-panel-${tab}`} className="community-feed cs-feed" role="tabpanel" aria-labelledby={`community-tab-${tab}`} tabIndex={0}>
        <div className="cs-section-heading cs-feed-heading"><div><h2>{tab === "following" ? copy("Takip Ettiklerim", "Following") : tab === "questions" ? copy("Soru & Cevap", "Questions & Answers") : copy("Topluluktan En Yeniler", "Latest from the Community")}</h2><p>{copy("Sor, paylaş, birlikte keşfet.", "Ask, share, explore together.")}</p></div><label className="cs-sort"><Icon name="swap" size={15}/><span className="sr-only">{copy("Akışı sırala", "Sort the feed")}</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">{copy("En Yeni", "Newest")}</option><option value="answered">{copy("En Çok Cevap", "Most Answered")}</option><option value="unanswered">{copy("Cevap Bekleyen", "Unanswered")}</option></select></label></div>
        {tab === "following" && <div className="cs-following-info"><p>{copy("Takip ettiğin ülke gruplarının son paylaşımları. Tercihlerin bu cihazda saklanır.", "Latest posts from your followed country groups. Preferences are saved on this device.")}</p><button type="button" onClick={() => setTab("groups")}>{copy("Grupları seç", "Choose groups")}<Icon name="plus" size={16}/></button></div>}
        {countryFilter && <div className="cs-active-country">{questionScopeLabel(countryFilter, questionCountryLabels, copy("Genel", "General"))}<button type="button" aria-label={copy("Ülke filtresini kaldır", "Clear country filter")} onClick={() => setCountryFilter("")}><Icon name="close" size={16}/></button>{countryFilter !== "ZZ" && <button type="button" className="cs-follow-country" aria-pressed={followedCountries.includes(countryFilter)} onClick={() => toggleFollow(countryFilter)}><Icon name={followedCountries.includes(countryFilter) ? "check" : "plus"} size={16}/>{followedCountries.includes(countryFilter) ? copy("Takip ediliyor", "Following") : copy("Grubu takip et", "Follow group")}</button>}</div>}
        {!feedLoading && feedCountries.length > 1 && <div className="community-country-filters" role="group" aria-label={copy("Ülke topluluğunu filtrele", "Filter country community")}><button type="button" className={!countryFilter ? "active" : ""} aria-pressed={!countryFilter} onClick={() => setCountryFilter("")}>{copy("Tümü", "All")}</button>{feedCountries.filter(code => matchesCommunityRegion(code, region)).map(code => <button type="button" key={code} className={countryFilter === code ? "active" : ""} aria-pressed={countryFilter === code} onClick={() => setCountryFilter(code)}>{questionScopeLabel(code, questionCountryLabels, copy("Genel", "General"))}</button>)}</div>}
        {feedError && <div className="info-box error community-native-error" role="alert"><Icon name="alert" size={20}/><p>{feedError}</p><button disabled={feedLoading} onClick={() => void loadFeed()}>{copy("Tekrar dene", "Try again")}</button></div>}
        {feedLoading ? <div className="skeleton-list community-native-loading" role="status" aria-label={copy("Paylaşımlar yükleniyor", "Loading posts")}><div/><div/><div/></div>
          : filteredQuestions.length ? <div className="cs-posts">{filteredQuestions.map(question => <article key={question.id}>
            <header><span className="cs-author-avatar" aria-hidden="true"><span>{initials(question.username)}</span></span><div><strong className="cs-post-author">@{question.username}</strong><p><span className="cs-post-country">{questionScopeLabel(question.countryCode, questionCountryLabels, copy("Genel", "General"))}</span></p></div>{question.authorId !== user?.id && <button type="button" className="cs-post-menu" aria-haspopup="dialog" aria-label={copy(`@${question.username} için kullanıcı seçenekleri`, `User options for @${question.username}`)} onClick={() => openSafety({ targetType: "question", targetId: question.id, authorId: question.authorId, username: question.username })}><svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>}</header>
            <button type="button" className="community-question-open" onClick={() => void openDetail(question.id)} aria-label={copy(`Soruyu aç: ${question.title}`, `Open question: ${question.title}`)}>
              <svg className="cs-post-flightline" viewBox="0 0 360 310" fill="none" aria-hidden="true" focusable="false"><circle cx="344" cy="292" r="135" stroke="currentColor"/><circle cx="344" cy="292" r="100" stroke="currentColor"/><path d="M-20 286C48 187 74 297 156 224S248 260 304 154" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 7"/><path d="m295 148 27-10-10 27-5-12-12-5Z" fill="currentColor"/></svg>
              <span className="cs-post-category"><Icon name="message" size={16}/>{copy("GEZGİNLERE BİR SORU", "A QUESTION FOR TRAVELLERS")}</span><h3>{question.title}</h3><span className="cs-post-signature" aria-hidden="true"><span/>{copy("Birlikte keşfedelim.", "Let's explore together.")}</span>
            </button>
            <footer><button type="button" className="cs-post-answers" onClick={() => void openDetail(question.id)}><Icon name="message" size={24}/>{copy(`${question.answerCount} cevap`, `${question.answerCount} answers`)}</button><button type="button" className="cs-post-join" onClick={() => void openDetail(question.id)}><Icon name="plane" size={23}/>{copy("Sohbete katıl", "Join the conversation")}</button></footer>
            <div className="cs-post-caption"><p><strong>@{question.username}</strong> {question.body}</p><button type="button" onClick={() => void openDetail(question.id)}>{copy("Devamını oku", "Read more")}</button><time dateTime={question.createdAt}>{formatQuestionDate(question.createdAt, dateLocale)}</time></div>
          </article>)}</div>
          : !feedError && <div className="empty-state cs-empty"><span><Icon name={tab === "following" ? "heart" : "users"} size={30}/></span><strong>{tab === "following" && !followedCountries.length ? copy("İlgini çeken ülkelerle başla", "Start with countries you love") : copy("Burada henüz paylaşım yok", "No posts here yet")}</strong><p>{tab === "following" && !followedCountries.length ? copy("Ülke gruplarını takip et, yeni sorularını burada bul.", "Follow country groups to find their latest questions here.") : copy("Seçtiğin filtrelere uygun güncel paylaşım bulunamadı. İlk soruyu sen sorabilirsin.", "No recent posts match your filters. You can ask the first question.")}</p><button type="button" className="secondary-button" onClick={() => { if (tab === "following" && !followedCountries.length) setTab("groups"); else { setCountryFilter(""); setRegion("all"); setSearch(""); setSort("newest"); setTab("feed"); } }}>{tab === "following" && !followedCountries.length ? copy("Ülke gruplarını keşfet", "Explore country groups") : copy("Tüm paylaşımları gör", "See all posts")}</button></div>}
      </section>}
      <div className="community-safety-toolbar" aria-label={copy("Topluluk güvenliği ve destek", "Community safety and support")}>
        <button type="button" onClick={() => user && accessToken ? setBlocksOpen(true) : onOpenAccount()}><Icon name="unlock" size={17}/><span>{copy("Engellenenler", "Blocked users")}<small>{copy("Engeli kaldır", "Unblock")}</small></span></button>
        <button type="button" onClick={() => setSupportOpen(true)}><Icon name="mail" size={17}/>{copy("Destek", "Support")}</button>
        <button type="button" onClick={() => void openExternal("/topluluk-kurallari").then(opened => { if (!opened && active.current) onNotice(copy("Topluluk kuralları açılamadı. Tekrar dene.", "Community rules could not be opened. Please retry.")); })}><Icon name="shield" size={17}/>{copy("Topluluk kuralları", "Community rules")}</button>
      </div>
    </div>
    <button type="button" className="cs-compose" onClick={startQuestion} aria-haspopup="dialog"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5ZM14 5l5 5"/></svg>{copy("Gönderi Paylaş", "Share a Post")}</button>
    <Sheet open={leagueOpen} title={copy("Kaşifler Ligi", "Explorers League")} onClose={() => setLeagueOpen(false)} size="large"><div className="cs-league-sheet">
      <section className="community-native-summary">
      <div><span><Icon name="globe" size={20} /></span><strong>{loaded ? leaders.length : "—"}</strong><small>{copy("Sıralamadaki gezgin", "Ranked travellers")}</small></div>
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

    <div className="info-box community-privacy-note"><Icon name="shield" size={20} /><p>{copy("Sıralama yalnızca katılmayı seçen kullanıcıları ve güvenli profil özetlerini gösterir.", "The ranking shows only people who opted in and a safe profile summary.")}</p></div>
    </div></Sheet>
    <Sheet open={questionOpen} title={copy("Topluluğa sor", "Ask the community")} dismissible={!posting} onClose={() => setQuestionOpen(false)}>
      <p className="cs-compose-intro">{copy("Bir ülke seç, merak ettiğini gezginlere sor.", "Choose a country and ask fellow travellers.")}</p>
      <div id="community-question-compose" className="form-card community-question-form">
        <CountryPicker value={countryCode} options={questionCountryOptions} onChange={(value) => { if (!posting) setCountryCode(value); }} label={copy("Ülke", "Country")} placeholder={copy("Hangi ülkeyle ilgili?", "Which country is this about?")} />
        <label>{copy("Başlık", "Title")}<input disabled={posting} value={questionTitle} maxLength={160} onChange={(event) => setQuestionTitle(event.target.value)} placeholder={copy("Gezginlere ne sormak istiyorsun?", "What would you like to ask travellers?")} /></label>
        <label>{copy("Açıklama", "Description")}<textarea disabled={posting} value={questionBody} maxLength={4000} onChange={(event) => setQuestionBody(event.target.value)} placeholder={copy("Sorunu anlaşılır biçimde anlat…", "Explain your question clearly…")} /></label>
        <button className="primary-wide" disabled={posting} onClick={() => void submitQuestion()}>{posting ? <span className="button-loader" /> : <Icon name="users" size={18} />} {posting ? copy("Gönderiliyor", "Sending") : copy("Topluluğa gönder", "Post to community")}</button>
      </div>
    </Sheet>

    <Sheet open={Boolean(detailId)} title={copy("Soru detayı", "Question details")} onClose={closeDetail} size="large">
      {detailLoading && <div className="skeleton-list"><div /><div /></div>}
      {detailError && !detailLoading && <div className="info-box error" role="alert"><Icon name="alert" size={19} /><p>{detailError}</p><button onClick={() => detailId && void openDetail(detailId)}>{copy("Tekrar dene", "Try again")}</button></div>}
      {detail && !detailLoading && <div className="community-question-detail" data-autofocus tabIndex={-1}>
        <header><span>{questionScopeLabel(detail.countryCode, questionCountryLabels, copy("Genel", "General"))}</span><div>{authorButton(detail, "question")}<small>{formatQuestionDate(detail.createdAt, dateLocale)}</small></div></header>
        <h3>{detail.title}</h3>
        <p>{detail.body}</p>
        <div className="community-answers">
          <div className="section-heading"><div><span>{copy("CEVAPLAR", "ANSWERS")}</span><h2>{totalAnswerCount ? copy(`${totalAnswerCount} cevap`, `${totalAnswerCount} answers`) : copy("Henüz cevap yok", "No answers yet")}</h2>{totalAnswerCount > 0 && <small>{hiddenAnswerCount > 0 ? copy(`${shownAnswerCount} gösteriliyor · ${hiddenAnswerCount} kilitli`, `${shownAnswerCount} shown · ${hiddenAnswerCount} locked`) : shownAnswerCount < totalAnswerCount ? copy(`${shownAnswerCount} gösteriliyor`, `${shownAnswerCount} shown`) : copy("Tüm cevaplar gösteriliyor", "All answers shown")}</small>}</div></div>
          {detail.answers.map((answer) => <article key={answer.id} className="community-answer">
            <header>{authorButton(answer, "answer")}<small>{formatQuestionDate(answer.createdAt, dateLocale)}</small></header>
            <p>{answer.body}</p>
          </article>)}
          {hiddenAnswerCount > 0 && <div className="empty-inline community-unlock-box"><Icon name="lock" size={18} /><div><strong>{copy(`${hiddenAnswerCount} cevap kilitli`, `${hiddenAnswerCount} answers locked`)}</strong><span>{copy("Ücretsiz hesabınla ülke kilidini açıp tüm deneyimleri okuyabilirsin.", "Use your free account to unlock this country and read every experience.")}</span><button type="button" className="secondary-wide" disabled={unlocking} onClick={() => user ? void unlockReplies() : onOpenAccount()}>{unlocking ? <span className="button-loader dark" /> : <Icon name={user ? "unlock" : "user"} size={17} />} {user ? (unlocking ? copy("Açılıyor", "Unlocking") : copy("Tüm cevapların kilidini aç", "Unlock all answers")) : copy("Giriş yap ve kilidi aç", "Sign in and unlock")}</button></div></div>}
          {!shownAnswerCount && !hiddenAnswerCount && <div className="empty-inline"><Icon name="info" size={18} /><div><strong>{copy("İlk cevabı sen yaz", "Write the first answer")}</strong><span>{copy("Deneyimini paylaşarak gezginlere yardım et.", "Share your experience to help travellers.")}</span></div></div>}
        </div>
        {user ? <div className="community-answer-form">
          <div className="community-answer-form-heading">
            <span><Icon name="users" size={18} /></span>
            <div><strong>{copy("Deneyimini paylaş", "Share your experience")}</strong><small>{copy("Kısa, açık ve kişisel bilgi içermeyen bir cevap yaz.", "Write a clear answer without personal information.")}</small></div>
          </div>
          <label htmlFor="community-answer-body"><span>{copy("Cevabın", "Your answer")}</span><textarea disabled={answerPosting} id="community-answer-body" value={answerBody} maxLength={4000} onChange={(event) => setAnswerBody(event.target.value)} placeholder={copy("Yaşadığın deneyimi ve faydalı ayrıntıları buraya yaz…", "Write your experience and useful details here…")} /></label>
          <div className="community-answer-form-meta"><small>{answerBody.trim().length < 3 ? copy("Göndermek için en az 3 karakter yaz.", "Write at least 3 characters to send.") : copy("Göndermeye hazır", "Ready to send")}</small><span>{answerRemaining}</span></div>
          <button type="button" className="primary-wide" disabled={answerPosting || answerBody.trim().length < 3} onClick={() => void submitAnswer()}>{answerPosting ? <span className="button-loader" /> : <Icon name="users" size={17} />} {answerPosting ? copy("Gönderiliyor", "Sending") : copy("Cevabı gönder", "Send answer")}</button>
        </div> : <button className="secondary-wide" onClick={onOpenAccount}><Icon name="user" size={17} /> {copy("Cevap yazmak için giriş yap", "Sign in to answer")}</button>}
      </div>}
    </Sheet>
    <CommunitySafetySheet target={safetyTarget} accessToken={accessToken} userId={user?.id || ""} onClose={() => setSafetyTarget(null)} onBlocked={onBlocked} onManageBlocks={() => { setSafetyTarget(null); setBlocksOpen(true); }} />
    {blocksOpen && <CommunityBlocksSheet key={user?.id} accessToken={accessToken} onClose={() => setBlocksOpen(false)} onChanged={() => { void loadFeed(); if (detail) void openDetail(detail.id); }} />}
    <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />
  </div>;
}
