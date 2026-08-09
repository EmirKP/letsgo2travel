import type { SupabaseClient, User } from "@supabase/supabase-js";
import { optionalRequestUser } from "./request-user";
import { flightSearchTokenFromRequest, isUuid, tokenHashMatches } from "./tokens";

export type AuthorizedFlightSearch = {
  id: string;
  user_id: string | null;
  access_token_hash: string;
  status: string;
  criteria: Record<string, unknown>;
  currency: string;
  expires_at: string;
};

export type FlightSearchAccessResult =
  | { ok: true; search: AuthorizedFlightSearch; user: User | null }
  | { ok: false; status: 400 | 401 | 404 | 410 | 500; error: string };

export async function authorizeFlightSearch(params: {
  request: Request;
  supabase: SupabaseClient;
  searchId: string;
}): Promise<FlightSearchAccessResult> {
  if (!isUuid(params.searchId)) return { ok: false, status: 400, error: "Arama kimliği geçersiz." };

  const userResult = await optionalRequestUser(params.request, params.supabase);
  if (userResult.provided && !userResult.user) {
    return { ok: false, status: 401, error: "Geçersiz veya süresi dolmuş oturum." };
  }

  const { data, error } = await params.supabase
    .from("flight_searches")
    .select("id,user_id,access_token_hash,status,criteria,currency,expires_at")
    .eq("id", params.searchId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Arama okunamadı." };
  if (!data) return { ok: false, status: 404, error: "Arama bulunamadı." };

  const user = userResult.user;
  const ownsSearch = Boolean(user && data.user_id && user.id === data.user_id);
  const token = flightSearchTokenFromRequest(params.request);
  const hasTokenAccess = tokenHashMatches(token, data.access_token_hash);
  if (!ownsSearch && !hasTokenAccess) return { ok: false, status: 401, error: "Arama erişimi doğrulanamadı." };

  if (new Date(data.expires_at).getTime() <= Date.now() || data.status === "expired") {
    return { ok: false, status: 410, error: "Bu aramanın süresi doldu." };
  }
  return { ok: true, search: data as AuthorizedFlightSearch, user };
}

