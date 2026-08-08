import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { requestJson } from "../lib/api";
import type { AuthUser } from "../types";

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
    level: text(item.level, 80) || "Seviye belirtilmedi",
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

function formatQuestionDate(value: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
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
  const [tab, setTab] = useState<"feed" | "league">("feed");
  const [leaders, setLeaders] = useState<CommunityLeader[]>([]);
  const [loading, setLoading] = useState(true);
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
  const requestGeneration = useRef(0);
  const feedGeneration = useRef(0);
  const currentUsername = useMemo(() => userName(user).toLocaleLowerCase("tr-TR"), [user]);

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
        setError("Kaşifler Ligi şu anda yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, []);

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
        setFeedError("Topluluk akışı şu anda yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      }
    } finally {
      if (generation === feedGeneration.current) setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadFeed();
    return () => {
      requestGeneration.current += 1;
      feedGeneration.current += 1;
    };
  }, [load, loadFeed]);

  const submitQuestion = async () => {
    if (!user || !accessToken) return onOpenAccount();
    if (!/^[A-Z]{2}$/.test(countryCode)) return onNotice("Ülke kodunu iki harf olarak yaz. Örneğin IT.");
    if (questionTitle.trim().length < 5) return onNotice("Başlık en az 5 karakter olmalı.");
    if (questionBody.trim().length < 10) return onNotice("Açıklama en az 10 karakter olmalı.");
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
      onNotice(result.moderation?.action === "visible" ? "Sorun toplulukta yayınlandı." : "Sorun incelemeye alındı.");
    } catch (requestError) {
      onNotice(requestError instanceof Error ? requestError.message : "Soru gönderilemedi.");
    } finally {
      setPosting(false);
    }
  };

  return <div className="screen community-native-screen">
    <section className="page-intro compact-intro community-native-intro">
      <span className="page-icon"><Icon name="users" size={27} /></span>
      <div><small>KAŞİFLER LİGİ</small><h1>Gerçek gezginlerden ilham al</h1><p>Katılmayı seçen kaşiflerin seyahat ilerlemesini ve lig seviyelerini keşfet.</p></div>
    </section>

    <div className="segmented community-tabs">
      <button className={tab === "feed" ? "active" : ""} onClick={() => setTab("feed")}><Icon name="compass" size={16} /> Gezgin Akışı</button>
      <button className={tab === "league" ? "active" : ""} onClick={() => setTab("league")}><Icon name="users" size={16} /> Lig</button>
    </div>

    {tab === "league" && <><section className="community-native-summary">
      <div><span><Icon name="globe" size={20} /></span><strong>{leaders.length}</strong><small>Lig katılımcısı</small></div>
      <button className="secondary-button" disabled={loading} onClick={() => void load()}>
        {loading ? <span className="button-loader dark" /> : <Icon name="refresh" size={17} />} Yenile
      </button>
    </section>

    {!user && <section className="community-account-nudge">
      <span><Icon name="user" size={23} /></span>
      <div><strong>Kendi kaşif alanını oluştur</strong><p>Ziyaretlerini aynı hesapta saklamak ve lig tercihini yönetmek için giriş yap.</p></div>
      <button onClick={onOpenAccount}><Icon name="chevron" size={18} /></button>
    </section>}

    {error && <div className="info-box error community-native-error" role="alert">
      <Icon name="alert" size={20} /><p>{error}</p><button disabled={loading} onClick={() => void load()}>Tekrar dene</button>
    </div>}

    {loading && !loaded ? <div className="skeleton-list community-native-loading" aria-label="Kaşifler Ligi yükleniyor"><div /><div /><div /></div>
      : !error && !leaders.length ? <div className="empty-state community-native-empty">
        <span><Icon name="users" size={30} /></span><strong>Lig henüz sessiz</strong><p>Görünür olmayı seçen ilk kaşifler burada listelenecek.</p>
      </div>
      : leaders.length > 0 && <div className="community-leader-list" aria-live="polite">
        {leaders.map((leader, index) => {
          const isCurrentUser = Boolean(currentUsername) && leader.username.toLocaleLowerCase("tr-TR") === currentUsername;
          return <article className={`community-leader-card${isCurrentUser ? " current-user" : ""}`} key={`${leader.username}-${index}`}>
            <span className={`community-rank rank-${Math.min(index + 1, 4)}`}>{index + 1}</span>
            <span className="community-avatar" aria-hidden="true">{initials(leader.username)}</span>
            <div className="community-leader-identity">
              <div><strong>@{leader.username}</strong>{isCurrentUser && <em>Sen</em>}</div>
              <small>{leader.level}</small>
              {leader.verified && <span className="community-verified"><Icon name="shield" size={14} /> Doğrulanmış gezgin</span>}
            </div>
            <div className="community-leader-stats">
              <span><strong>{leader.visitedCount}</strong><small>ülke</small></span>
              <span><strong>{leader.points}</strong><small>puan</small></span>
            </div>
          </article>;
        })}
      </div>}

    <div className="info-box community-privacy-note"><Icon name="shield" size={20} /><p>Lig yalnızca katılmayı seçen kullanıcıları ve API tarafından yayınlanan güvenli özet alanlarını gösterir.</p></div></>}

    {tab === "feed" && <section className="community-feed">
      <div className="community-feed-toolbar"><div><small>ÜLKE TOPLULUKLARI</small><h2>Gezginlerin soruları</h2></div><button onClick={() => user ? setQuestionOpen((open) => !open) : onOpenAccount()}><Icon name={questionOpen ? "close" : "plus"} size={17} /> {questionOpen ? "Kapat" : "Soru sor"}</button></div>
      {questionOpen && <div className="form-card community-question-form">
        <div className="form-grid two"><label>Ülke kodu<input value={countryCode} maxLength={2} autoCapitalize="characters" onChange={(event) => setCountryCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="IT" /></label><label>Kategori<select value="general" disabled><option value="general">Genel</option></select></label></div>
        <label>Başlık<input value={questionTitle} maxLength={160} onChange={(event) => setQuestionTitle(event.target.value)} placeholder="Gezginlere ne sormak istiyorsun?" /></label>
        <label>Açıklama<textarea value={questionBody} maxLength={4000} onChange={(event) => setQuestionBody(event.target.value)} placeholder="Sorunu anlaşılır biçimde anlat…" /></label>
        <button className="primary-wide" disabled={posting} onClick={() => void submitQuestion()}>{posting ? <span className="button-loader" /> : <Icon name="users" size={18} />} {posting ? "Gönderiliyor" : "Topluluğa gönder"}</button>
      </div>}
      {feedError && <div className="info-box error community-native-error" role="alert"><Icon name="alert" size={20} /><p>{feedError}</p><button disabled={feedLoading} onClick={() => void loadFeed()}>Tekrar dene</button></div>}
      {feedLoading ? <div className="skeleton-list community-native-loading"><div /><div /><div /></div>
        : questions.length ? <div className="community-question-list">{questions.map((question) => <article key={question.id}>
          <header><span>{question.countryCode}</span><div><strong>@{question.username}</strong><small>{formatQuestionDate(question.createdAt)}</small></div><em>{question.answerCount} yanıt</em></header>
          <h3>{question.title}</h3><p>{question.body}</p>
        </article>)}</div>
        : !feedError && <div className="empty-state"><span><Icon name="users" size={28} /></span><strong>Henüz görünür soru yok</strong><p>İlk soruyu sorarak ülke topluluğunu başlatabilirsin.</p></div>}
    </section>}
  </div>;
}
