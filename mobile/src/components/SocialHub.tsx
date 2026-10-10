import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import { formatAppDate } from "../lib/localeFormatting";
import { createId } from "../lib/id";
import { ApiError } from "../lib/api";
import { mergeSocialItems, socialRead, socialWrite, type SocialCollection, type SocialComment, type SocialDetail, type SocialPage, type SocialPlace, type SocialPost } from "../lib/social";
import { CommunityAvatar } from "./CommunityAvatar";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { SocialComposer } from "./SocialComposer";
import { SocialPhoto } from "./SocialPhoto";
import { ForumTranslation } from "./ForumTranslation";
import "./social.css";

type SocialContext = {
  userId?: string | null; accessToken?: string | null; onOpenAccount: () => void;
  onOpenProfile: (key: string) => void; onAddPlace?: (place: SocialPlace) => void;
  onBlocked?: (userId: string) => void;
};

export function SocialHub(props: SocialContext & { revision?: number; initialPostId?: string; onIntentHandled?: () => void }) {
  const { copy } = useI18n();
  const [feed, setFeed] = useState<"discover" | "following">("discover");
  const [compose, setCompose] = useState(false);
  const [collections, setCollections] = useState(false);
  const [collection, setCollection] = useState<SocialCollection | null>(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [requestedPost, setRequestedPost] = useState<string | undefined>();
  useEffect(() => { if (props.initialPostId) { setCollection(null); setFeed("discover"); setRequestedPost(props.initialPostId); } }, [props.initialPostId]);
  return <div className="social-hub">
    <div className="social-hub-heading"><div><span className="social-eyebrow">{copy("GEZGİNLERDEN", "FROM TRAVELLERS", "NGA UDHËTARËT")}</span><h2>{copy("Yoldan hikâyeler", "Stories from the road", "Histori nga rruga")}</h2></div><button type="button" className="social-icon-button" aria-label={copy("Koleksiyonlarım", "My collections", "Koleksionet e mia")} onClick={() => props.userId && props.accessToken ? setCollections(true) : props.onOpenAccount()}><Icon name="bookmark" size={22}/></button></div>
    <button type="button" className="social-share-entry" onClick={() => props.userId && props.accessToken ? setCompose(true) : props.onOpenAccount()}><span><Icon name="camera" size={23}/></span><div><strong>{copy("Bir anını paylaş", "Share a moment", "Ndaj një çast")}</strong><small>{copy("Fotoğrafın, hikâyen, keşfettiğin yer", "Your photo, your story, your discovery", "Fotografia, historia dhe zbulimi yt")}</small></div><Icon name="plus" size={20}/></button>
    <div className="social-feed-tabs" role="group" aria-label={copy("Gönderi akışı", "Post feed", "Rrjedha e postimeve")}>
      <button type="button" aria-pressed={!collection && feed === "discover"} onClick={() => { setCollection(null); setFeed("discover"); }}>{copy("Keşfet", "Discover", "Zbulo")}</button>
      <button type="button" aria-pressed={!collection && feed === "following"} onClick={() => { setCollection(null); setFeed("following"); }}>{copy("Takip ettiklerim", "Following", "Të ndjekurit")}</button>
    </div>
    {collection && <div className="social-collection-heading"><h3>{collection.name}</h3><button type="button" className="social-text-button" onClick={() => setCollection(null)}>{copy("Akışa dön", "Back to feed", "Kthehu te rrjedha")}</button></div>}
    {notice && <p className="social-notice" role="status">{notice}</p>}
    {feed === "following" && !props.userId ? <SocialEmpty icon="users" title={copy("Gezginleri takip et", "Follow travellers", "Ndiq udhëtarët")} text={copy("Takip ettiğin kişilerin fotoğrafları burada görünür.", "Photos from people you follow appear here.", "Fotot e personave që ndjek shfaqen këtu.")}><button type="button" className="secondary-wide" onClick={props.onOpenAccount}>{copy("Giriş yap", "Sign in", "Hyr")}</button></SocialEmpty> : <SocialBrowser key={`${props.userId || "guest"}:${feed}:${collection?.id || "feed"}`} {...props} feed={feed} collectionId={collection?.id} revision={revision + (props.revision || 0)} initialPostId={feed === "discover" && !collection ? requestedPost : undefined} onIntentHandled={() => { setRequestedPost(undefined); props.onIntentHandled?.(); }} />}
    {compose && props.userId && props.accessToken && <SocialComposer ownerId={props.userId} accessToken={props.accessToken} onClose={() => setCompose(false)} onPublished={() => { setCompose(false); setNotice(copy("Gönderin alındı. İnceleme durumunu profilinde görebilirsin.", "Post received. You can see its review status on your profile.", "Postimi u mor. Mund të shohësh gjendjen e shqyrtimit në profil.")); setRevision(value => value + 1); }}/>}
    {collections && props.accessToken && <CollectionsSheet accessToken={props.accessToken} onClose={() => setCollections(false)} onSelect={value => { setCollection(value); setCollections(false); }}/>}
  </div>;
}

export function SocialGallery(props: SocialContext & { authorRef: string; revision?: number }) {
  return <SocialBrowser key={`${props.authorRef}:${props.userId || "guest"}`} {...props} gallery />;
}

function SocialBrowser({ userId, accessToken, onOpenAccount, onOpenProfile, onAddPlace, onBlocked, authorRef, feed = "discover", collectionId, gallery = false, revision = 0, initialPostId, onIntentHandled }: SocialContext & { authorRef?: string; feed?: "discover" | "following"; collectionId?: string; gallery?: boolean; revision?: number; initialPostId?: string; onIntentHandled?: () => void }) {
  const { copy } = useI18n();
  const [page, setPage] = useState<SocialPage>({ items: [], nextOffset: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ post: SocialPost; until: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const more = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; more.current?.abort(); }; }, []);
  useEffect(() => { if (initialPostId) { setDetailId(initialPostId); onIntentHandled?.(); } }, [initialPostId]);
  useEffect(() => {
    const controller = new AbortController();
    more.current?.abort(); more.current = null;
    setLoading(true); setError("");
    void socialRead<SocialPage>({ feed, authorRef, collectionId, offset: 0 }, accessToken, controller.signal).then(data => {
      if (!controller.signal.aborted) setPage(data);
    }).catch(failure => { if (!controller.signal.aborted) { if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setPage({ items: [], nextOffset: null }); setError(copy("Gönderiler yüklenemedi. Tekrar deneyebilirsin.", "Could not load posts. You can try again.", "Postimet nuk u ngarkuan. Mund të provosh sërish.")); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [feed, authorRef, collectionId, accessToken, revision, attempt, copy]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), Math.max(0, Date.parse(undo.until) - Date.now()));
    return () => clearTimeout(timer);
  }, [undo]);
  const loadMore = async () => {
    if (loading || more.current || page.nextOffset === null) return;
    const controller = new AbortController(); more.current = controller;
    setLoading(true); setError("");
    try {
      const next = await socialRead<SocialPage>({ feed, authorRef, collectionId, offset: page.nextOffset }, accessToken, controller.signal);
      if (!controller.signal.aborted) setPage(previous => ({ items: mergeSocialItems(previous.items, next.items), nextOffset: next.nextOffset }));
    } catch { if (!controller.signal.aborted) setError(copy("Diğer gönderiler yüklenemedi.", "Could not load more posts.", "Postimet e tjera nuk u ngarkuan.")); }
    finally { if (more.current === controller) { more.current = null; if (alive.current) setLoading(false); } }
  };
  const restore = async () => {
    if (!undo || !accessToken || restoring) return;
    setRestoring(true); setError("");
    try { await socialWrite("restore", { postId: undo.post.id }, accessToken); if (alive.current) { setUndo(null); setAttempt(value => value + 1); } }
    catch { if (alive.current) setError(copy("Gönderi geri alınamadı. Süre dolmuş olabilir.", "Could not restore the post. The undo period may have expired.", "Postimi nuk u rikthye. Afati mund të ketë mbaruar.")); }
    finally { if (alive.current) setRestoring(false); }
  };
  return <div className={gallery ? "social-gallery-region" : "social-feed"} aria-busy={loading}>
    {loading && !page.items.length && <div className="social-loading" role="status"><span className="button-loader dark"/>{copy("Gönderiler yükleniyor…", "Loading posts…", "Duke ngarkuar postimet…")}</div>}
    {!loading && !error && !page.items.length && <SocialEmpty icon={gallery ? "camera" : "compass"} title={copy("Henüz gönderi yok", "No posts yet", "Ende nuk ka postime")} text={gallery ? copy("Bu gezginin fotoğrafları burada görünecek.", "This traveller's photos will appear here.", "Fotot e këtij udhëtari do të shfaqen këtu.") : collectionId ? copy("Beğendiğin gönderileri bu koleksiyona kaydet.", "Save posts you like to this collection.", "Ruaj postimet që pëlqen në këtë koleksion.") : feed === "following" ? copy("Gezgin profillerini takip ederek akışını oluştur.", "Follow traveller profiles to build your feed.", "Ndiq profile udhëtarësh për të krijuar rrjedhën tënde.") : copy("İlk seyahat fotoğrafını paylaşarak başla.", "Start by sharing your first travel photo.", "Fillo duke ndarë foton e parë të udhëtimit.")}/>}
    <div className={gallery ? "social-gallery" : "social-post-list"}>{page.items.map(post => gallery ? <div className="social-gallery-tile" key={post.id}>
      <SocialPhoto photoUrl={post.photoUrl} accessToken={accessToken || ""} alt={post.caption || post.place?.name || copy("Gönderiyi aç", "Open post", "Hap postimin")} onOpen={() => setDetailId(post.id)}/>
      {post.status !== "published" && <span className="social-gallery-status">{copy("İncelemede", "In review", "Në shqyrtim")}</span>}
    </div> : <article className="social-card" key={post.id}>
      <SocialAuthorButton post={post} onOpenProfile={onOpenProfile}/>
      <SocialPhoto photoUrl={post.photoUrl} accessToken={accessToken || ""} alt={post.caption || post.place?.name || copy("Seyahat fotoğrafı", "Travel photo", "Foto udhëtimi")} onOpen={() => setDetailId(post.id)}/>
      <div className="social-card-summary">{post.status === "pending" && <span className="social-muted">{copy("İncelemede · Yalnızca sen görüyorsun", "In review · Only visible to you", "Në shqyrtim · Vetëm ti e sheh")}</span>}<button type="button" className="social-card-engagement" onClick={() => setDetailId(post.id)}><Icon name="heart" size={21}/><span>{post.likeCount}</span><Icon name="message" size={21}/><span>{post.commentCount}</span><span className="sr-only">{copy("Gönderiyi ve yorumları aç", "Open post and comments", "Hap postimin dhe komentet")}</span></button>{post.caption && <p>{post.caption}</p>}{post.place && <button type="button" className="social-place" onClick={() => setDetailId(post.id)}><Icon name="map" size={15}/>{post.place.name}</button>}</div>
    </article>)}</div>
    {error && <div className="social-error" role="alert"><p>{error}</p><button type="button" className="social-text-button" disabled={loading} onClick={() => setAttempt(value => value + 1)}>{copy("Tekrar dene", "Try again", "Provo sërish")}</button></div>}
    {page.nextOffset !== null && <button type="button" className="secondary-wide" disabled={loading} onClick={() => void loadMore()}>{copy("Daha fazla göster", "Show more", "Shfaq më shumë")}</button>}
    {undo && <div className="social-undo" role="status"><span>{copy("Gönderi silindi", "Post deleted", "Postimi u fshi")}</span><button type="button" disabled={restoring} onClick={() => void restore()}>{copy("Geri al", "Undo", "Zhbëj")}</button></div>}
    {blocked && <p role="status" className="social-notice">{copy("Kullanıcı engellendi. Engellenenler bölümünden geri alabilirsin.", "User blocked. You can undo this in Blocked users.", "Përdoruesi u bllokua. Mund ta zhbësh te Përdoruesit e bllokuar.")}</p>}
    {detailId && <SocialPostSheet key={`${detailId}:${userId || "guest"}`} postId={detailId} accessToken={accessToken} userId={userId} onOpenAccount={onOpenAccount} onOpenProfile={onOpenProfile} onAddPlace={onAddPlace} onBlocked={blockedId => { setPage(previous => ({ ...previous, items: previous.items.filter(item => item.author.userId !== blockedId) })); setDetailId(null); setBlocked(true); setAttempt(value => value + 1); onBlocked?.(blockedId); }} onClose={() => setDetailId(null)} onChanged={post => setPage(previous => ({ ...previous, items: previous.items.map(item => item.id === post.id ? post : item) }))} onDeleted={(post, until) => { setPage(previous => ({ ...previous, items: previous.items.filter(item => item.id !== post.id) })); setDetailId(null); setUndo({ post, until }); }}/>}
  </div>;
}

function SocialAuthorButton({ post, onOpenProfile }: { post: SocialPost; onOpenProfile: (key: string) => void }) {
  const { copy, dateLocale } = useI18n();
  return <header className="social-author-row"><button type="button" onClick={() => onOpenProfile(post.author.key)}><CommunityAvatar username={post.author.username} avatarUrl={post.author.avatarUrl} size="medium"/><span><strong>@{post.author.username}</strong><small>{post.visibility === "followers" ? <><Icon name="lock" size={12}/>{copy("Takipçiler", "Followers", "Ndjekësit")} · </> : null}<time dateTime={post.createdAt}>{formatAppDate(new Date(post.createdAt), dateLocale, { day: "numeric", month: "short" })}</time></small></span></button></header>;
}

function SocialEmpty({ icon, title, text, children }: { icon: "camera" | "compass" | "users"; title: string; text: string; children?: React.ReactNode }) {
  return <div className="social-empty"><span><Icon name={icon} size={31}/></span><h3>{title}</h3><p>{text}</p>{children}</div>;
}

function SocialPostSheet({ postId, accessToken, userId, onOpenAccount, onOpenProfile, onAddPlace, onBlocked, onClose, onChanged, onDeleted }: SocialContext & { postId: string; onClose: () => void; onChanged: (post: SocialPost) => void; onDeleted: (post: SocialPost, until: string) => void }) {
  const { copy, dateLocale } = useI18n();
  const [detail, setDetail] = useState<SocialDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<SocialComment | null>(null);
  const [body, setBody] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [report, setReport] = useState<SocialComment | "post" | null>(null);
  const [reported, setReported] = useState(false);
  const alive = useRef(true);
  const writing = useRef(false);
  const commentId = useRef(createId());
  const lastComment = useRef("");
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void socialRead<SocialDetail>({ postId }, accessToken, controller.signal).then(data => { if (!controller.signal.aborted) setDetail(data); }).catch(failure => { if (!controller.signal.aborted) { if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) setDetail(null); setError(copy("Gönderi açılamadı. Silinmiş veya görünürlüğü değişmiş olabilir.", "Could not open this post. It may have been removed or its visibility changed.", "Postimi nuk u hap. Mund të jetë hequr ose dukshmëria të ketë ndryshuar.")); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [postId, accessToken, attempt, copy]);
  const authenticated = () => { if (userId && accessToken) return true; onOpenAccount(); return false; };
  const updatePost = (post: SocialPost) => { setDetail(previous => previous ? { ...previous, post } : previous); onChanged(post); };
  const perform = async (action: () => Promise<void>) => {
    if (writing.current || !authenticated()) return;
    writing.current = true; setBusy(true); setError("");
    try { await action(); }
    catch { if (alive.current) setError(copy("İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.", "Could not complete the action. Check your connection and retry.", "Veprimi nuk u krye. Kontrollo lidhjen dhe provo sërish.")); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const like = () => void perform(async () => {
    if (!detail) return;
    const active = !detail.post.liked;
    const post = await socialWrite<SocialPost>("like", { postId, active }, accessToken!);
    if (alive.current) updatePost(post);
  });
  const sendComment = () => void perform(async () => {
    if (!detail || !body.trim()) return;
    const fingerprint = `${reply?.id || ""}\u0000${body.trim()}`;
    if (lastComment.current && lastComment.current !== fingerprint) commentId.current = createId();
    lastComment.current = fingerprint;
    const comment = await socialWrite<SocialComment>("comment", { postId, body: body.trim(), parentId: reply?.id || null, requestId: commentId.current }, accessToken!);
    if (!alive.current) return;
    setDetail(previous => previous ? { post: { ...previous.post, commentCount: previous.post.commentCount + (previous.comments.items.some(item => item.id === comment.id) ? 0 : 1) }, comments: { ...previous.comments, items: mergeSocialItems(previous.comments.items, [comment]) } } : previous);
    onChanged({ ...detail.post, commentCount: detail.post.commentCount + 1 });
    setBody(""); setReply(null); commentId.current = createId(); lastComment.current = "";
  });
  const remove = () => void perform(async () => {
    if (!detail) return;
    const result = await socialWrite<{ undoUntil: string }>("delete", { postId }, accessToken!);
    if (alive.current) onDeleted(detail.post, result.undoUntil);
  });
  const loadMore = async () => {
    if (!detail || detail.comments.nextOffset === null || writing.current) return;
    writing.current = true; setBusy(true); setError("");
    try {
      const result = await socialRead<SocialDetail>({ postId, offset: detail.comments.nextOffset }, accessToken);
      if (alive.current) setDetail(previous => previous ? { ...previous, comments: { ...result.comments, items: mergeSocialItems(previous.comments.items, result.comments.items) } } : previous);
    } catch { if (alive.current) setError(copy("Yorumlar yüklenemedi.", "Could not load comments.", "Komentet nuk u ngarkuan.")); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  return <Sheet open title={copy("Gönderi", "Post", "Postimi")} size="large" onClose={onClose} className="social-sheet">
    <div className="social-detail">
      {loading && <p role="status">{copy("Yükleniyor…", "Loading…", "Duke ngarkuar…")}</p>}
      {error && <div role="alert" className="social-error"><p>{error}</p>{!detail && <button type="button" className="social-text-button" onClick={() => setAttempt(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button>}</div>}
      {detail && <>
        <SocialAuthorButton post={detail.post} onOpenProfile={key => { onClose(); onOpenProfile(key); }}/>
        <SocialPhoto photoUrl={detail.post.photoUrl} accessToken={accessToken || ""} alt={detail.post.caption || copy("Seyahat fotoğrafı", "Travel photo", "Foto udhëtimi")}/>
        {detail.post.status !== "published" && <p className="social-notice" role="status">{detail.post.status === "pending" ? copy("Gönderin inceleniyor. Şimdilik yalnızca sen görebilirsin.", "Your post is in review. Only you can see it for now.", "Postimi po shqyrtohet. Për momentin vetëm ti mund ta shohësh.") : copy("Bu gönderi yayında değil.", "This post is not published.", "Ky postim nuk është publikuar.")}</p>}
        {detail.post.status === "published" && <div className="social-detail-actions"><button type="button" className={detail.post.liked ? "is-liked" : ""} aria-pressed={detail.post.liked} disabled={busy} onClick={like}><Icon name="heart" size={23}/>{detail.post.likeCount}<span className="sr-only">{copy("Beğen", "Like", "Pëlqe")}</span></button><button type="button" onClick={() => input.current?.focus()}><Icon name="message" size={23}/>{detail.post.commentCount}<span className="sr-only">{copy("Yorum yaz", "Comment", "Komento")}</span></button><button type="button" className="social-save-button" aria-pressed={detail.post.saved} onClick={() => { if (authenticated()) setSaveOpen(true); }}><Icon name="bookmark" size={23}/><span>{copy("Kaydet", "Save", "Ruaj")}</span></button></div>}
        {detail.post.caption && <ForumTranslation text={detail.post.caption} accessToken={accessToken || ""} onSignIn={onOpenAccount}><p className="social-caption">{detail.post.caption}</p></ForumTranslation>}
        {detail.post.place && <div className="social-place-card"><div><Icon name="map" size={21}/><strong>{detail.post.place.name}</strong></div>{onAddPlace && <button type="button" className="social-text-button" onClick={() => { onClose(); onAddPlace(detail.post.place!); }}><Icon name="route" size={18}/>{copy("Rotama ekle", "Add to my route", "Shto në itinerarin tim")}</button>}</div>}
        <div className="social-post-options">{detail.post.isOwn ? <button type="button" className="social-text-button" disabled={busy} onClick={() => setDeleteConfirm(value => !value)}><Icon name="trash" size={16}/>{copy("Gönderiyi sil", "Delete post", "Fshi postimin")}</button> : <button type="button" className="social-text-button" onClick={() => { if (authenticated()) setReport("post"); }}><Icon name="flag" size={16}/>{copy("Bildir", "Report", "Raporto")}</button>}</div>
        {deleteConfirm && <div className="social-confirm"><p>{copy("Gönderi silinsin mi? Ardından 30 saniye içinde geri alabilirsin.", "Delete this post? You can undo within 30 seconds.", "Ta fshish postimin? Mund ta zhbësh brenda 30 sekondave.")}</p><div><button type="button" className="secondary-button" disabled={busy} onClick={() => setDeleteConfirm(false)}>{copy("Vazgeç", "Cancel", "Anulo")}</button><button type="button" className="secondary-button" disabled={busy} onClick={remove}>{copy("Sil", "Delete", "Fshi")}</button></div></div>}
        {detail.post.status === "published" && <><section className="social-comments" aria-label={copy("Yorumlar", "Comments", "Komentet")}><h3>{copy("Yorumlar", "Comments", "Komentet")}</h3>
          {!detail.comments.items.length && <p className="social-muted">{copy("İlk yorumu sen yaz.", "Write the first comment.", "Shkruaj komentin e parë.")}</p>}
          {detail.comments.items.map(comment => <article className={`social-comment${comment.parentId ? " is-reply" : ""}`} key={comment.id}><button type="button" className="social-comment-author" onClick={() => { onClose(); onOpenProfile(comment.author.key); }}><CommunityAvatar username={comment.author.username} avatarUrl={comment.author.avatarUrl} size="small"/><strong>@{comment.author.username}</strong></button><ForumTranslation text={comment.body} accessToken={accessToken || ""} onSignIn={onOpenAccount}><p>{comment.body}</p></ForumTranslation>{comment.status !== "published" && <small className="social-muted">{copy("İncelemede", "In review", "Në shqyrtim")}</small>}<footer><time dateTime={comment.createdAt}>{formatAppDate(new Date(comment.createdAt), dateLocale, { day: "numeric", month: "short" })}</time><button type="button" disabled={comment.status !== "published"} onClick={() => { if (authenticated()) { setReply(comment); input.current?.focus(); } }}>{copy("Yanıtla", "Reply", "Përgjigju")}</button>{comment.author.userId !== userId && <button type="button" aria-label={copy("Yorumu bildir", "Report comment", "Raporto komentin")} onClick={() => { if (authenticated()) setReport(comment); }}><Icon name="flag" size={14}/></button>}</footer></article>)}
          {detail.comments.nextOffset !== null && <button type="button" className="secondary-wide" disabled={busy} onClick={() => void loadMore()}>{copy("Diğer yorumlar", "More comments", "Më shumë komente")}</button>}
        </section>
        {userId && accessToken ? <form className="social-comment-form" onSubmit={event => { event.preventDefault(); sendComment(); }}>{reply && <div className="social-reply-target"><span>{copy(`@${reply.author.username} için yanıt`, `Replying to @${reply.author.username}`, `Përgjigje për @${reply.author.username}`)}</span><button type="button" aria-label={copy("Yanıtı iptal et", "Cancel reply", "Anulo përgjigjen")} onClick={() => setReply(null)}><Icon name="close" size={16}/></button></div>}<label>{copy("Yorumun", "Your comment", "Komenti yt")}<textarea ref={input} rows={2} value={body} maxLength={2000} disabled={busy} onChange={event => setBody(event.target.value)} placeholder={copy("Bir yorum yaz…", "Write a comment…", "Shkruaj një koment…")}/></label><button type="submit" className="primary-wide" disabled={busy || !body.trim()}>{copy("Gönder", "Send", "Dërgo")}</button></form> : <button type="button" className="secondary-wide" onClick={onOpenAccount}>{copy("Yorum yazmak için giriş yap", "Sign in to comment", "Hyr për të komentuar")}</button>}</>}
        {reported && <p className="social-notice" role="status">{copy("Bildirimin alındı.", "Report received.", "Raportimi u mor.")}</p>}
      </>}
    </div>
    {saveOpen && accessToken && detail && <CollectionsSheet accessToken={accessToken} post={detail.post} onClose={() => setSaveOpen(false)} onPostChanged={updatePost}/>}
    {report && accessToken && <ReportSheet accessToken={accessToken} postId={postId} commentId={report === "post" ? undefined : report.id} onClose={() => setReport(null)} onBlocked={blockedId => { setReport(null); onBlocked?.(blockedId); onClose(); }} onReported={() => { setReport(null); setReported(true); }}/>}
  </Sheet>;
}

function CollectionsSheet({ accessToken, post, onClose, onSelect, onPostChanged }: { accessToken: string; post?: SocialPost; onClose: () => void; onSelect?: (collection: SocialCollection) => void; onPostChanged?: (post: SocialPost) => void }) {
  const { copy } = useI18n();
  const [items, setItems] = useState<SocialCollection[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void socialRead<SocialCollection[]>({ section: "collections" }, accessToken, controller.signal).then(data => { if (!controller.signal.aborted) setItems(data); }).catch(() => { if (!controller.signal.aborted) setError(copy("Koleksiyonlar yüklenemedi.", "Could not load collections.", "Koleksionet nuk u ngarkuan.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, attempt, copy]);
  const create = async () => {
    if (pending.current || !name.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try { const value = await socialWrite<SocialCollection>("collection-create", { name: name.trim() }, accessToken); if (alive.current) { setItems(previous => mergeSocialItems(previous, [value])); setName(""); } }
    catch { if (alive.current) setError(copy("Koleksiyon oluşturulamadı.", "Could not create collection.", "Koleksioni nuk u krijua.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const save = async (collection: SocialCollection) => {
    if (!post) { onSelect?.(collection); return; }
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const ids = post.collectionIds || [];
    const active = !ids.includes(collection.id);
    try {
      const savedPost = await socialWrite<SocialPost>("save", { postId: post.id, collectionId: collection.id, active }, accessToken);
      if (alive.current) {
        onPostChanged?.(savedPost);
        setItems(previous => previous.map(item => item.id === collection.id ? { ...item, postCount: Math.max(0, item.postCount + (active ? 1 : -1)) } : item));
      }
    } catch { if (alive.current) setError(copy("Gönderi kaydedilemedi. Tekrar dene.", "Could not save post. Try again.", "Postimi nuk u ruajt. Provo sërish.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  return <Sheet open title={post ? copy("Koleksiyona kaydet", "Save to collection", "Ruaj në koleksion") : copy("Koleksiyonlarım", "My collections", "Koleksionet e mia")} onClose={onClose} className="social-sheet"><div className="social-collections">
    <p className="social-muted">{copy("Koleksiyonlarını yalnızca sen görürsün.", "Only you can see your collections.", "Vetëm ti mund t'i shohësh koleksionet.")}</p>
    {loading && <p role="status">{copy("Yükleniyor…", "Loading…", "Duke ngarkuar…")}</p>}
    {items.map(item => <button type="button" className="social-collection" key={item.id} disabled={busy} aria-pressed={post ? (post.collectionIds || []).includes(item.id) : undefined} onClick={() => void save(item)}><span><Icon name="bookmark" size={22}/></span><div><strong>{item.name}</strong><small>{copy(`${item.postCount} gönderi`, `${item.postCount} posts`, `${item.postCount} postime`)}</small></div><Icon name={post && (post.collectionIds || []).includes(item.id) ? "check" : "chevron"} size={20}/></button>)}
    {!loading && !error && !items.length && <p>{copy("İlk koleksiyonunu oluştur.", "Create your first collection.", "Krijo koleksionin e parë.")}</p>}
    <form onSubmit={event => { event.preventDefault(); void create(); }}><label>{copy("Yeni koleksiyon", "New collection", "Koleksion i ri")}<input value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} placeholder={copy("Örn. Yaz tatili", "E.g. Summer trip", "P.sh. Pushimet verore")}/></label><button type="submit" className="secondary-wide" disabled={busy || !name.trim()}><Icon name="plus" size={18}/>{copy("Oluştur", "Create", "Krijo")}</button></form>
    {error && <div role="alert" className="social-error"><p>{error}</p><button type="button" className="social-text-button" onClick={() => setAttempt(value => value + 1)}>{copy("Tekrar dene", "Retry", "Provo sërish")}</button></div>}
  </div></Sheet>;
}

function ReportSheet({ accessToken, postId, commentId, onClose, onReported, onBlocked }: { accessToken: string; postId: string; commentId?: string; onClose: () => void; onReported: () => void; onBlocked: (userId: string) => void }) {
  const { copy } = useI18n();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blockConfirm, setBlockConfirm] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const submit = async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try { await socialWrite("report", { postId, commentId, reason, details: details.trim() }, accessToken); if (alive.current) onReported(); }
    catch { if (alive.current) setError(copy("Bildirim gönderilemedi. Tekrar dene.", "Could not send report. Try again.", "Raportimi nuk u dërgua. Provo sërish.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const block = async () => {
    if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try { const result = await socialWrite<{ success: boolean; userId: string }>("block", { postId, commentId }, accessToken); if (alive.current) onBlocked(result.userId); }
    catch { if (alive.current) setError(copy("Kullanıcı engellenemedi. Tekrar dene.", "Could not block this user. Try again.", "Përdoruesi nuk u bllokua. Provo sërish.")); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  return <Sheet open title={copy("Kullanıcı seçenekleri", "User options", "Opsionet e përdoruesit")} onClose={onClose} dismissible={!busy} className="social-sheet"><form className="social-report" onSubmit={event => { event.preventDefault(); void submit(); }}><label>{copy("Bildirme nedeni", "Report reason", "Arsyeja e raportimit")}<select value={reason} disabled={busy} onChange={event => setReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">{copy("Taciz veya zorbalık", "Harassment or bullying", "Ngacmim ose bullizëm")}</option><option value="inappropriate">{copy("Uygunsuz içerik", "Inappropriate content", "Përmbajtje e papërshtatshme")}</option><option value="other">{copy("Diğer", "Other", "Tjetër")}</option></select></label><label>{copy("Açıklama · isteğe bağlı", "Details · optional", "Hollësi · opsionale")}<textarea value={details} maxLength={1000} disabled={busy} onChange={event => setDetails(event.target.value)}/></label><button type="submit" className="primary-wide" disabled={busy}>{copy("Bildir", "Report", "Raporto")}</button></form>
    <div className="social-block-action">{blockConfirm ? <div className="social-confirm"><p>{copy("Bu kullanıcının gönderileri ve yorumları gizlenecek, karşılıklı takipler kaldırılacak. Engellenenler bölümünden engeli kaldırabilirsin.", "This user's posts and comments will be hidden and mutual follows removed. You can unblock them in Blocked users.", "Postimet dhe komentet do të fshihen nga pamja dhe ndjekjet e ndërsjella do të hiqen. Mund ta zhbllokosh te Përdoruesit e bllokuar.")}</p><div><button type="button" className="secondary-button" disabled={busy} onClick={() => setBlockConfirm(false)}>{copy("Vazgeç", "Cancel", "Anulo")}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void block()}>{copy("Engelle", "Block", "Blloko")}</button></div></div> : <button type="button" className="secondary-wide" disabled={busy} onClick={() => setBlockConfirm(true)}><Icon name="shield" size={18}/>{copy("Kullanıcıyı engelle", "Block user", "Blloko përdoruesin")}</button>}{error && <p className="social-error" role="alert">{error}</p>}</div>
  </Sheet>;
}
