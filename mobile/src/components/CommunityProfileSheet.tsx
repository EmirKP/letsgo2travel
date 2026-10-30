import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import type { CommunitySafetyTarget } from "../lib/community";
import {
  followCommunityProfile, getCommunityProfile, mergeProfileItems, profileItemKey, saveCommunityProfileBio,
  type CommunityProfile, type CommunityProfileItem, type CommunityProfilePage, type CommunityProfileSection,
} from "../lib/communityProfiles";
import { useI18n } from "../lib/i18n";
import { formatAppDate } from "../lib/localeFormatting";
import { CommunityAvatar } from "./CommunityAvatar";
import { CommunityBlocksSheet, CommunitySafetySheet } from "./CommunitySafetySheet";
import { OfficialBadge } from "./OfficialBadge";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { SocialGallery } from "./SocialHub";
import { SocialComposer } from "./SocialComposer";
import { ForumTranslation } from "./ForumTranslation";
import { CommunityPostPhoto } from "./CommunityPostPhoto";
import type { SocialPlace } from "../lib/social";
import "./community-profile.css";

type ProfileSheetProps = {
  profileKey: string | null;
  accessToken?: string | null;
  userId?: string | null;
  onClose: () => void;
  onOpenQuestion: (id: string) => void;
  onOpenAccount: () => void;
  onEditProfile: () => void;
  identityFullName?: string;
  identityNeedsCompletion?: boolean;
  onSaveIdentity?: (fullName: string, username: string) => Promise<void>;
  editRequest?: number;
  onEditRequestHandled?: () => void;
  onEditingChange?: (editing: boolean) => void;
  onSafety?: (target: CommunitySafetyTarget) => void;
  onFollowChanged?: () => void;
  onProfileChanged?: () => void;
  onAddPlace?: (place: SocialPlace) => void;
  onBlocked?: (userId: string) => void;
};

export function CommunityProfileSheet(props: ProfileSheetProps) {
  if (!props.profileKey) return null;
  // A changed account/root selection starts a fresh private UI session.
  return <ProfileNavigation key={`${props.profileKey}:${props.userId || "guest"}`} {...props} profileKey={props.profileKey} />;
}

type InlineProfileProps = Omit<ProfileSheetProps, "onClose" | "profileKey"> & { profileKey: string; revision?: number };

export function CommunityProfileInline(props: InlineProfileProps) {
  return <InlineProfileNavigation key={`${props.profileKey}:${props.userId || "guest"}`} {...props} />;
}

function InlineProfileNavigation(props: InlineProfileProps) {
  const [openedProfile, setOpenedProfile] = useState<string | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<CommunitySafetyTarget | null>(null);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => { setRevision(value => value + 1); props.onFollowChanged?.(); };
  const blocked = (id: string) => { setSafetyTarget(null); setOpenedProfile(null); refresh(); props.onBlocked?.(id); };
  return <div className="community-profile profile-community-inline">
    <ProfileContent key={props.profileKey} {...props} inline externalRevision={revision + (props.revision || 0)} onClose={() => {}} onOpenProfile={key => { if (key !== props.profileKey) setOpenedProfile(key); }} onBlocked={blocked} />
    {openedProfile && <CommunityProfileSheet {...props} profileKey={openedProfile} onClose={() => setOpenedProfile(null)} onOpenQuestion={id => { setOpenedProfile(null); props.onOpenQuestion(id); }} onFollowChanged={refresh} onBlocked={blocked} onSafety={target => props.userId && props.accessToken ? setSafetyTarget(target) : props.onOpenAccount()} />}
    {safetyTarget && props.userId && props.accessToken && <CommunitySafetySheet target={safetyTarget} userId={props.userId} accessToken={props.accessToken} onClose={() => setSafetyTarget(null)} onBlocked={blocked} onManageBlocks={() => { setSafetyTarget(null); setOpenedProfile(null); setBlocksOpen(true); }} />}
    {blocksOpen && props.accessToken && <CommunityBlocksSheet accessToken={props.accessToken} onClose={() => setBlocksOpen(false)} onChanged={refresh} />}
  </div>;
}

function ProfileNavigation(props: ProfileSheetProps & { profileKey: string }) {
  const { copy } = useI18n();
  const [history, setHistory] = useState([props.profileKey]);
  const key = history.at(-1)!;
  return <Sheet open title={copy("Gezgin profili", "Traveller profile", "Profili i udhëtarit")} size="large" className="community-profile-sheet" onClose={props.onClose}>
    <div className="community-profile">
      {history.length > 1 && <button className="community-profile-back" type="button" onClick={() => setHistory(value => value.slice(0, -1))}>
        <Icon name="back" size={18} />{copy("Önceki profil", "Previous profile", "Profili i mëparshëm")}
      </button>}
      <ProfileContent key={key} {...props} profileKey={key} onOpenProfile={next => { if (next !== key) setHistory(value => [...value, next]); }} />
    </div>
  </Sheet>;
}

type SectionState = Pick<CommunityProfilePage, "items" | "nextOffset">;

function ProfileContent({ profileKey, accessToken, userId, onOpenProfile, onOpenQuestion, onOpenAccount, onEditProfile, identityFullName = "", identityNeedsCompletion = false, onSaveIdentity, editRequest = 0, onEditRequestHandled, onEditingChange, onSafety, onFollowChanged, onProfileChanged, onAddPlace, onBlocked, inline = false, externalRevision = 0 }: ProfileSheetProps & { profileKey: string; onOpenProfile: (key: string) => void; inline?: boolean; externalRevision?: number }) {
  const { copy, dateLocale } = useI18n();
  const id = useId();
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [section, setSection] = useState<CommunityProfileSection>("posts");
  const [gallery, setGallery] = useState(true);
  const [compose, setCompose] = useState(false);
  const [socialRevision, setSocialRevision] = useState(0);
  const [pages, setPages] = useState<Partial<Record<CommunityProfileSection, SectionState>>>({});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<{ section: CommunityProfileSection; more: boolean; unavailable: boolean; missing?: boolean } | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [bio, setBio] = useState("");
  const [fullName, setFullName] = useState(identityFullName);
  const [username, setUsername] = useState("");
  const [showAvatar, setShowAvatar] = useState(false);
  const [saved, setSaved] = useState(false);
  const alive = useRef(false);
  const pending = useRef(false);
  const mutations = useRef<AbortController | null>(null);
  const moreRequest = useRef<AbortController | null>(null);
  const metadataRevision = useRef(0);
  const readGeneration = useRef(0);
  const handledEditRequest = useRef(0);
  const missingOwnProfile = Boolean(recovering && !profile && userId && accessToken && profileKey === `user:${userId}` && onSaveIdentity);
  const editorActive = editing || editRequest > 0 || missingOwnProfile;
  useEffect(() => {
    onEditingChange?.(editorActive);
    return () => onEditingChange?.(false);
  }, [editorActive, onEditingChange]);

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
      if (version === metadataRevision.current && !pending.current) { setProfile(page.profile); setRecovering(false); }
      setPages(previous => ({ ...previous, [section]: { items: page.items, nextOffset: page.nextOffset } }));
    }).catch(error => {
      if (!controller.signal.aborted) {
        const unavailable = error instanceof ApiError && [403, 404].includes(error.status);
        if (unavailable) { setProfile(null); setPages({}); }
        if (unavailable) setRecovering(error.status === 404);
        setFailure({ section, more: false, unavailable, missing: error instanceof ApiError && error.status === 404 });
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [profileKey, section, accessToken, revision, externalRevision]);

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
    const normalizedName = fullName.replace(/\s+/g, " ").trim();
    const normalizedUsername = username.trim().toLowerCase();
    if (onSaveIdentity && (normalizedName.length < 2 || normalizedName.length > 100)) {
      setMutationError(copy("Ad soyad 2–100 karakter arasında olmalı.", "Full name must be between 2 and 100 characters.", "Emri i plotë duhet të ketë nga 2 deri në 100 karaktere."));
      return;
    }
    if (onSaveIdentity && !/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      setMutationError(copy("Kullanıcı adı 3–20 karakter olmalı; küçük harf, rakam ve alt çizgi kullan.", "Username must be 3–20 characters; use lowercase letters, numbers and underscores.", "Emri i përdoruesit duhet të ketë 3–20 karaktere; përdor shkronja të vogla, numra dhe nënviza."));
      return;
    }
    pending.current = true;
    ++metadataRevision.current;
    setBusy(true);
    setMutationError("");
    let identityCommitted = false;
    try {
      if (onSaveIdentity && (identityNeedsCompletion || normalizedName !== identityFullName.replace(/\s+/g, " ").trim() || normalizedUsername !== profile.username)) {
        await onSaveIdentity(normalizedName, normalizedUsername);
        if (!alive.current) return;
        identityCommitted = true;
        setProfile(previous => previous ? { ...previous, username: normalizedUsername } : previous);
      }
      const result = await saveCommunityProfileBio(profileKey, bio.trim(), showAvatar, accessToken, mutations.current?.signal);
      if (!alive.current) return;
      setProfile(previous => previous ? { ...previous, bio: result.bio, showAvatar: result.showAvatar, avatarUrl: result.showAvatar ? previous.avatarUrl : null } : previous);
      setEditing(false);
      setSaved(true);
      onProfileChanged?.();
    } catch (error) {
      if (alive.current) {
        setMutationError(identityCommitted
          ? copy("Adın ve kullanıcı adın kaydedildi. Diğer değişiklikler tamamlanamadı; yazdıkların burada duruyor, tekrar deneyebilirsin.", "Your name and username were saved. The other changes could not be completed; your draft is still here, so you can retry.", "Emri dhe emri i përdoruesit u ruajtën. Ndryshimet e tjera nuk përfunduan; shkrimi yt është këtu, mund të provosh sërish.")
          : onSaveIdentity && error instanceof Error && !(error instanceof ApiError) ? error.message
          : copy("Profil kaydedilemedi. Yazdıkların burada duruyor; tekrar deneyebilirsin.", "Profile not saved. Your changes are still here; try again.", "Profili nuk u ruajt. Ndryshimet e tua janë këtu; provo sërish."));
        if (error instanceof ApiError && error.status === 401) onOpenAccount();
      }
    } finally {
      if (alive.current) { pending.current = false; ++metadataRevision.current; setBusy(false); setRevision(value => value + 1); }
    }
  };

  const completeMissingProfile = async () => {
    if (!missingOwnProfile || !onSaveIdentity || pending.current) return;
    const name = fullName.replace(/\s+/g, ' ').trim(), handle = username.trim().toLowerCase();
    if (name.length < 2 || name.length > 100 || !/^[a-z0-9_]{3,20}$/.test(handle)) {
      setMutationError(copy('Adını ve kullanıcı adını kontrol et. Kullanıcı adı 3–20 küçük harf, rakam veya alt çizgi içermeli.', 'Check your name and username. Use 3–20 lowercase letters, numbers or underscores for your username.', 'Kontrollo emrin dhe emrin e përdoruesit. Përdor 3–20 shkronja të vogla, numra ose nënviza.'));
      return;
    }
    pending.current = true; setBusy(true); setMutationError('');
    try {
      await onSaveIdentity(name, handle);
      if (!alive.current) return;
      handledEditRequest.current = editRequest; onEditRequestHandled?.();
      setRecovering(false); onEditingChange?.(false);
      setEditing(false); setRevision(value => value + 1); onProfileChanged?.();
    } catch (error) {
      if (alive.current) setMutationError(error instanceof Error ? error.message : copy('Profil tamamlanamadı. Yazdıkların korunuyor; tekrar dene.', 'Could not complete your profile. Your draft is kept; try again.', 'Profili nuk u plotësua. Shkrimi ruhet; provo sërish.'));
    } finally { if (alive.current) { pending.current = false; setBusy(false); } }
  };

  const ownProfile = !!profile?.isOwn && profile.userId === userId;
  const hasUnsavedEdits = !!profile && (bio.trim() !== profile.bio || showAvatar !== (profile.showAvatar === true) || !!onSaveIdentity && (fullName.replace(/\s+/g, " ").trim() !== identityFullName.replace(/\s+/g, " ").trim() || username.trim().toLowerCase() !== profile.username));
  const photoNeedsSave = !inline && hasUnsavedEdits;
  useEffect(() => {
    if (!editRequest) { handledEditRequest.current = 0; return; }
    if (!ownProfile || !profile || handledEditRequest.current === editRequest) return;
    handledEditRequest.current = editRequest;
    setFullName(identityFullName);
    setUsername(profile.username);
    setBio(profile.bio);
    setShowAvatar(profile.showAvatar === true);
    setMutationError("");
    setSaved(false);
    setEditing(true);
    onEditRequestHandled?.();
  }, [editRequest, ownProfile, profile, identityFullName, onEditRequestHandled]);
  const page = pages[section];
  const title = gallery ? copy("Gönderiler", "Posts", "Postimet") : section === "posts" ? copy("Forum", "Forum", "Forumi") : section === "answers" ? copy("Cevaplar", "Answers", "Përgjigjet") : section === "followers" ? copy("Takipçiler", "Followers", "Ndjekësit") : copy("Takip edilenler", "Following", "Të ndjekurit");
  const empty = section === "posts" ? copy("Henüz bir paylaşım yok.", "No posts yet.", "Nuk ka ende postime.") : section === "answers" ? copy("Henüz bir cevap yok.", "No answers yet.", "Nuk ka ende përgjigje.") : section === "followers" ? copy("Henüz takipçi yok.", "No followers yet.", "Nuk ka ende ndjekës.") : copy("Henüz kimseyi takip etmiyor.", "Not following anyone yet.", "Nuk ndjek ende askënd.");
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : formatAppDate(parsed, dateLocale, { day: "numeric", month: "short", year: "numeric" });
  };
  const switchSection = (next: CommunityProfileSection | "gallery") => { setGallery(next === "gallery"); if (next !== "gallery" && next !== section) setSection(next); };
  const tabs = ["gallery", "posts", "answers"] as const;
  const activeSection = gallery ? "gallery" : section;
  const moveTab = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    switchSection(tabs[next]);
    document.getElementById(`${id}-${tabs[next]}`)?.focus();
  };

  return <>
    {missingOwnProfile && <form className="community-profile-editor community-profile-recovery" onSubmit={event => { event.preventDefault(); void completeMissingProfile(); }}>
      <h3>{copy('Profilini tamamla', 'Complete your profile', 'Plotëso profilin')}</h3>
      <p>{copy('Hesabın açık. Topluluk profilini oluşturmak için adını ve kullanıcı adını tamamla; ardından kaldığın yerden devam edebilirsin.', 'You are signed in. Complete your name and username to create your community profile and continue.', 'Je i identifikuar. Plotëso emrin dhe emrin e përdoruesit për profilin e komunitetit dhe vazhdo.')}</p>
      <label>{copy('Ad soyad', 'Full name', 'Emri i plotë')}<input name="recovery-full-name" autoComplete="name" maxLength={100} value={fullName} disabled={busy} onChange={event => setFullName(event.target.value)}/></label>
      <label>{copy('Kullanıcı adı', 'Username', 'Emri i përdoruesit')}<input name="recovery-username" autoComplete="username" autoCapitalize="none" maxLength={20} value={username} disabled={busy} onChange={event => setUsername(event.target.value.toLowerCase())}/></label>
      {mutationError && <p role="alert">{mutationError}</p>}
      <button className="primary-wide" type="submit" disabled={busy}>{busy ? copy('Kaydediliyor…', 'Saving…', 'Po ruhet…') : copy('Profili tamamla', 'Complete profile', 'Plotëso profilin')}</button>
      <button type="button" disabled={busy} onClick={() => { setRecovering(false); handledEditRequest.current = editRequest; onEditRequestHandled?.(); setMutationError(''); onEditingChange?.(false); }}>{copy('Vazgeç', 'Cancel', 'Anulo')}</button>
    </form>}
    {profile && <>
      <div className="community-profile-hero">
        <div className="community-profile-overview">
          {inline ? <div className="profile-community-name"><strong>@{profile.username}<OfficialBadge isOfficial={profile.isOfficial} /></strong></div> : <div className="community-profile-identity">
            <div className="community-profile-avatar-scene">
              <span className="community-profile-postcard" aria-hidden="true" />
              <CommunityAvatar username={profile.username} avatarUrl={profile.avatarUrl} size="large" />
            </div>
            <h2><span>@</span>{profile.username}<OfficialBadge isOfficial={profile.isOfficial} /></h2>
            <p className="community-profile-role">{profile.isOfficial ? copy("Resmî uygulama hesabı", "Official application account", "Llogaria zyrtare e aplikacionit") : copy("Gezgin", "Traveller", "Udhëtar")}</p>
          </div>}
          <div className="community-profile-stats">
            <button type="button" aria-pressed={!gallery && section === "followers"} onClick={() => switchSection("followers")}><strong>{profile.followerCount.toLocaleString(dateLocale)}</strong><span>{copy("Takipçi", "Followers", "Ndjekës")}</span></button>
            <button type="button" aria-pressed={!gallery && section === "following"} onClick={() => switchSection("following")}><strong>{profile.followingCount.toLocaleString(dateLocale)}</strong><span>{copy("Takip edilen", "Following", "Të ndjekur")}</span></button>
            <div><strong>{(profile.postCount + profile.answerCount).toLocaleString(dateLocale)}</strong><span>{copy("Forum katkısı", "Forum contributions", "Kontribute në forum")}</span></div>
          </div>
          {profile.bio && <p className="community-profile-bio">{profile.bio}</p>}
        </div>
        <div className="community-profile-actions">
          {ownProfile ? <button className="community-profile-edit" type="button" disabled={busy} aria-expanded={editing} onClick={() => { setEditing(value => !value); setFullName(identityFullName); setUsername(profile.username); setBio(profile.bio); setShowAvatar(profile.showAvatar === true); setMutationError(""); setSaved(false); }}><Icon name="user" size={18} />{copy("Profili düzenle", "Edit profile", "Ndrysho profilin")}</button>
            : <button className={`community-profile-follow${profile.isFollowing ? " is-following" : ""}`} type="button" aria-pressed={profile.isFollowing} disabled={busy} onClick={() => void follow()}><Icon name={profile.isFollowing ? "check" : "plus"} size={18} />{busy ? copy("Güncelleniyor…", "Updating…", "Po përditësohet…") : profile.isFollowing ? copy("Takip ediliyor", "Following", "Po e ndjek") : copy("Takip et", "Follow", "Ndiq")}</button>}
          {onSafety && profile.safetyTarget && !ownProfile && <button type="button" className="community-profile-options" onClick={() => onSafety(profile.safetyTarget!)} aria-label={copy("Kullanıcı seçenekleri", "User options", "Opsionet e përdoruesit")}><span aria-hidden="true">•••</span></button>}
        </div>
      </div>
      {ownProfile && <button type="button" className="primary-wide community-profile-share" onClick={() => setCompose(true)}><Icon name="camera" size={20}/>{copy("Gönderi paylaş", "Share a post", "Ndaj një postim")}</button>}
      {editing && ownProfile && <form className="community-profile-editor" onSubmit={event => { event.preventDefault(); void saveBio(); }}>
        {onSaveIdentity && <>
          <label htmlFor={`${id}-full-name`}>{copy("Ad soyad", "Full name", "Emri i plotë")}</label>
          <input id={`${id}-full-name`} type="text" value={fullName} minLength={2} maxLength={100} autoComplete="name" disabled={busy} onChange={event => setFullName(event.target.value)}/>
          <label htmlFor={`${id}-username`}>{copy("Kullanıcı adı", "Username", "Emri i përdoruesit")}</label>
          <input id={`${id}-username`} type="text" value={username} minLength={3} maxLength={20} autoCapitalize="none" autoComplete="username" spellCheck={false} disabled={busy} onChange={event => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}/>
        </>}
        <label htmlFor={`${id}-bio`}>{copy("Hakkımda", "About me", "Rreth meje")}</label>
        <textarea id={`${id}-bio`} value={bio} maxLength={300} rows={3} disabled={busy} onChange={event => setBio(event.target.value)} placeholder={copy("Seyahat tarzından ve sevdiğin yerlerden bahset…", "Share your travel style and favourite places…", "Trego stilin e udhëtimit dhe vendet e tua të preferuara…")} />
        <small>{bio.length}/300</small>
        <label className="community-profile-photo-choice"><input type="checkbox" checked={showAvatar} disabled={busy} onChange={event => setShowAvatar(event.target.checked)} /><span>{copy("Profil fotoğrafımı toplulukta göster", "Show my profile photo in the community", "Shfaq foton time të profilit në komunitet")}</span></label>
        <button type="button" className="community-profile-photo-edit" disabled={busy || photoNeedsSave} aria-describedby={photoNeedsSave ? `${id}-photo-hint` : undefined} onClick={onEditProfile}><Icon name="camera" size={18} />{copy("Profil fotoğrafını değiştir", "Change profile photo", "Ndrysho foton e profilit")}</button>
        {photoNeedsSave && <p id={`${id}-photo-hint`} className="community-profile-editor-hint">{copy("Fotoğraf ekranına geçmeden önce değişikliklerini kaydet veya vazgeç.", "Save or cancel your changes before opening the photo editor.", "Ruaj ose anulo ndryshimet para se të hapësh redaktuesin e fotos.")}</p>}
        <div className="community-profile-editor-actions"><button type="submit" disabled={busy}>{busy ? copy("Kaydediliyor…", "Saving…", "Po ruhet…") : copy("Kaydet", "Save", "Ruaj")}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setMutationError(""); }}>{copy("Vazgeç", "Cancel", "Anulo")}</button></div>
      </form>}
      {saved && <p className="community-profile-notice" role="status">{copy("Profilin güncellendi.", "Your profile was updated.", "Profili yt u përditësua.")}</p>}
      {mutationError && <p className="community-profile-error" role="alert">{mutationError}</p>}
      <div className="community-profile-tabs community-profile-social-tabs" role="tablist" aria-label={copy("Profil içeriği", "Profile content", "Përmbajtja e profilit")}>
        {tabs.map((tab, index) => <button id={`${id}-${tab}`} key={tab} type="button" role="tab" aria-selected={activeSection === tab} aria-controls={`${id}-content`} tabIndex={activeSection === tab || (index === 0 && !tabs.some(value => value === activeSection)) ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => switchSection(tab)}>{tab === "gallery" ? copy("Gönderiler", "Posts", "Postimet") : tab === "posts" ? copy("Forum", "Forum", "Forumi") : copy("Cevaplar", "Answers", "Përgjigjet")}{tab !== "gallery" && <span>{tab === "posts" ? profile.postCount : profile.answerCount}</span>}</button>)}
      </div>
    </>}
    {gallery && profile ? <section id={`${id}-content`} className="community-profile-content" role="tabpanel" aria-labelledby={`${id}-gallery`}><SocialGallery authorRef={profileKey} accessToken={accessToken} userId={userId} onOpenAccount={onOpenAccount} onOpenProfile={onOpenProfile} onAddPlace={onAddPlace} onBlocked={onBlocked} revision={socialRevision + revision + externalRevision}/></section> : <section id={`${id}-content`} className="community-profile-content" aria-label={title} role={section === "posts" || section === "answers" ? "tabpanel" : "region"} aria-labelledby={section === "posts" || section === "answers" ? `${id}-${section}` : undefined} aria-busy={loading || loadingMore}>
      {profile && (section === "followers" || section === "following") && <h3>{title}</h3>}
      {loading && !page && <div className="community-profile-empty" role="status"><Icon name="user" size={28} /><p>{copy("Profil yükleniyor…", "Loading profile…", "Po ngarkohet profili…")}</p></div>}
      {!loading && !failure && page?.items.length === 0 && (section === "posts" ? <div className="community-profile-empty community-profile-empty-posts">
        <svg className="community-profile-empty-art" viewBox="0 0 100 90" fill="none" aria-hidden="true" focusable="false">
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <g transform="rotate(9 65 49)"><rect x="40" y="25" width="43" height="52" rx="3" /><path d="M52 38h21M52 45h18" /></g>
            <g transform="rotate(-13 35 42)"><rect x="12" y="14" width="49" height="57" rx="3" fill="var(--community-profile-art-paper, #f5f8fc)" /><circle cx="45" cy="30" r="5.5" fill="#3a9cff" /><path d="m18 57 9-13c1-2 3-2 5 0l8 11 5-6c1-2 3-2 5 0l5 6" /></g>
          </g>
        </svg>
        <div className="community-profile-empty-copy">
          <h3>{copy("Henüz paylaşım yok", "No posts yet", "Nuk ka ende postime")}</h3>
          <p>{copy("Bu gezginin paylaşımları burada görünecek.", "This traveller’s posts will appear here.", "Postimet e këtij udhëtari do të shfaqen këtu.")}</p>
          {!!profile && profile.answerCount > 0 && <button type="button" className="community-profile-answer-link" onClick={() => { switchSection("answers"); document.getElementById(`${id}-answers`)?.focus(); }}>
            {copy(`${profile.answerCount.toLocaleString(dateLocale)} cevabı gör`, `View ${profile.answerCount.toLocaleString(dateLocale)} ${profile.answerCount === 1 ? "answer" : "answers"}`, `Shiko ${profile.answerCount.toLocaleString(dateLocale)} përgjigje`)}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
          </button>}
        </div>
      </div> : <div className="community-profile-empty"><Icon name={section === "followers" || section === "following" ? "users" : "message"} size={28} /><p>{empty}</p></div>)}
      <div className="community-profile-items">{page?.items.map((item: CommunityProfileItem) => "key" in item
        ? <button type="button" className="community-profile-person" key={profileItemKey(item)} onClick={() => onOpenProfile(item.key)}><CommunityAvatar username={item.username} avatarUrl={item.avatarUrl} size="medium" /><strong>@{item.username}<OfficialBadge isOfficial={item.isOfficial} /></strong><Icon name="chevron" size={18} /></button>
        : <article className="community-profile-post" key={profileItemKey(item)}>
          <span className="community-profile-post-meta"><span><Icon name={"questionId" in item ? "message" : "book"} size={15} />{"questionId" in item ? copy("Cevap", "Answer", "Përgjigje") : copy("Paylaşım", "Post", "Postim")}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time></span>
          {!("questionId" in item) && item.photoUrl && <CommunityPostPhoto photoUrl={item.photoUrl} accessToken={accessToken || ""} alt={item.title}/>}
          <ForumTranslation text={item.body} title={"questionTitle" in item ? item.questionTitle : item.title} accessToken={accessToken || ""}>{(display, displayTitle) => <div className="community-profile-post-copy"><strong>{displayTitle}</strong><p>{display}</p></div>}</ForumTranslation>
          {!("questionId" in item) && item.status && item.status !== "published"
            ? <p className="community-profile-notice" role="status">{item.status === "rejected" ? copy("Reddedildi · Bu paylaşım yayımlanmadı.", "Rejected · This post was not published.", "U refuzua · Ky postim nuk u publikua.")
              : item.status === "hidden" ? copy("Gizlendi · Bu paylaşım artık yayında değil.", "Hidden · This post is no longer published.", "U fsheh · Ky postim nuk është më i publikuar.")
                : item.status === "closed" ? copy("Kapatıldı · Bu sohbet artık açık değil.", "Closed · This discussion is no longer open.", "U mbyll · Kjo bisedë nuk është më e hapur.")
                  : copy("İncelemede · Şimdilik yalnızca sen görebilirsin.", "In review · Only you can see this for now.", "Në shqyrtim · Për momentin vetëm ti mund ta shohësh.")}</p>
            : <button type="button" className="community-profile-post-cta" onClick={() => onOpenQuestion("questionId" in item ? item.questionId : item.id)}>{copy("Sohbeti görüntüle", "View discussion", "Shiko bisedën")}<Icon name="chevron" size={16} /></button>}
        </article>)}</div>
      {failure?.section === section && !missingOwnProfile && <div className="community-profile-error" role="alert"><p>{failure.unavailable ? copy("Bu profil şu anda görüntülenemiyor.", "This profile is currently unavailable.", "Ky profil nuk është i disponueshëm tani.") : copy("Bağlantı kurulamadı. Tekrar deneyebilirsin.", "Could not connect. You can try again.", "Nuk u krijua lidhja. Mund të provosh sërish.")}</p><button type="button" disabled={loading || loadingMore} onClick={() => failure.more ? void loadMore() : setRevision(value => value + 1)}><Icon name="refresh" size={17} />{copy("Tekrar dene", "Try again", "Provo sërish")}</button></div>}
      {page?.nextOffset != null && !failure?.more && <button className="community-profile-more" type="button" disabled={loading || loadingMore} onClick={() => void loadMore()}>{loadingMore ? copy("Yükleniyor…", "Loading…", "Po ngarkohet…") : copy("Daha fazla göster", "Show more", "Shfaq më shumë")}</button>}
    </section>}
    {compose && ownProfile && userId && accessToken && <SocialComposer ownerId={userId} accessToken={accessToken} onClose={() => setCompose(false)} onPublished={() => { setCompose(false); setGallery(true); setSocialRevision(value => value + 1); }}/>}
  </>;
}
