import { formatAppDate } from "../lib/localeFormatting";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { isCalendarDate, localIsoDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { shareContent } from "../lib/native";
import {
  collaborationAction,
  tripInviteFromUrl,
  rememberTripInvite,
  getTripCollaboration,
  listSharedTrips,
  type SharedTripSummary,
  type TripCollaborationWorkspace,
  type TripMemberRole,
} from "../lib/tripCollaboration";
import { DateTimeField } from "./DateTimeField";
import { CountryPicker } from "./CountryPicker";
import { COUNTRY_LIST } from "../data/countries";
import { alpha2FromAlpha3 } from "../data/countryIso";
import { createCockpitTrip, getSupabaseDataErrorMessage } from "../lib/supabaseData";
import { activeTripContextFromTrip, writeActiveTripContext } from "../lib/activeTripContext";
import { createId } from "../lib/id";
import { Icon } from "./Icon";
import { TravelToolArtwork } from "./TravelToolArtwork";
import { CountryFlag } from "./CountryFlag";
import { Sheet } from "./Sheet";
import "./trip-collaboration-artwork.css";

type CollaborationTab = "team" | "vote" | "budget";

type TripCollaborationHubProps = {
  accessToken: string;
  userId: string;
  refreshKey: string;
  initialInviteCode?: string;
  initialEntry?: "create" | "join";
  onInviteHandled?: () => void;
  onNotice: (message: string) => void;
};

const ROLE_LABELS: Record<TripMemberRole, { tr: string; en: string; sq: string }> = {
  owner: { tr: "Sahip", en: "Owner", sq: "Pronar" },
  editor: { tr: "Düzenleyici", en: "Editor", sq: "Redaktues" },
  viewer: { tr: "İzleyici", en: "Viewer", sq: "Shikues" },
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function moneyText(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale === "sq" ? "sq-AL" : locale === "en" ? "en-US" : "tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function dateText(value: string, locale: string) {
  try {
    return formatAppDate(new Date(`${value}T12:00:00`), locale === "sq" ? "sq-AL" : locale === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export function TripCollaborationHub({ accessToken, userId, refreshKey, initialInviteCode, initialEntry, onInviteHandled, onNotice }: TripCollaborationHubProps) {
  const { copy, locale, countryName } = useI18n();
  const [trips, setTrips] = useState<SharedTripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode || "");
  const [selectedTripId, setSelectedTripId] = useState("");
  const [workspace, setWorkspace] = useState<TripCollaborationWorkspace | null>(null);
  const [tab, setTab] = useState<CollaborationTab>("team");
  const [busy, setBusy] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [optionTitle, setOptionTitle] = useState("");
  const [optionDetails, setOptionDetails] = useState("");
  const [optionType, setOptionType] = useState("activity");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("TRY");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(localIsoDate(0));
  const [paidBy, setPaidBy] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [entry, setEntry] = useState<"create" | "join" | null>(initialInviteCode ? "join" : initialEntry || null);
  const [newCountry, setNewCountry] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  // React's busy state disables the next render; the ref also guards two
  // taps/submits delivered before that render commits.
  const actionPending = useRef(false);
  const countryOptions = useMemo(() => COUNTRY_LIST.map(country => ({ code: country.alpha3, name: countryName(country.alpha3, country.name), flagCode: alpha2FromAlpha3(country.alpha3) })).sort((a,b) => a.name.localeCompare(b.name, locale)), [countryName, locale]);
  const selectedRef = useRef("");
  const workspaceRequest = useRef(0);
  const tripRequest = useRef(0);
  const mounted = useRef(true);
  const expenseRequest = useRef<{signature:string;id:string} | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; workspaceRequest.current++; tripRequest.current++; }; },[]);

  const loadTrips = useCallback(async () => {
    if (!accessToken) return;
    const request = ++tripRequest.current;
    setLoading(true);
    setError("");
    try {
      const next = await listSharedTrips(accessToken);
      if (mounted.current && request === tripRequest.current) setTrips(next);
    } catch (requestError) {
      if (mounted.current && request === tripRequest.current) setError(errorText(requestError, copy("Ortak seyahatler yüklenemedi.", "Shared trips could not be loaded.")));
    } finally {
      if (mounted.current && request === tripRequest.current) setLoading(false);
    }
  }, [accessToken, copy]);

  useEffect(() => { void loadTrips(); }, [loadTrips, refreshKey]);
  useEffect(() => {
    if (!initialInviteCode) return;
    setInviteCode(initialInviteCode);
    setEntry("join");
  }, [initialInviteCode]);
  useEffect(() => { if (initialEntry) setEntry(initialEntry); }, [initialEntry]);

  const loadWorkspace = useCallback(async (tripId: string) => {
    const request = ++workspaceRequest.current;
    setBusy("workspace");
    setError("");
    try {
      const next = await getTripCollaboration(tripId, accessToken);
      if (!mounted.current || request !== workspaceRequest.current || selectedRef.current !== tripId) return;
      setWorkspace(next);
      setBudgetAmount(next.budget.targetAmount ? String(next.budget.targetAmount) : "");
      setBudgetCurrency(next.budget.currency || "TRY");
      setPaidBy((current) => next.members.some((member) => member.userId === current) ? current : userId);
      setParticipantIds((current) => current.length && current.every((id) => next.members.some((member) => member.userId === id)) ? current : next.members.map((member) => member.userId));
    } catch (requestError) {
      if (!mounted.current || request !== workspaceRequest.current) return;
      setError(errorText(requestError, copy("Ortak seyahat açılmadı.", "The shared trip could not be opened.")));
      setWorkspace(null);
    } finally {
      if (mounted.current && request === workspaceRequest.current) setBusy("");
    }
  }, [accessToken, copy, userId]);

  const openTrip = (tripId: string) => {
    selectedRef.current = tripId;
    setSelectedTripId(tripId);
    setExpenseTitle(""); setExpenseAmount(""); expenseRequest.current = null;
    setWorkspace(null);
    setTab("team");
    setShareCode("");
    void loadWorkspace(tripId);
  };

  const createSharedTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const country = COUNTRY_LIST.find(item => item.alpha3 === newCountry);
    if (!country || !isCalendarDate(newStart) || !isCalendarDate(newEnd) || newEnd < newStart || busy || actionPending.current) return;
    actionPending.current = true;
    setBusy("create"); setError("");
    try {
      // Reuse the ordinary trip and its existing owner membership; invitations,
      // votes and expenses remain on the same backend record.
      const trip = await createCockpitTrip(userId, { destinationCountry: countryName(country.alpha3, country.name), destinationCode: alpha2FromAlpha3(country.alpha3), destinationCity: newCity.trim(), startDate: newStart, endDate: newEnd, appLanguage: locale }, accessToken);
      if (!mounted.current) return;
      const context = activeTripContextFromTrip(trip);
      if (context) writeActiveTripContext(userId, context);
      setEntry(null); setNewCity(""); setNewCountry(""); setNewStart(""); setNewEnd("");
      await loadTrips();
      openTrip(trip.id);
      onNotice(copy("Ortak seyahatin hazır. Arkadaşlarını davet edebilirsin.", "Your shared trip is ready. Invite your friends.", "Udhëtimi i përbashkët është gati. Fto miqtë e tu."));
    } catch (requestError) {
      if (mounted.current) setError(getSupabaseDataErrorMessage(requestError, copy("Seyahat oluşturulamadı. Bilgilerin duruyor; yeniden deneyebilirsin.", "The trip could not be created. Your details are kept; retry when ready.", "Udhëtimi nuk u krijua. Të dhënat ruhen; provo përsëri.")));
    } finally { actionPending.current = false; if (mounted.current) setBusy(current => current === "create" ? "" : current); }
  };

  const useTrip = () => {
    if (!workspace) return;
    const context = activeTripContextFromTrip(workspace.trip);
    if (context && writeActiveTripContext(userId, context)) onNotice(copy("Bu seyahat seçildi. Diğer araçlarda bilgilerini kullanabilirsin.", "Trip selected. You can use its details in the other tools.", "Udhëtimi u zgjodh. Mund t’i përdorësh të dhënat në mjetet e tjera."));
    else onNotice(copy("Seyahat seçimi kaydedilemedi.", "The trip selection could not be saved.", "Zgjedhja e udhëtimit nuk u ruajt."));
  };

  const closeWorkspace = () => {
    selectedRef.current = "";
    workspaceRequest.current++;
    setBusy("");
    setSelectedTripId("");
    setWorkspace(null);
    setShareCode("");
    setError("");
  };

  const mutate = async (key: string, body: Record<string, unknown>, notice?: string, closeAfter = false) => {
    if (busy || actionPending.current) return false;
    actionPending.current = true;
    const operationTrip = selectedRef.current;
    const stillHere = () => mounted.current && selectedRef.current === operationTrip;
    setBusy(key);
    setError("");
    try {
      await collaborationAction(accessToken, body);
      if (!mounted.current) return false;
      if (notice) onNotice(notice);
      if (closeAfter && stillHere()) closeWorkspace();
      await loadTrips();
      if (!closeAfter && stillHere()) await loadWorkspace(operationTrip);
      return stillHere();
    } catch (requestError) {
      if (stillHere()) setError(errorText(requestError, copy("İşlem tamamlanamadı.", "The action could not be completed.")));
      return false;
    } finally {
      actionPending.current = false;
      if (stillHere()) setBusy("");
    }
  };

  const acceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = tripInviteFromUrl(inviteCode);
    if (!code || busy || actionPending.current) return;
    actionPending.current = true;
    setBusy("accept");
    setError("");
    try {
      const result = await collaborationAction<{ data: { tripId: string }; message: string }>(accessToken, { action: "accept_invite", inviteCode: code });
      if (!mounted.current) return;
      setInviteCode("");
      rememberTripInvite("");
      onInviteHandled?.();
      onNotice(copy("Ortak seyahate katıldın.", "You joined the shared trip."));
      setEntry(null);
      await loadTrips();
      openTrip(result.data.tripId);
    } catch (requestError) {
      setError(errorText(requestError, copy("Davet kabul edilemedi.", "The invitation could not be accepted.")));
    } finally {
      actionPending.current = false;
      if (mounted.current && !selectedRef.current) setBusy("");
    }
  };

  const createInvite = async () => {
    if (!workspace || busy || actionPending.current) return;
    actionPending.current = true;
    setBusy("invite");
    setError("");
    try {
      const result = await collaborationAction<{ data: { inviteCode: string; inviteUrl: string; expiresAt: string } }>(accessToken, { action: "create_invite", tripId: workspace.trip.id, role: "editor" });
      if (!mounted.current || selectedRef.current !== workspace.trip.id) return;
      setShareCode(result.data.inviteUrl);
      const shared = await shareContent({
        title: copy("LetsGo2Travel ortak seyahat daveti", "LetsGo2Travel shared trip invitation"),
        text: copy(`“${workspace.trip.title}” seyahatimize katıl.`, `Join our “${workspace.trip.title}” trip.`, `Bashkohu me udhëtimin tonë “${workspace.trip.title}”.`),
        url: result.data.inviteUrl,
      });
      onNotice(shared ? copy("Davet paylaşım ekranı açıldı.", "The share sheet is open.") : copy("Davet bağlantısı hazır; aşağıdan kopyalayabilirsin.", "Invitation link ready; you can copy it below."));
    } catch (requestError) {
      setError(errorText(requestError, copy("Davet oluşturulamadı.", "The invitation could not be created.")));
    } finally {
      actionPending.current = false;
      if (mounted.current && selectedRef.current === workspace.trip.id) setBusy("");
    }
  };

  const copyInvite = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      onNotice(copy("Davet bağlantısı kopyalandı.", "Invitation link copied."));
    } catch {
      onNotice(copy("Kod kopyalanamadı; basılı tutarak kopyalayabilirsin.", "The code could not be copied; press and hold to copy."));
    }
  };

  const addOption = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || optionTitle.trim().length < 2) return;
    const saved = await mutate("option", { action: "add_option", tripId: workspace.trip.id, title: optionTitle, details: optionDetails, type: optionType }, copy("Öneri oylamaya açıldı.", "The suggestion is open for voting."));
    if (saved) { setOptionTitle(""); setOptionDetails(""); }
  };

  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace) return;
    await mutate("budget", { action: "set_budget", tripId: workspace.trip.id, targetAmount: budgetAmount || 0, currency: budgetCurrency }, copy("Ortak bütçe güncellendi.", "Shared budget updated."));
  };

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || !participantIds.length || !isCalendarDate(expenseDate) || expenseDate > localIsoDate()) return;
    const body = { action:"add_expense",tripId:workspace.trip.id,title:expenseTitle,amount:expenseAmount,spentAt:expenseDate,paidBy,participantIds,currency:workspace.budget.currency };
    const signature = JSON.stringify(body);
    if (expenseRequest.current?.signature !== signature) expenseRequest.current = {signature,id:createId()};
    const saved = await mutate("expense", { ...body,clientRequestId:expenseRequest.current.id }, copy("Masraf eşit olarak paylaştırıldı.", "The expense was split equally."));
    if (saved) { setExpenseTitle(""); setExpenseAmount(""); expenseRequest.current = null; }
  };

  const canEdit = workspace?.myRole === "owner" || workspace?.myRole === "editor";
  const totalSpent = useMemo(() => (workspace?.expenses.filter(expense => expense.currency === workspace.budget.currency).reduce((sum, expense) => sum + Math.round(expense.amount*100), 0) || 0) / 100, [workspace]);
  const progress = workspace?.budget.targetAmount ? Math.min(100, Math.round(totalSpent / workspace.budget.targetAmount * 100)) : 0;

  return <>
    <section className="trip-collaboration-hub">
      <div className="trip-entry-actions"><button type="button" onClick={() => { setError(""); setEntry("create"); }}><Icon name="plus" size={18}/>{copy("Ortak seyahat oluştur", "Create shared trip", "Krijo udhëtim të përbashkët")}</button><button type="button" onClick={() => { setError(""); setEntry("join"); }}><Icon name="users" size={18}/>{copy("Davetle katıl", "Join an invite", "Bashkohu me ftesë")}</button></div>

      {entry === "join" && <form className="trip-invite-join" onSubmit={acceptInvite}>
        <label>{copy("Davet bağlantısı veya kodu", "Invitation link or code")}<input value={inviteCode} maxLength={600} autoCapitalize="none" autoCorrect="off" onChange={(event) => setInviteCode(event.target.value.trim())} placeholder={copy("Arkadaşının bağlantısını buraya yapıştır", "Paste your friend’s invitation here")} /></label>
        <button type="submit" disabled={Boolean(busy) || !tripInviteFromUrl(inviteCode)}>{busy === "accept" ? <span className="button-loader dark" /> : <Icon name="users" size={18} />} {copy("Katıl", "Join")}</button>
      </form>}

      {entry === "create" && <form className="trip-create-form" onSubmit={createSharedTrip}>
        <CountryPicker label={copy("Gidilecek ülke", "Destination country", "Shteti i destinacionit")} placeholder={copy("Ülke seç", "Choose country", "Zgjidh shtetin")} value={newCountry} options={countryOptions} onChange={setNewCountry} disabled={Boolean(busy)}/>
        <label>{copy("Şehir (isteğe bağlı)", "City (optional)", "Qyteti (opsional)")}<input value={newCity} maxLength={100} onChange={event => setNewCity(event.target.value)} disabled={Boolean(busy)}/></label>
        <div className="trip-create-dates"><DateTimeField required type="date" label={copy("Başlangıç", "Start date", "Data e fillimit")} value={newStart} onChange={value => { setNewStart(value); if (!newEnd || newEnd < value) setNewEnd(value); }}/><DateTimeField required type="date" label={copy("Bitiş", "End date", "Data e mbarimit")} value={newEnd} min={newStart || undefined} onChange={setNewEnd}/></div>
        <p>{copy("Mevcut bir seyahate davet için aşağıdaki seyahati aç. Yeni seyahatin rotası, katılımcıları ve masrafları aynı yerde tutulur.", "To invite friends to an existing trip, open it below. A new trip keeps its route, people and expenses together.", "Për të ftuar miq në një udhëtim ekzistues, hape më poshtë. Rruga, pjesëmarrësit dhe shpenzimet ruhen bashkë.")}</p>
        <button type="submit" disabled={Boolean(busy) || !newCountry || !isCalendarDate(newStart) || !isCalendarDate(newEnd) || newEnd < newStart}>{busy === "create" ? <span className="button-loader dark"/> : <Icon name="plus" size={18}/>} {copy("Oluştur ve arkadaşlarını davet et", "Create and invite friends", "Krijo dhe fto miqtë")}</button>
      </form>}

      {error && !selectedTripId && <div className="trip-collaboration-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span><button onClick={() => void loadTrips()}>{copy("Yenile", "Retry")}</button></div>}
      {loading ? <div className="trip-collaboration-loading" role="status"><span className="button-loader dark" /> {copy("Ortak seyahatler yükleniyor", "Loading shared trips")}</div>
        : trips.length ? <div className="trip-collaboration-list">
          {trips.map((trip) => <button type="button" key={trip.id} onClick={() => openTrip(trip.id)}>
            <span className="trip-collaboration-flag" role={trip.destinationCode ? undefined : "img"} aria-label={trip.destinationCode ? undefined : copy("Seyahat", "Trip")}>{trip.destinationCode ? <CountryFlag code={trip.destinationCode} label={trip.destinationCountry || trip.destinationCode} /> : <Icon name="plane" size={23} />}</span>
            <span><strong>{trip.title}</strong><small>{dateText(trip.startDate, locale)} · {trip.memberCount} {copy("kişi", "people")}</small></span>
            <em>{copy(ROLE_LABELS[trip.role].tr, ROLE_LABELS[trip.role].en, ROLE_LABELS[trip.role].sq)}</em>
            <Icon name="chevron" size={18} />
          </button>)}
        </div>
        : <p className="trip-collaboration-empty">{copy("İlk ortak seyahatini oluştur veya arkadaşının davetiyle katıl.", "Create your first shared trip or join with a friend's invitation.", "Krijo udhëtimin e parë ose bashkohu me ftesën e një miku.")}</p>}
    </section>

    <Sheet open={Boolean(selectedTripId)} title={copy("Ortak seyahat", "Shared trip")} size="large" onClose={closeWorkspace}>
      {error && <div className="trip-collaboration-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
      {!workspace && error ? <button className="secondary-wide" type="button" onClick={() => void loadWorkspace(selectedTripId)}>{copy("Yeniden dene", "Retry")}</button> : !workspace || busy === "workspace" ? <div className="trip-workspace-loading"><span className="button-loader dark" /><p>{copy("Çalışma alanı hazırlanıyor…", "Preparing workspace…")}</p></div> : <div className="trip-workspace">
        <header className="trip-workspace-hero">
          <span className="trip-collaboration-artwork"><TravelToolArtwork kind="community" size={56} /></span>
          <div><small>{copy("ORTAK SEYAHAT", "SHARED TRIP")}</small><h3>{workspace.trip.title}</h3><p>{dateText(workspace.trip.startDate, locale)} – {dateText(workspace.trip.endDate, locale)} · {workspace.members.length} {copy("kişi", "people")}</p></div>
          {workspace.myRole === "owner" && <button type="button" onClick={() => void createInvite()} disabled={Boolean(busy)} aria-label={copy("Arkadaş davet et", "Invite a friend")}><Icon name="share" size={19} /></button>}
        </header>
        <div className="trip-workspace-actions"><button type="button" onClick={useTrip}><Icon name="check" size={17}/>{copy("Bu seyahati kullan", "Use this trip", "Përdor këtë udhëtim")}</button>{workspace.myRole === "owner" && <button type="button" onClick={() => void createInvite()} disabled={Boolean(busy)}><Icon name="share" size={17}/>{copy("Arkadaş davet et", "Invite friends", "Fto miqtë")}</button>}</div>
        <p className="trip-route-summary"><Icon name="route" size={18}/>{[workspace.trip.originIata, workspace.trip.destinationIata].filter(Boolean).join(" → ") || [workspace.trip.destinationCity, workspace.trip.destinationCountry].filter(Boolean).join(", ")}</p>

        {shareCode && <div className="trip-share-code"><span><small>{copy("7 gün geçerli davet bağlantısı", "Invitation link valid for 7 days")}</small><strong>{shareCode}</strong></span><button type="button" onClick={() => void copyInvite()}>{copy("Kopyala", "Copy")}</button></div>}

        <div className="trip-workspace-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "team"} className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}><Icon name="users" size={17} /> {copy("Ekip", "Team")}</button>
          <button type="button" role="tab" aria-selected={tab === "vote"} className={tab === "vote" ? "active" : ""} onClick={() => setTab("vote")}><Icon name="check" size={17} /> {copy("Oylama", "Voting")}</button>
          <button type="button" role="tab" aria-selected={tab === "budget"} className={tab === "budget" ? "active" : ""} onClick={() => setTab("budget")}><Icon name="wallet" size={17} /> {copy("Bütçe", "Budget")}</button>
        </div>

        {tab === "team" && <section className="trip-workspace-section">
          <div className="trip-workspace-title"><div><small>{copy("KATILIMCILAR", "PARTICIPANTS")}</small><h3>{copy("Kim ne yapabilir?", "Who can do what?")}</h3></div>{workspace.myRole === "owner" && <button type="button" onClick={() => void createInvite()} disabled={Boolean(busy)}><Icon name="plus" size={16} /> {copy("Davet et", "Invite")}</button>}</div>
          <p className="trip-workspace-note">{copy("Düzenleyiciler öneri, bütçe ve masraf ekler. İzleyiciler planı görür ve oy kullanır.", "Editors add suggestions, budgets and expenses. Viewers can see the plan and vote.")}</p>
          <div className="trip-member-list">{workspace.members.map((member) => <article key={member.userId}>
            <span>{member.name.slice(0, 1).toUpperCase()}</span>
            <div><strong>{member.name}{member.userId === userId ? copy(" · Sen", " · You") : ""}</strong><small>{copy(ROLE_LABELS[member.role].tr, ROLE_LABELS[member.role].en, ROLE_LABELS[member.role].sq)}</small></div>
            {workspace.myRole === "owner" && member.role !== "owner" ? <>
              <select aria-label={copy(`${member.name} yetkisi`, `${member.name} role`, `Roli i ${member.name}`)} value={member.role} disabled={Boolean(busy)} onChange={(event) => void mutate(`role-${member.userId}`, { action: "set_role", tripId: workspace.trip.id, userId: member.userId, role: event.target.value })}>
                <option value="editor">{copy("Düzenleyici", "Editor")}</option><option value="viewer">{copy("İzleyici", "Viewer")}</option>
              </select>
              <button type="button" className="trip-member-remove" disabled={Boolean(busy)} aria-label={copy("Katılımcıyı çıkar", "Remove participant")} onClick={() => window.confirm(copy(`${member.name} ortak seyahatten çıkarılsın mı?`, `Remove ${member.name} from the shared trip?`, `Të hiqet ${member.name} nga udhëtimi i përbashkët?`)) && void mutate(`remove-${member.userId}`, { action: "remove_member", tripId: workspace.trip.id, userId: member.userId })}><Icon name="close" size={16} /></button>
            </> : <em>{copy(ROLE_LABELS[member.role].tr, ROLE_LABELS[member.role].en, ROLE_LABELS[member.role].sq)}</em>}
          </article>)}</div>
          {workspace.myRole !== "owner" && <button type="button" className="danger-wide" disabled={Boolean(busy)} onClick={() => window.confirm(copy("Bu ortak seyahatten ayrılmak istiyor musun?", "Do you want to leave this shared trip?")) && void mutate("leave", { action: "leave_trip", tripId: workspace.trip.id }, copy("Ortak seyahatten ayrıldın.", "You left the shared trip."), true)}>{copy("Ortak seyahatten ayrıl", "Leave shared trip")}</button>}
        </section>}

        {tab === "vote" && <section className="trip-workspace-section">
          <div className="trip-workspace-title"><div><small>{copy("BİRLİKTE KARAR VER", "DECIDE TOGETHER")}</small><h3>{copy("Plan önerileri", "Plan suggestions")}</h3></div><span>{workspace.options.length}</span></div>
          {canEdit && <form className="trip-option-form" onSubmit={addOption}>
            <select value={optionType} onChange={(event) => setOptionType(event.target.value)} aria-label={copy("Öneri türü", "Suggestion type")}><option value="activity">{copy("Aktivite", "Activity")}</option><option value="route">{copy("Rota", "Route")}</option><option value="stay">{copy("Konaklama", "Stay")}</option><option value="transport">{copy("Ulaşım", "Transport")}</option><option value="other">{copy("Diğer", "Other")}</option></select>
            <input value={optionTitle} maxLength={120} onChange={(event) => setOptionTitle(event.target.value)} placeholder={copy("Örn. Louvre Müzesi", "E.g. Louvre Museum")} aria-label={copy("Öneri başlığı", "Suggestion title")} />
            <textarea value={optionDetails} maxLength={600} onChange={(event) => setOptionDetails(event.target.value)} placeholder={copy("Neden iyi bir seçenek? (isteğe bağlı)", "Why is it a good option? (optional)")} aria-label={copy("Öneri açıklaması", "Suggestion details")} />
            <button type="submit" disabled={Boolean(busy) || optionTitle.trim().length < 2}><Icon name="plus" size={17} /> {copy("Oylamaya aç", "Start vote")}</button>
          </form>}
          <div className="trip-option-list">{workspace.options.map((option) => <article key={option.id} className={option.votedByMe ? "voted" : ""}>
            <div><small>{option.type === "route" ? copy("Rota", "Route") : option.type === "stay" ? copy("Konaklama", "Stay") : option.type === "transport" ? copy("Ulaşım", "Transport") : option.type === "activity" ? copy("Aktivite", "Activity") : copy("Diğer", "Other")}</small><strong>{option.title}</strong>{option.details && <p>{option.details}</p>}<em>{option.creatorName}</em></div>
            <button type="button" aria-pressed={option.votedByMe} disabled={Boolean(busy)} onClick={() => void mutate(`vote-${option.id}`, { action: "toggle_vote", tripId: workspace.trip.id, optionId: option.id })}><Icon name="check" size={17} /><strong>{option.voteCount}</strong><small>{option.votedByMe ? copy("Oy verdin", "Voted") : copy("Oy ver", "Vote")}</small></button>
            {(workspace.myRole === "owner" || option.createdBy === userId) && <button type="button" className="trip-option-delete" disabled={Boolean(busy)} aria-label={copy("Öneriyi sil", "Delete suggestion")} onClick={() => void mutate(`delete-option-${option.id}`, { action: "delete_option", tripId: workspace.trip.id, optionId: option.id })}><Icon name="trash" size={15} /></button>}
          </article>)}{!workspace.options.length && <p className="trip-workspace-empty">{copy("Henüz öneri yok. İlk rota, konaklama veya aktivite fikrini ekle.", "No suggestions yet. Add the first route, stay or activity idea.")}</p>}</div>
        </section>}

        {tab === "budget" && <section className="trip-workspace-section">
          <div className="trip-budget-summary">
            <span className="trip-collaboration-artwork"><TravelToolArtwork kind="money" size={56} /></span><div><small>{copy("TOPLAM HARCAMA", "TOTAL SPEND")}</small><strong>{moneyText(totalSpent, workspace.budget.currency, locale)}</strong><p>{workspace.budget.targetAmount ? copy(`${moneyText(workspace.budget.targetAmount, workspace.budget.currency, locale)} bütçenin %${progress}'i`, `${progress}% of ${moneyText(workspace.budget.targetAmount, workspace.budget.currency, locale)} budget`, `${progress}% e buxhetit prej ${moneyText(workspace.budget.targetAmount, workspace.budget.currency, locale)}`) : copy("Henüz hedef bütçe belirlenmedi", "No target budget yet")}</p></div>
            <em>{progress}%</em>
          </div>
          {workspace.expenses.some(expense => expense.currency !== workspace.budget.currency) && <p className="trip-collaboration-error" role="alert">{copy("Eski kayıtların para birimleri farklı. Toplam yalnız bütçenin para birimini içerir; bakiyeler ayrı gösterilir.", "Older entries use different currencies. The total includes only the budget currency; balances are shown separately.")}</p>}
          <progress className="trip-budget-progress" value={progress} max={100} aria-label={copy("Bütçe kullanım oranı", "Budget usage")} />
          {canEdit && <form className="trip-budget-form" onSubmit={saveBudget}>
            <label>{copy("Hedef bütçe", "Target budget")}<input type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="25000" /></label>
            <label>{copy("Para birimi", "Currency")}<select disabled={workspace.expenses.length > 0 && workspace.expenses.every(expense => expense.currency === workspace.budget.currency)} value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value)}><option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="AED">AED</option></select></label>
            <button type="submit" disabled={Boolean(busy)}>{copy("Bütçeyi kaydet", "Save budget")}</button>
          </form>}

          <div className="trip-balance-list"><h3>{copy("Kim alacak, kim ödeyecek?", "Who receives and who owes?")}</h3>{workspace.balances.map((balance) => <div key={`${balance.userId}:${balance.currency}`}><span>{balance.name}</span><strong className={balance.balance < 0 ? "owes" : balance.balance > 0 ? "receives" : ""}>{balance.balance > 0 ? "+" : ""}{moneyText(balance.balance, balance.currency || workspace.budget.currency, locale)}</strong></div>)}</div>

          {canEdit && <form className="trip-expense-form" onSubmit={addExpense}>
            <h3>{copy("Yeni masraf ekle", "Add expense")}</h3>
            <input value={expenseTitle} maxLength={120} onChange={(event) => setExpenseTitle(event.target.value)} placeholder={copy("Örn. Akşam yemeği", "E.g. Dinner")} aria-label={copy("Masraf adı", "Expense name")} />
            <div><label>{copy("Tutar", "Amount")}<input type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0.00" aria-label={copy("Masraf tutarı", "Expense amount")} /></label><DateTimeField type="date" label={copy("Masraf tarihi", "Expense date")} required value={expenseDate} max={localIsoDate(0)} onChange={setExpenseDate} /></div>
            <label>{copy("Kim ödedi?", "Who paid?")}<select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{workspace.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
            <fieldset><legend>{copy("Kimler arasında bölünsün?", "Split between whom?")}</legend>{workspace.members.map((member) => <label key={member.userId}><input type="checkbox" checked={participantIds.includes(member.userId)} onChange={(event) => setParticipantIds((current) => event.target.checked ? [...new Set([...current, member.userId])] : current.filter((id) => id !== member.userId))} /> <span>{member.name}</span></label>)}</fieldset>
            <button type="submit" disabled={Boolean(busy) || expenseTitle.trim().length < 2 || (!Number.isFinite(Number(expenseAmount)) || Number(expenseAmount) <= 0) || !participantIds.length || !isCalendarDate(expenseDate) || expenseDate > localIsoDate()}><Icon name="plus" size={17} /> {copy("Eşit böl ve ekle", "Split equally and add")}</button>
          </form>}

          <div className="trip-expense-list"><h3>{copy("Masraflar", "Expenses")}</h3>{workspace.expenses.map((expense) => <article key={expense.id}>
            <span><Icon name="wallet" size={17} /></span><div><strong>{expense.title}</strong><small>{expense.paidByName} · {dateText(expense.spentAt, locale)} · {expense.shares.length} {copy("kişi", "people")}</small></div><em>{moneyText(expense.amount, expense.currency, locale)}</em>
            {(workspace.myRole === "owner" || expense.createdBy === userId) && <button type="button" disabled={Boolean(busy)} aria-label={copy("Masrafı sil", "Delete expense")} onClick={() => void mutate(`delete-expense-${expense.id}`, { action: "delete_expense", tripId: workspace.trip.id, expenseId: expense.id })}><Icon name="trash" size={15} /></button>}
          </article>)}{!workspace.expenses.length && <p className="trip-workspace-empty">{copy("Henüz masraf eklenmedi.", "No expenses yet.")}</p>}</div>
        </section>}
      </div>}
    </Sheet>
  </>;
}
