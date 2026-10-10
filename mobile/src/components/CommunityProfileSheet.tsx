import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import type { CommunitySafetyTarget } from "../lib/community";
import {
  followCommunityProfile, getCommunityProfile, mergeProfileItems, profileItemKey, saveCommunityProfileBio,
  type CommunityProfile, type CommunityProfileItem, type CommunityProfilePage, type CommunityProfileSection,
} from "../lib/communityProfiles";
import { useI18n } from "../lib/i18n";
import { CommunityAvatar } from "./CommunityAvatar";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import "./community-profile.css";

type ProfileSheetProps = {
  profileKey: string | null;
  accessToken?: string | null;
  userId?: string | null;
  onClose: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenAccount: () => void;
  onEditProfile: () => void;
  onSafety?: (target: CommunitySafetyTarget) => void;
  onFollowChanged?: () => void;
  onProfileChanged?: () => void;
};

export function CommunityProfileSheet(props: ProfileSheetProps) {
  if (!props.profileKey) return null;
  // A changed account/root selection starts a fresh private UI session.
  return <ProfileNavigation key={`${props.profileKey}:${props.userId || "guest"}`} {...props} profileKey={props.profileKey} />;
}

function ProfileNavigation(props: ProfileSheetProps & { profileKey: string }) {
  const { copy } = useI18n();
  const [history, setHistory] = useState([props.profileKey]);
  const key = history.at(-1)!;
  return <Sheet open title={copy("Gezgin profili", "Traveller profile", "Profili i udhëtarit")} size="large" onClose={props.onClose}>
    <div className="community-profile">
      {history.length > 1 && <button className="community-profile-back" type="button" onClick={() => setHistory(value => value.slice(0, -1))}>
        <Icon name="back" size={18} />{copy("Önceki profil", "Previous profile", "Profili i mëparshëm")}
      </button>}
      <ProfileContent key={key} {...props} profileKey={key} onOpenProfile={next => { if (next !== key) setHistory(value => [...value, next]); }} />
    </div>
  </Sheet>;
}

type SectionState = Pick<CommunityProfilePage, "items" | "nextOffset">;

function ProfileContent({ profileKey, accessToken, userId, onOpenProfile, onOpenQuestion, onOpenAccount, onEditProfile, onSafety, onFollowChanged, onProfileChanged }: ProfileSheetProps & { profileKey: string; onOpenProfile: (key: string) => void }) {
  const { copy, dateLocale } = useI18n();
  const id = useId();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [section, setSection] = useState<CommunityProfileSection>("posts");
  const [pages, setPages] = useState<Partial<Record<CommunityProfileSection, SectionState>>>({});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<{ section: CommunityProfileSection; more: boolean; unavailable: boolean } | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [showAvatar, setShowAvatar] = useState(false);
  const [saved, setSaved] = useState(false);
  const alive = useRef(false);
  const pending = useRef(false);
  const mutations = useRef<AbortController | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const metadataRevision = useRef(0);
  const readGeneration = useRef(0);

  useEffect(() => {
    alive.current = true;
    mutations.current = new AbortController();
    return () => { alive.current = false; mutations.current?.abort(); moreRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("l2t:profile-photo", refresh);
    return () => window.removeEventListener("l2t:profile-photo", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const version = metadataRevision.current;
    ++readGeneration.current;
    moreRequest.current?.abort();
    moreRequest.current = null;
    setLoadingMore(false);
    setLoading(true);
    setFailure(null);
    void getCommunityProfile(profileKey, section, accessToken, 0, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      if (version === metadataRevision.current && !pending.current) setProfile(page.profile);
      setPages(previous => ({ ...previous, [section]: { items: page.items, nextOffset: page.nextOffset } }));
    }).catch(error => {
      if (!controller.signal.aborted) {
        const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
        if (unavailable) { setProfile(null); setPages({}); }
        setFailure({ section, more: false, unavailable });
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileKey, section, accessToken, revision]);

  const loadMore = async () => {
    const nextOffset = pages[section]?.nextOffset;
    if (nextOffset == null || loading || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const generation = readGeneration.current;
    setLoadingMore(true);
    setFailure(null);
    try {
      const page = await getCommunityProfile(profileKey, section, accessToken, nextOffset, controller.signal);
      if (!alive.current || controller.signal.aborted || generation !== readGeneration.current) return;
      setPages(previous => ({ ...previous, [section]: { items: mergeProfileItems(previous[section]?.items || [], page.items), nextOffset: page.nextOffset } }));
    } catch (error) {
      if (alive.current && !controller.signal.aborted && generation === readGeneration.current) {
        const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
        if (unavailable) { setProfile(null); setPages({}); }
        setFailure({ section, more: !unavailable, unavailable });
      }
    } finally {
      if (moreRequest.current === controller) { moreRequest.current = null; if (alive.current) setLoadingMore(false); }
    }
  };

  const follow = async () => {
    if (!profile || pending.current) return;
    if (!userId || !accessToken) { onOpenAccount(); return; }
    pending.current = true;
    ++metadataRevision.current;
    setBusy(true);
    setMutationError("");
    try {
      const result = await followCommunityProfile(profileKey, !profile.isFollowing, accessToken, mutations.current?.signal);
      if (!alive.current) return;
      setProfile(previous => previous ? { ...previous, isFollowing: result.isFollowing } : previous);
      onFollowChanged?.();
    } catch (error) {
      if (alive.current) {
        setMutationError(copy("Takip durumu güncellenemedi. Tekrar dene.", "Could not update follow status. Try again.", "Nuk u përditësua ndjekja. Provo sërish."));
        if (error instanceof ApiError && error.status === 401) onOpenAccount();
      }
    } finally {
      if (alive.current) { pending.current = false; ++metadataRevision.current; setBusy(false); setRevision(value => value + 1); }
    }
  };

  const saveBio = async () => {
    if (!profile?.isOwn || profile.userId !== userId || !accessToken || pending.current) return;
    pending.current = true;
    ++metadataRevision.current;
    setBusy(true);
    setMutationError("");
    try {
      const result = await saveCommunityProfileBio(profileKey, bio.trim(), showAvatar, accessToken, mutations.current?.signal);
      if (!alive.current) return;
      setProfile(previous => previous ? { ...previous, bio: result.bio, showAvatar: result.showAvatar, avatarUrl: result.showAvatar ? previous.avatarUrl : null } : previous);
      setEditing(false);
      setSaved(true);
      onProfileChanged?.();
    } catch (error) {
      if (alive.current) {
        setMutationError(copy("Profil kaydedilemedi. Yazdıkların burada duruyor; tekrar deneyebilirsin.", "Profile not saved. Your changes are still here; try again.", "Profili nuk u ruajt. Ndryshimet e tua janë këtu; provo sërish."));
        if (error instanceof ApiError && error.status === 401) onOpenAccount();
      }
    } finally {
      if (alive.current) { pending.current = false; ++metadataRevision.current; setBusy(false); setRevision(value => value + 1); }
    }
  };

  const ownProfile = !!profile?.isOwn && profile.userId === userId;
  const hasUnsavedEdits = !!profile && (bio.trim() !== profile.bio || showAvatar !== (profile.showAvatar === true));
  const page = pages[section];
  const title = section === "posts" ? copy("Paylaşımlar", "Posts", "Postimet") : section === "answers" ? copy("Cevaplar", "Answers", "Përgjigjet") : section === "followers" ? copy("Takipçiler", "Followers", "Ndjekësit") : copy("Takip edilenler", "Following", "Të ndjekurit");
  const empty = section === "posts" ? copy("Henüz bir paylaşım yok.", "No posts yet.", "Nuk ka ende postime.") : section === "answers" ? copy("Henüz bir cevap yok.", "No answers yet.", "Nuk ka ende përgjigje.") : section === "followers" ? copy("Henüz takipçi yok.", "No followers yet.", "Nuk ka ende ndjekës.") : copy("Henüz kimseyi takip etmiyor.", "Not following anyone yet.", "Nuk ndjek ende askënd.");
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  };
  const switchSection = (next: CommunityProfileSection) => { if (next !== section) setSection(next); };
  const tabs = ["posts", "answers"] as const;
  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
    switchSection(tabs[next]);
    document.getElementById(`${id}-${tabs[next]}`)?.focus();
  };

  return <>
    {profile && <>
      <div className="community-profile-hero">
        <div className="community-profile-identity">
          <CommunityAvatar username={profile.username} avatarUrl={profile.avatarUrl} size="large" />
          <div><span className="community-profile-eyebrow">{copy("GEZGİN PROFİLİ", "TRAVELLER PROFILE", "PROFILI I UDHËTARIT")}</span><h2>@{profile.username}</h2></div>
          {onSafety && profile.safetyTarget && !ownProfile && <button type="button" className="community-profile-options" onClick={() => onSafety(profile.safetyTarget!)} aria-label={copy("Kullanıcı seçenekleri", "User options", "Opsionet e përdoruesit")}><span aria-hidden="true">•••</span></button>}
        </div>
        {profile.bio && <p className="community-profile-bio">{profile.bio}</p>}
        <div className="community-profile-stats">
          <button type="button" aria-pressed={section === "followers"} onClick={() => switchSection("followers")}><strong>{profile.followerCount.toLocaleString(dateLocale)}</strong><span>{copy("Takipçi", "Followers", "Ndjekës")}</span></button>
          <button type="button" aria-pressed={section === "following"} onClick={() => switchSection("following")}><strong>{profile.followingCount.toLocaleString(dateLocale)}</strong><span>{copy("Takip edilen", "Following", "Të ndjekur")}</span></button>
          <div><strong>{(profile.postCount + profile.answerCount).toLocaleString(dateLocale)}</strong><span>{copy("Katkı", "Contributions", "Kontribute")}</span></div>
        </div>
        {ownProfile ? <button className="community-profile-edit" type="button" disabled={busy} aria-expanded={editing} onClick={() => { setEditing(value => !value); setBio(profile.bio); setShowAvatar(profile.showAvatar === true); setMutationError(""); setSaved(false); }}><Icon name="user" size={18} />{copy("Profili düzenle", "Edit profile", "Ndrysho profilin")}</button>
          : <button className={`community-profile-follow${profile.isFollowing ? " is-following" : ""}`} type="button" aria-pressed={profile.isFollowing} disabled={busy} onClick={() => void follow()}><Icon name={profile.isFollowing ? "check" : "plus"} size={18} />{busy ? copy("Güncelleniyor…", "Updating…", "Po përditësohet…") : profile.isFollowing ? copy("Takip ediliyor", "Following", "Po e ndjek") : copy("Takip et", "Follow", "Ndiq")}</button>}
      </div>
      {editing && ownProfile && <form className="community-profile-editor" onSubmit={event => { event.preventDefault(); void saveBio(); }}>
        <label htmlFor={`${id}-bio`}>{copy("Hakkımda", "About me", "Rreth meje")}</label>
        <textarea id={`${id}-bio`} value={bio} maxLength={300} rows={3} disabled={busy} onChange={event => setBio(event.target.value)} placeholder={copy("Seyahat tarzından ve sevdiğin yerlerden bahset…", "Share your travel style and favourite places…", "Trego stilin e udhëtimit dhe vendet e tua të preferuara…")} />
        <small>{bio.length}/300</small>
        <label className="community-profile-photo-choice"><input type="checkbox" checked={showAvatar} disabled={busy} onChange={event => setShowAvatar(event.target.checked)} /><span>{copy("Profil fotoğrafımı toplulukta göster", "Show my profile photo in the community", "Shfaq foton time të profilit në komunitet")}</span></label>
        <button type="button" className="community-profile-photo-edit" disabled={busy || hasUnsavedEdits} aria-describedby={hasUnsavedEdits ? `${id}-photo-hint` : undefined} onClick={onEditProfile}><Icon name="camera" size={18} />{copy("Profil fotoğrafını değiştir", "Change profile photo", "Ndrysho foton e profilit")}</button>
        {hasUnsavedEdits && <p id={`${id}-photo-hint`} className="community-profile-editor-hint">{copy("Fotoğraf ekranına geçmeden önce değişikliklerini kaydet veya vazgeç.", "Save or cancel your changes before opening the photo editor.", "Ruaj ose anulo ndryshimet para se të hapësh redaktuesin e fotos.")}</p>}
        <div className="community-profile-editor-actions"><button type="submit" disabled={busy}>{busy ? copy("Kaydediliyor…", "Saving…", "Po ruhet…") : copy("Kaydet", "Save", "Ruaj")}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setMutationError(""); }}>{copy("Vazgeç", "Cancel", "Anulo")}</button></div>
      </form>}
      {saved && <p className="community-profile-notice" role="status">{copy("Profilin güncellendi.", "Your profile was updated.", "Profili yt u përditësua.")}</p>}
      {mutationError && <p className="community-profile-error" role="alert">{mutationError}</p>}
      <div className="community-profile-tabs" role="tablist" aria-label={copy("Profil içeriği", "Profile content", "Përmbajtja e profilit")}>
        {tabs.map((tab, index) => <button id={`${id}-${tab}`} key={tab} type="button" role="tab" aria-selected={section === tab} aria-controls={`${id}-content`} tabIndex={section === tab || (index === 0 && !tabs.some(value => value === section)) ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => switchSection(tab)}>{tab === "posts" ? copy("Paylaşımlar", "Posts", "Postimet") : copy("Cevaplar", "Answers", "Përgjigjet")}<span>{tab === "posts" ? profile.postCount : profile.answerCount}</span></button>)}
      </div>
    </>}
    <section id={`${id}-content`} className="community-profile-content" aria-label={title} role={section === "posts" || section === "answers" ? "tabpanel" : "region"} aria-labelledby={section === "posts" || section === "answers" ? `${id}-${section}` : undefined} aria-busy={loading || loadingMore}>
      {profile && (section === "followers" || section === "following") && <h3>{title}</h3>}
      {loading && !page && <div className="community-profile-empty" role="status"><Icon name="user" size={28} /><p>{copy("Profil yükleniyor…", "Loading profile…", "Po ngarkohet profili…")}</p></div>}
      {!loading && !failure && page?.items.length === 0 && <div className="community-profile-empty"><Icon name={section === "followers" || section === "following" ? "users" : "message"} size={28} /><p>{empty}</p></div>}
      <div className="community-profile-items">{page?.items.map((item: CommunityProfileItem) => "key" in item
        ? <button type="button" className="community-profile-person" key={profileItemKey(item)} onClick={() => onOpenProfile(item.key)}><CommunityAvatar username={item.username} avatarUrl={item.avatarUrl} size="medium" /><strong>@{item.username}</strong><Icon name="chevron" size={18} /></button>
        : <button type="button" className="community-profile-post" key={profileItemKey(item)} onClick={() => onOpenQuestion("questionId" in item ? item.questionId : item.id)}>
          <span className="community-profile-post-meta"><Icon name={"questionId" in item ? "message" : "book"} size={16} /><time dateTime={item.createdAt}>{date(item.createdAt)}</time></span>
          <strong>{"questionTitle" in item ? item.questionTitle : item.title}</strong><p>{item.body}</p><span className="community-profile-post-cta">{copy("Sohbeti aç", "Open discussion", "Hap bisedën")}<Icon name="chevron" size={16} /></span>
        </button>)}</div>
      {failure?.section === section && <div className="community-profile-error" role="alert"><p>{failure.unavailable ? copy("Bu profil şu anda görüntülenemiyor.", "This profile is currently unavailable.", "Ky profil nuk është i disponueshëm tani.") : copy("Bağlantı kurulamadı. Tekrar deneyebilirsin.", "Could not connect. You can try again.", "Nuk u krijua lidhja. Mund të provosh sërish.")}</p><button type="button" disabled={loading || loadingMore} onClick={() => failure.more ? void loadMore() : setRevision(value => value + 1)}><Icon name="refresh" size={17} />{copy("Tekrar dene", "Try again", "Provo sërish")}</button></div>}
      {page?.nextOffset != null && !failure?.more && <button className="community-profile-more" type="button" disabled={loading || loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy("Yükleniyor…", "Loading…", "Po ngarkohet…") : copy("Daha fazla göster", "Show more", "Shfaq më shumë")}</button>}
    </section>
  </>;
}
