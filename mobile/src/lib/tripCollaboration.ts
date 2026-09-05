import { requestJson } from "./api";

export type TripMemberRole = "owner" | "editor" | "viewer";

export type SharedTripSummary = {
  id: string;
  ownerId: string;
  role: TripMemberRole;
  memberCount: number;
  title: string;
  destinationCountry: string;
  destinationCode: string;
  destinationCity: string | null;
  startDate: string;
  endDate: string;
  departureAt: string | null;
  arrivalAt: string | null;
  originIata: string | null;
  destinationIata: string | null;
  status: string;
  updatedAt: string;
};

export type TripCollaborationMember = {
  userId: string;
  role: TripMemberRole;
  joinedAt: string;
  name: string;
};

export type TripPlanOption = {
  id: string;
  type: "route" | "stay" | "activity" | "transport" | "other";
  title: string;
  details: string | null;
  createdBy: string;
  creatorName: string;
  voteCount: number;
  votedByMe: boolean;
  createdAt: string;
};

export type TripExpense = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  paidBy: string;
  paidByName: string;
  createdBy: string;
  spentAt: string;
  shares: Array<{ userId: string; amount: number }>;
};

export type TripCollaborationWorkspace = {
  trip: Omit<SharedTripSummary, "role" | "memberCount" | "updatedAt">;
  myRole: TripMemberRole;
  members: TripCollaborationMember[];
  options: TripPlanOption[];
  budget: { currency: string; targetAmount: number; updatedAt: string | null };
  expenses: TripExpense[];
  balances: Array<{ userId: string; name: string; balance: number }>;
};

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}
export async function listSharedTrips(accessToken: string) {
  const result = await requestJson<{ data: SharedTripSummary[] }>("/api/trip-collaboration", { headers: authHeaders(accessToken) });
  return Array.isArray(result.data) ? result.data : [];
}

export async function getTripCollaboration(tripId: string, accessToken: string) {
  const query = new URLSearchParams({ tripId });
  const result = await requestJson<{ data: TripCollaborationWorkspace }>(`/api/trip-collaboration?${query}`, { headers: authHeaders(accessToken) });
  return result.data;
}

export async function collaborationAction<T = { success: boolean }>(accessToken: string, body: Record<string, unknown>) {
  return requestJson<T>("/api/trip-collaboration", { method: "POST", body, headers: authHeaders(accessToken) });
}

export function tripInviteFromUrl(value: string) {
  try {
    const parsed = new URL(value, window.location.origin);
    const code = parsed.searchParams.get("tripInvite")?.trim() || "";
    return code.length >= 20 && code.length <= 200 ? code : "";
  } catch {
    return "";
  }
}
