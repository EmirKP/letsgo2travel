import { parseTripInvite } from "@/lib/trip-invite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authenticated-user";

export const dynamic = "force-dynamic";

type MemberRole = "owner" | "editor" | "viewer";
type ActionBody = Record<string, unknown>;

const OPTION_TYPES = new Set(["route", "stay", "activity", "transport", "other"]);
function cleanText(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function uuid(value: unknown) {
  const clean = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean) ? clean : "";
}

function inviteHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : Number.NaN;
}

function databaseUnavailable(error: { code?: string } | null | undefined) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function collaborationWriteError(error: { code?: string; message?: string }) {
  const missing = error.code === "PGRST202" || error.code === "42883";
  const currency = error.message?.includes("currency_locked");
  const forbidden = error.message?.includes("trip_forbidden");
  return NextResponse.json({ error: missing ? "Ortak masraflar için Build 24 veritabanı güncellemesi gerekli." : currency ? "Masrafların para birimi farklı. Bütçeyi mevcut masrafların para birimine ayarla." : forbidden ? "Bu seyahati düzenleme yetkin yok." : "İşlem kaydedilemedi; yeniden deneyebilirsin.", code: missing ? "COLLAB_SCHEMA_MISSING" : currency ? "CURRENCY_CONFLICT" : "COLLAB_WRITE_FAILED" }, { status: missing ? 503 : currency ? 409 : forbidden ? 403 : 500 });
}

async function memberFor(supabase: any, tripId: string, userId: string) {
  const { data, error } = await supabase
    .from("trip_members")
    .select("trip_id,user_id,role,joined_at")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  return { member: data as { trip_id: string; user_id: string; role: MemberRole; joined_at: string } | null, error };
}

async function requireTripMember(supabase: any, tripId: string, userId: string, edit = false) {
  const result = await memberFor(supabase, tripId, userId);
  if (result.error) return { error: NextResponse.json({ error: "Ortak seyahat bilgileri okunamadı." }, { status: databaseUnavailable(result.error) ? 503 : 500 }) };
  if (!result.member) return { error: NextResponse.json({ error: "Bu seyahate erişim yetkin yok." }, { status: 403 }) };
  if (edit && result.member.role === "viewer") return { error: NextResponse.json({ error: "Bu seyahatte yalnızca görüntüleme yetkin var." }, { status: 403 }) };
  return { member: result.member };
}


function titleForTrip(trip: any) {
  return [trip?.destination_city, trip?.destination_country].filter(Boolean).join(", ") || "Seyahat";
}

async function tripSummaries(supabase: any, userId: string) {
  const { data: memberships, error } = await supabase
    .from("trip_members")
    .select("trip_id,role,joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (error) return { data: [], error };
  const ids = (memberships || []).map((item: any) => item.trip_id);
  if (!ids.length) return { data: [], error: null };
  const [{ data: trips, error: tripError }, { data: memberRows, error: countError }] = await Promise.all([
    supabase.from("trips").select("id,user_id,destination_country,destination_code,destination_city,start_date,end_date,departure_at,arrival_at,origin_iata,destination_iata,status,updated_at").in("id", ids),
    supabase.from("trip_members").select("trip_id").in("trip_id", ids),
  ]);
  if (tripError || countError) return { data: [], error: tripError || countError };
  const tripMap = new Map((trips || []).map((trip: any) => [trip.id, trip]));
  const counts = new Map<string, number>();
  for (const row of memberRows || []) counts.set(row.trip_id, (counts.get(row.trip_id) || 0) + 1);
  return {
    data: (memberships || []).flatMap((membership: any) => {
      const trip: any = tripMap.get(membership.trip_id);
      if (!trip) return [];
      return [{
        id: trip.id,
        ownerId: trip.user_id,
        role: membership.role,
        memberCount: counts.get(trip.id) || 1,
        title: titleForTrip(trip),
        destinationCountry: trip.destination_country,
        destinationCode: trip.destination_code,
        destinationCity: trip.destination_city,
        startDate: trip.start_date,
        endDate: trip.end_date,
        departureAt: trip.departure_at,
        arrivalAt: trip.arrival_at,
        originIata: trip.origin_iata,
        destinationIata: trip.destination_iata,
        status: trip.status,
        updatedAt: trip.updated_at,
      }];
    }),
    error: null,
  };
}

async function workspace(supabase: any, tripId: string, userId: string) {
  const access = await requireTripMember(supabase, tripId, userId);
  if ("error" in access) return access;

  const [tripResult, membersResult, optionsResult, budgetResult, expensesResult] = await Promise.all([
    supabase.from("trips").select("id,user_id,destination_country,destination_code,destination_city,start_date,end_date,departure_at,arrival_at,origin_iata,destination_iata,status,updated_at").eq("id", tripId).single(),
    supabase.from("trip_members").select("trip_id,user_id,role,joined_at").eq("trip_id", tripId).order("joined_at"),
    supabase.from("trip_plan_options").select("id,trip_id,created_by,option_type,title,details,created_at").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("trip_budgets").select("trip_id,currency,target_amount,updated_at").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_expenses").select("id,trip_id,paid_by,created_by,title,amount,currency,spent_at,created_at").eq("trip_id", tripId).order("spent_at", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const firstError = [tripResult, membersResult, optionsResult, budgetResult, expensesResult].find((result) => result.error)?.error;
  if (firstError) return { error: NextResponse.json({ error: "Ortak seyahat çalışma alanı yüklenemedi." }, { status: 500 }) };

  const members = membersResult.data || [];
  const memberIds = members.map((item: any) => item.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id,full_name,username").in("id", memberIds)
    : { data: [] };
  const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  const namedMembers = members.map((member: any) => {
    const profile: any = profileMap.get(member.user_id);
    return {
      userId: member.user_id,
      role: member.role,
      joinedAt: member.joined_at,
      name: cleanText(profile?.full_name || profile?.username, 80) || `Gezgin ${member.user_id.slice(0, 4)}`,
    };
  });
  const memberSet = new Set(memberIds);
  const optionIds = new Set((optionsResult.data || []).map((item: any) => item.id));
  const expenseIds = new Set((expensesResult.data || []).map((item: any) => item.id));
  const [votesResult, sharesResult] = await Promise.all([
    optionIds.size ? supabase.from("trip_plan_votes").select("option_id,user_id,created_at").in("option_id", [...optionIds]) : Promise.resolve({ data: [], error: null }),
    expenseIds.size ? supabase.from("trip_expense_shares").select("expense_id,user_id,amount").in("expense_id", [...expenseIds]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (votesResult.error || sharesResult.error) return { error: NextResponse.json({ error: "Ortak seyahat ayrıntıları yüklenemedi." }, { status: 500 }) };
  const votes = (votesResult.data || []).filter((vote: any) => memberSet.has(vote.user_id));
  const shares = (sharesResult.data || []).filter((share: any) => memberSet.has(share.user_id));
  const nameMap = new Map(namedMembers.map((member: any) => [member.userId, member.name]));
  const options = (optionsResult.data || []).map((option: any) => ({
    id: option.id,
    type: option.option_type,
    title: option.title,
    details: option.details,
    createdBy: option.created_by,
    creatorName: nameMap.get(option.created_by) || "Gezgin",
    voteCount: votes.filter((vote: any) => vote.option_id === option.id).length,
    votedByMe: votes.some((vote: any) => vote.option_id === option.id && vote.user_id === userId),
    createdAt: option.created_at,
  }));
  const expenses = (expensesResult.data || []).map((expense: any) => ({
    id: expense.id,
    title: expense.title,
    amount: Number(expense.amount),
    currency: expense.currency,
    paidBy: expense.paid_by,
    paidByName: nameMap.get(expense.paid_by) || "Gezgin",
    createdBy: expense.created_by,
    spentAt: expense.spent_at,
    shares: shares.filter((share: any) => share.expense_id === expense.id).map((share: any) => ({ userId: share.user_id, amount: Number(share.amount) })),
  }));
  const currencies = [...new Set(expenses.map((expense: any) => expense.currency))];
  const balances = namedMembers.flatMap((member: any) => (currencies.length ? currencies : [budgetResult.data?.currency || "TRY"]).map((currency) => {
    const sameCurrency = expenses.filter((expense: any) => expense.currency === currency);
    const paid = sameCurrency.filter((expense: any) => expense.paidBy === member.userId).reduce((sum: number, expense: any) => sum + Math.round(expense.amount * 100), 0);
    const owes = sameCurrency.flatMap((expense: any) => expense.shares).filter((share: any) => share.userId === member.userId).reduce((sum: number, share: any) => sum + Math.round(share.amount * 100), 0);
    return { userId: member.userId, name: member.name, currency, balance: (paid - owes) / 100 };
  }));
  const trip = tripResult.data;
  return { data: {
    trip: {
      id: trip.id,
      ownerId: trip.user_id,
      title: titleForTrip(trip),
      destinationCountry: trip.destination_country,
      destinationCode: trip.destination_code,
      destinationCity: trip.destination_city,
      startDate: trip.start_date,
      endDate: trip.end_date,
      departureAt: trip.departure_at,
      arrivalAt: trip.arrival_at,
      originIata: trip.origin_iata,
      destinationIata: trip.destination_iata,
      status: trip.status,
    },
    myRole: access.member.role,
    members: namedMembers,
    options,
    budget: budgetResult.data ? { currency: budgetResult.data.currency, targetAmount: Number(budgetResult.data.target_amount), updatedAt: budgetResult.data.updated_at } : { currency: "TRY", targetAmount: 0, updatedAt: null },
    expenses,
    balances,
  } };
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const tripId = uuid(new URL(request.url).searchParams.get("tripId"));
  if (!tripId) {
    const result = await tripSummaries(auth.supabase, auth.user.id);
    if (result.error) return NextResponse.json({ error: databaseUnavailable(result.error) ? "Ortak seyahat özelliği için veritabanı güncellemesi bekleniyor." : "Ortak seyahatler yüklenemedi.", code: databaseUnavailable(result.error) ? "COLLAB_SCHEMA_MISSING" : "COLLAB_LOAD_FAILED" }, { status: databaseUnavailable(result.error) ? 503 : 500 });
    return NextResponse.json({ data: result.data });
  }
  const result = await workspace(auth.supabase, tripId, auth.user.id);
  if ("error" in result) return result.error;
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 30_000) return NextResponse.json({ error: "İstek çok büyük." }, { status: 413 });
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  let body: ActionBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const action = cleanText(body.action, 40);

  if (action === "accept_invite") {
    const inviteCode = parseTripInvite(typeof body.inviteCode === "string" ? body.inviteCode : "");
    if (!inviteCode) return NextResponse.json({ error: "Davet kodu geçersiz." }, { status: 400 });
    const { data, error } = await supabase.rpc("accept_trip_invite", { p_token_hash: inviteHash(inviteCode), p_user_id: user.id });
    if (error || !data) return NextResponse.json({ error: error?.message?.includes("invite_invalid") ? "Davet geçersiz, süresi dolmuş veya kullanım sınırına ulaşmış." : "Davet kabul edilemedi." }, { status: error?.message?.includes("invite_invalid") ? 410 : 500 });
    return NextResponse.json({ data: { tripId: data }, message: "Ortak seyahate katıldın." });
  }

  const tripId = uuid(body.tripId);
  if (!tripId) return NextResponse.json({ error: "Seyahat seçimi geçersiz." }, { status: 400 });
  const access = await requireTripMember(supabase, tripId, user.id, !["toggle_vote", "leave_trip"].includes(action));
  if ("error" in access) return access.error;

  if (action === "create_invite") {
    if (access.member.role !== "owner") return NextResponse.json({ error: "Davet bağlantısını yalnızca seyahat sahibi oluşturabilir." }, { status: 403 });
    const invitedRole: MemberRole = body.role === "viewer" ? "viewer" : "editor";
    const rawToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("trip_invites").insert({ trip_id: tripId, created_by: user.id, token_hash: inviteHash(rawToken), invited_role: invitedRole, expires_at: expiresAt, max_uses: 12 });
    if (error) return NextResponse.json({ error: "Davet oluşturulamadı." }, { status: 500 });
    const origin = new URL(request.url).origin;
    return NextResponse.json({ data: { inviteCode: rawToken, inviteUrl: `${origin}/davet/${encodeURIComponent(rawToken)}`, expiresAt, role: invitedRole } });
  }

  if (["set_role","remove_member","leave_trip"].includes(action)) {
    const target = action === "leave_trip" ? user.id : uuid(body.userId);
    if (!target) return NextResponse.json({error:"Katılımcı seçimi geçersiz."},{status:400});
    const {error} = await supabase.rpc("change_shared_trip_member",{p_trip_id:tripId,p_actor:user.id,p_target:target,p_action:action,p_role:body.role === "viewer" ? "viewer" : "editor"});
    if(error?.message.includes("financial_history")) return NextResponse.json({error:"Bu katılımcının masraf geçmişi var; hesapları korumak için katılımcı çıkarılamaz."},{status:409});
    if(error) return collaborationWriteError(error);
    return NextResponse.json({success:true});
  }

  if (action === "add_option") {
    const title = cleanText(body.title, 120);
    const details = cleanText(body.details, 600);
    const type = cleanText(body.type, 20);
    if (title.length < 2 || !OPTION_TYPES.has(type)) return NextResponse.json({ error: "Öneri başlığı veya türü geçersiz." }, { status: 400 });
    const { error } = await supabase.from("trip_plan_options").insert({ id: randomUUID(), trip_id: tripId, created_by: user.id, option_type: type, title, details: details || null });
    if (error) return NextResponse.json({ error: "Öneri eklenemedi." }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "toggle_vote") {
    const optionId = uuid(body.optionId);
    const { data: option } = optionId ? await supabase.from("trip_plan_options").select("id").eq("id", optionId).eq("trip_id", tripId).maybeSingle() : { data: null };
    if (!option) return NextResponse.json({ error: "Oylama seçeneği bulunamadı." }, { status: 404 });
    const { data: current } = await supabase.from("trip_plan_votes").select("option_id").eq("option_id", optionId).eq("user_id", user.id).maybeSingle();
    const { error } = current
      ? await supabase.from("trip_plan_votes").delete().eq("option_id", optionId).eq("user_id", user.id)
      : await supabase.from("trip_plan_votes").insert({ option_id: optionId, user_id: user.id });
    if (error) return NextResponse.json({ error: "Oyun kaydedilemedi." }, { status: 500 });
    return NextResponse.json({ success: true, voted: !current });
  }

  if (action === "delete_option") {
    const optionId = uuid(body.optionId);
    const { data: option } = optionId ? await supabase.from("trip_plan_options").select("created_by").eq("id", optionId).eq("trip_id", tripId).maybeSingle() : { data: null };
    if (!option) return NextResponse.json({ error: "Öneri bulunamadı." }, { status: 404 });
    if (access.member.role !== "owner" && option.created_by !== user.id) return NextResponse.json({ error: "Bu öneriyi silemezsin." }, { status: 403 });
    const { error } = await supabase.from("trip_plan_options").delete().eq("id", optionId).eq("trip_id", tripId);
    if (error) return NextResponse.json({ error: "Öneri silinemedi." }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "set_budget") {
    const targetAmount = money(body.targetAmount);
    const currency = cleanText(body.currency, 3).toUpperCase();
    if (!Number.isFinite(targetAmount) || targetAmount < 0 || targetAmount > 100_000_000 || !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Bütçe veya para birimi geçersiz." }, { status: 400 });
    const { error } = await supabase.rpc("set_shared_trip_budget", { p_trip_id: tripId, p_user_id: user.id, p_amount: targetAmount, p_currency: currency });
    if (error) return collaborationWriteError(error);
    return NextResponse.json({ success: true });
  }

  if (action === "add_expense") {
    const title = cleanText(body.title, 120);
    const amount = money(body.amount);
    const paidBy = uuid(body.paidBy);
    const spentAt = cleanText(body.spentAt, 10);
    const rawParticipants = Array.isArray(body.participantIds) ? body.participantIds.map(uuid).filter(Boolean) : [];
    const participantIds = [...new Set(rawParticipants)];
    const currency = cleanText(body.currency, 3).toUpperCase() || null;
    const parsedDate = new Date(`${spentAt}T12:00:00Z`);
    // Accept today's local date throughout the world; SQL validates membership,
    // currency and the complete expense/share write under one transaction lock.
    const latestLocalDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date());
    if (title.length < 2 || !Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || !paidBy || !participantIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(spentAt) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== spentAt || spentAt > latestLocalDay || (currency && !/^[A-Z]{3}$/.test(currency))) {
      return NextResponse.json({ error: "Masraf bilgileri veya katılımcılar geçersiz." }, { status: 400 });
    }
    const expenseId = uuid(body.clientRequestId) || randomUUID();
    const { error } = await supabase.rpc("add_shared_trip_expense", {
      p_trip_id: tripId, p_user_id: user.id, p_expense_id: expenseId, p_title: title,
      p_amount: amount, p_paid_by: paidBy, p_spent_at: spentAt, p_participants: participantIds, p_currency: currency,
    });
    if (error) return collaborationWriteError(error);
    return NextResponse.json({ success: true });
  }

  if (action === "delete_expense") {
    const expenseId = uuid(body.expenseId);
    const { data: expense } = expenseId ? await supabase.from("trip_expenses").select("created_by").eq("id", expenseId).eq("trip_id", tripId).maybeSingle() : { data: null };
    if (!expense) return NextResponse.json({ error: "Masraf bulunamadı." }, { status: 404 });
    if (access.member.role !== "owner" && expense.created_by !== user.id) return NextResponse.json({ error: "Bu masrafı silemezsin." }, { status: 403 });
    const { error } = await supabase.from("trip_expenses").delete().eq("id", expenseId).eq("trip_id", tripId);
    if (error) return NextResponse.json({ error: "Masraf silinemedi." }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Bilinmeyen işlem." }, { status: 400 });
}
