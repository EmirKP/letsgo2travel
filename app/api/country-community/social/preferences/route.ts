import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { COMMUNITY_PRIVATE_HEADERS } from "@/lib/community/safety";
import { parseSocialPreferences, readSocialJson, socialError } from "@/lib/community/social";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request); if (!auth.ok) return auth.response;
    const { data, error } = await auth.supabase.rpc("read_travel_social", { p_viewer: auth.user.id, p_input: { section: "preferences" } });
    return error ? socialError(error) : Response.json({ data }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch { return socialError(); }
}
export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request); if (!auth.ok) return auth.response;
    const input = await readSocialJson(request, 1024); const parsed = input && parseSocialPreferences(input);
    if (!parsed) return socialError({ code: "22023" });
    const { data, error } = await auth.supabase.rpc("write_travel_social", { p_viewer: auth.user.id, p_action: "preferences", p_input: parsed });
    return error ? socialError(error) : Response.json({ data }, { headers: COMMUNITY_PRIVATE_HEADERS });
  } catch { return socialError(); }
}
