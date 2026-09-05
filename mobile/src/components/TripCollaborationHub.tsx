import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { localIsoDate } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { shareContent } from "../lib/native";
import {
  collaborationAction,
  getTripCollaboration,
  listSharedTrips,
  type SharedTripSummary,
  type TripCollaborationWorkspace,
  type TripMemberRole,
} from "../lib/tripCollaboration";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

type CollaborationTab = "team" | "vote" | "budget";

type TripCollaborationHubProps = {
  accessToken: string;
  userId: string;
  refreshKey: string;
  initialInviteCode?: string;
  onInviteHandled?: () => void;
  onNotice: (message: string) => void;
};

const ROLE_LABELS: Record<TripMemberRole, { tr: string; en: string }> = {
  owner: { tr: "Sahip", en: "Owner" },
  editor: { tr: "Düzenleyici", en: "Editor" },
  viewer: { tr: "İzleyici", en: "Viewer" },
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function moneyText(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function dateText(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

export function TripCollaborationHub({ accessToken, userId, refreshKey, initialInviteCode, onInviteHandled, onNotice }: TripCollaborationHubProps) {
  const { copy, locale } = useI18n();
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

  const loadTrips = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      setTrips(await listSharedTrips(accessToken));
    } catch (requestError) {
      setError(errorText(requestError, copy("Ortak seyahatler yüklenemedi.", "Shared trips could not be loaded.")));
    } finally {
      setLoading(false);
    }
  }, [accessToken, copy]);

  useEffect(() => { void loadTrips(); }, [loadTrips, refreshKey]);
  useEffect(() => {
    if (!initialInviteCode) return;
    setInviteCode(initialInviteCode);
  }, [initialInviteCode]);

  const loadWorkspace = useCallback(async (tripId: string) => {
    setBusy("workspace");
    setError("");
    try {
      const next = await getTripCollaboration(tripId, accessToken);
      setWorkspace(next);
      setBudgetAmount(next.budget.targetAmount ? String(next.budget.targetAmount) : "");
      setBudgetCurrency(next.budget.currency || "TRY");
      setPaidBy((current) => next.members.some((member) => member.userId === current) ? current : userId);
      setParticipantIds((current) => current.length && current.every((id) => next.members.some((member) => member.userId === id)) ? current : next.members.map((member) => member.userId));
    } catch (requestError) {
      setError(errorText(requestError, copy("Ortak seyahat açılmadı.", "The shared trip could not be opened.")));
      setWorkspace(null);
    } finally {
      setBusy("");
    }
  }, [accessToken, copy, userId]);

  const openTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    setWorkspace(null);
    setTab("team");
    setShareCode("");
    void loadWorkspace(tripId);
  };

  const closeWorkspace = () => {
    setSelectedTripId("");
    setWorkspace(null);
    setShareCode("");
    setError("");
  };

  const mutate = async (key: string, body: Record<string, unknown>, notice?: string, closeAfter = false) => {
    if (busy) return false;
    setBusy(key);
    setError("");
    try {
      await collaborationAction(accessToken, body);
      if (notice) onNotice(notice);
      if (closeAfter) closeWorkspace();
      await loadTrips();
      if (!closeAfter && selectedTripId) await loadWorkspace(selectedTripId);
      return true;
    } catch (requestError) {
      setError(errorText(requestError, copy("İşlem tamamlanamadı.", "The action could not be completed.")));
      return false;
    } finally {
      setBusy("");
    }
  };

  const acceptInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = inviteCode.trim();
    if (code.length < 20 || busy) return;
    setBusy("accept");
    setError("");
    try {
      const result = await collaborationAction<{ data: { tripId: string }; message: string }>(accessToken, { action: "accept_invite", inviteCode: code });
      setInviteCode("");
      onInviteHandled?.();
      onNotice(copy("Ortak seyahate katıldın.", "You joined the shared trip."));
      await loadTrips();
      openTrip(result.data.tripId);
    } catch (requestError) {
      setError(errorText(requestError, copy("Davet kabul edilemedi.", "The invitation could not be accepted.")));
    } finally {
      setBusy("");
    }
  };

  const createInvite = async () => {
    if (!workspace || busy) return;
    setBusy("invite");
    setError("");
    try {
      const result = await collaborationAction<{ data: { inviteCode: string; inviteUrl: string; expiresAt: string } }>(accessToken, { action: "create_invite", tripId: workspace.trip.id, role: "editor" });
      setShareCode(result.data.inviteCode);
      const shared = await shareContent({
        title: copy("LetsGo2Travel ortak seyahat daveti", "LetsGo2Travel shared trip invitation"),
        text: copy(`“${workspace.trip.title}” seyahatimize katıl. Davet kodu: ${result.data.inviteCode}`, `Join our “${workspace.trip.title}” trip. Invitation code: ${result.data.inviteCode}`),
        url: result.data.inviteUrl,
      });
      onNotice(shared ? copy("Davet paylaşım ekranı açıldı.", "The share sheet is open.") : copy("Davet kodu hazır; aşağıdan kopyalayabilirsin.", "Invitation code ready; you can copy it below."));
    } catch (requestError) {
      setError(errorText(requestError, copy("Davet oluşturulamadı.", "The invitation could not be created.")));
    } finally {
      setBusy("");
    }
  };

  const copyInvite = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      onNotice(copy("Davet kodu kopyalandı.", "Invitation code copied."));
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
    if (!workspace || !participantIds.length) return;
    const saved = await mutate("expense", { action: "add_expense", tripId: workspace.trip.id, title: expenseTitle, amount: expenseAmount, spentAt: expenseDate, paidBy, participantIds }, copy("Masraf eşit olarak paylaştırıldı.", "The expense was split equally."));
    if (saved) { setExpenseTitle(""); setExpenseAmount(""); }
  };

  const canEdit = workspace?.myRole === "owner" || workspace?.myRole === "editor";
  const totalSpent = useMemo(() => workspace?.expenses.reduce((sum, expense) => sum + expense.amount, 0) || 0, [workspace]);
  const progress = workspace?.budget.targetAmount ? Math.min(100, Math.round(totalSpent / workspace.budget.targetAmount * 100)) : 0;

  return <>
    <section className="trip-collaboration-hub">
      <div className="trip-collaboration-heading">
        <span><Icon name="users" size={23} /></span>
        <div><small>{copy("BİRLİKTE PLANLA", "PLAN TOGETHER")}</small><h2>{copy("Ortak seyahat", "Shared trip")}</h2><p>{copy("Arkadaşlarını davet et; rotayı oylayın ve masrafları birlikte takip edin.", "Invite friends, vote on the route and track expenses together.")}</p></div>
      </div>

      <form className="trip-invite-join" onSubmit={acceptInvite}>
        <label>{copy("Davet kodun var mı?", "Have an invitation code?")}<input value={inviteCode} maxLength={200} autoCapitalize="none" autoCorrect="off" onChange={(event) => setInviteCode(event.target.value.trim())} placeholder={copy("Davet kodunu yapıştır", "Paste invitation code")} /></label>
        <button type="submit" disabled={Boolean(busy) || inviteCode.trim().length < 20}>{busy === "accept" ? <span className="button-loader dark" /> : <Icon name="users" size={18} />} {copy("Katıl", "Join")}</button>
      </form>

      {error && !selectedTripId && <div className="trip-collaboration-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span><button onClick={() => void loadTrips()}>{copy("Yenile", "Retry")}</button></div>}
      {loading ? <div className="trip-collaboration-loading" role="status"><span className="button-loader dark" /> {copy("Ortak seyahatler yükleniyor", "Loading shared trips")}</div>
        : trips.length ? <div className="trip-collaboration-list">
          {trips.map((trip) => <button type="button" key={trip.id} onClick={() => openTrip(trip.id)}>
            <span className="trip-collaboration-flag">{trip.destinationCode ? String.fromCodePoint(...trip.destinationCode.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0))) : "✈️"}</span>
            <span><strong>{trip.title}</strong><small>{dateText(trip.startDate, locale)} · {trip.memberCount} {copy("kişi", "people")}</small></span>
            <em>{copy(ROLE_LABELS[trip.role].tr, ROLE_LABELS[trip.role].en)}</em>
            <Icon name="chevron" size={18} />
          </button>)}
        </div>
        : <p className="trip-collaboration-empty">{copy("Bir seyahat eklediğinde burada davet oluşturabilir; arkadaşından gelen kodla da doğrudan katılabilirsin.", "Add a trip to create an invitation here, or join directly with a friend's code.")}</p>}
    </section>

    <Sheet open={Boolean(selectedTripId)} title={copy("Ortak seyahat", "Shared trip")} size="large" onClose={closeWorkspace}>
      {error && <div className="trip-collaboration-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
      {!workspace || busy === "workspace" ? <div className="trip-workspace-loading"><span className="button-loader dark" /><p>{copy("Çalışma alanı hazırlanıyor…", "Preparing workspace…")}</p></div> : <div className="trip-workspace">
        <header className="trip-workspace-hero">
          <span><Icon name="users" size={25} /></span>
          <div><small>{copy("ORTAK SEYAHAT", "SHARED TRIP")}</small><h3>{workspace.trip.title}</h3><p>{dateText(workspace.trip.startDate, locale)} – {dateText(workspace.trip.endDate, locale)} · {workspace.members.length} {copy("kişi", "people")}</p></div>
          {workspace.myRole === "owner" && <button type="button" onClick={() => void createInvite()} disabled={Boolean(busy)} aria-label={copy("Arkadaş davet et", "Invite a friend")}><Icon name="share" size={19} /></button>}
        </header>

        {shareCode && <div className="trip-share-code"><span><small>{copy("7 gün geçerli davet kodu", "Invitation code valid for 7 days")}</small><strong>{shareCode}</strong></span><button type="button" onClick={() => void copyInvite()}>{copy("Kopyala", "Copy")}</button></div>}

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
            <div><strong>{member.name}{member.userId === userId ? copy(" · Sen", " · You") : ""}</strong><small>{copy(ROLE_LABELS[member.role].tr, ROLE_LABELS[member.role].en)}</small></div>
            {workspace.myRole === "owner" && member.role !== "owner" ? <>
              <select aria-label={copy(`${member.name} yetkisi`, `${member.name} role`)} value={member.role} disabled={Boolean(busy)} onChange={(event) => void mutate(`role-${member.userId}`, { action: "set_role", tripId: workspace.trip.id, userId: member.userId, role: event.target.value })}>
                <option value="editor">{copy("Düzenleyici", "Editor")}</option><option value="viewer">{copy("İzleyici", "Viewer")}</option>
              </select>
              <button type="button" className="trip-member-remove" disabled={Boolean(busy)} aria-label={copy("Katılımcıyı çıkar", "Remove participant")} onClick={() => window.confirm(copy(`${member.name} ortak seyahatten çıkarılsın mı?`, `Remove ${member.name} from the shared trip?`)) && void mutate(`remove-${member.userId}`, { action: "remove_member", tripId: workspace.trip.id, userId: member.userId })}><Icon name="close" size={16} /></button>
            </> : <em>{copy(ROLE_LABELS[member.role].tr, ROLE_LABELS[member.role].en)}</em>}
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
            <span><Icon name="wallet" size={22} /></span><div><small>{copy("TOPLAM HARCAMA", "TOTAL SPEND")}</small><strong>{moneyText(totalSpent, workspace.budget.currency, locale)}</strong><p>{workspace.budget.targetAmount ? copy(`${moneyText(workspace.budget.targetAmount, workspace.budget.currency, locale)} bütçenin %${progress}'i`, `${progress}% of ${moneyText(workspace.budget.targetAmount, workspace.budget.currency, locale)} budget`) : copy("Henüz hedef bütçe belirlenmedi", "No target budget yet")}</p></div>
            <em>{progress}%</em>
          </div>
          <progress className="trip-budget-progress" value={progress} max={100} aria-label={copy("Bütçe kullanım oranı", "Budget usage")} />
          {canEdit && <form className="trip-budget-form" onSubmit={saveBudget}>
            <label>{copy("Hedef bütçe", "Target budget")}<input type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} placeholder="25000" /></label>
            <label>{copy("Para birimi", "Currency")}<select value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value)}><option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="AED">AED</option></select></label>
            <button type="submit" disabled={Boolean(busy)}>{copy("Bütçeyi kaydet", "Save budget")}</button>
          </form>}

          <div className="trip-balance-list"><h3>{copy("Kim alacak, kim ödeyecek?", "Who receives and who owes?")}</h3>{workspace.balances.map((balance) => <div key={balance.userId}><span>{balance.name}</span><strong className={balance.balance < 0 ? "owes" : balance.balance > 0 ? "receives" : ""}>{balance.balance > 0 ? "+" : ""}{moneyText(balance.balance, workspace.budget.currency, locale)}</strong></div>)}</div>

          {canEdit && <form className="trip-expense-form" onSubmit={addExpense}>
            <h3>{copy("Yeni masraf ekle", "Add expense")}</h3>
            <input value={expenseTitle} maxLength={120} onChange={(event) => setExpenseTitle(event.target.value)} placeholder={copy("Örn. Akşam yemeği", "E.g. Dinner")} aria-label={copy("Masraf adı", "Expense name")} />
            <div><input type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="0.00" aria-label={copy("Masraf tutarı", "Expense amount")} /><input type="date" value={expenseDate} max={localIsoDate(0)} onChange={(event) => setExpenseDate(event.target.value)} aria-label={copy("Masraf tarihi", "Expense date")} /></div>
            <label>{copy("Kim ödedi?", "Who paid?")}<select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>{workspace.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
            <fieldset><legend>{copy("Kimler arasında bölünsün?", "Split between whom?")}</legend>{workspace.members.map((member) => <label key={member.userId}><input type="checkbox" checked={participantIds.includes(member.userId)} onChange={(event) => setParticipantIds((current) => event.target.checked ? [...new Set([...current, member.userId])] : current.filter((id) => id !== member.userId))} /> <span>{member.name}</span></label>)}</fieldset>
            <button type="submit" disabled={Boolean(busy) || expenseTitle.trim().length < 2 || Number(expenseAmount) <= 0 || !participantIds.length}><Icon name="plus" size={17} /> {copy("Eşit böl ve ekle", "Split equally and add")}</button>
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
