import type { SupabaseClient, User } from "@supabase/supabase-js";

export type OptionalRequestUser =
  | { provided: false; user: null }
  | { provided: true; user: User }
  | { provided: true; user: null; error: "invalid_token" };

export async function optionalRequestUser(
  request: Request,
  supabase: SupabaseClient,
): Promise<OptionalRequestUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return { provided: false, user: null };
  if (!authHeader.startsWith("Bearer ")) return { provided: true, user: null, error: "invalid_token" };

  const token = authHeader.slice(7).trim();
  if (!token || token.length > 4096) return { provided: true, user: null, error: "invalid_token" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { provided: true, user: null, error: "invalid_token" };
  return { provided: true, user: data.user };
}

