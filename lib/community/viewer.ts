import { requireAuthenticatedUser } from "../authenticated-user";
import { hiddenCommunityUsers } from "./safety";

export async function communityViewer(request: Request) {
  if (!request.headers.has("authorization")) return { ok: true as const, userId: null, hiddenUserIds: [] as string[] };
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;
  const hiddenUserIds = await hiddenCommunityUsers(auth.supabase, auth.user.id);
  return { ok: true as const, userId: auth.user.id, hiddenUserIds };
}
