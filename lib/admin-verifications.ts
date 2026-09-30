import type { SupabaseClient } from "@supabase/supabase-js";

/** Older installations called the review state verification_status. Never
 * reinterpret a missing table/permission error as an empty review queue. */
export async function readAdminVerifications(supabase: SupabaseClient, options: { pendingOnly?: boolean; offset?: number; limit?: number } = {}) {
  const { pendingOnly = false, offset = 0, limit = 30 } = options;
  const read = (statusColumn: string) => {
    // Optional legacy evidence/name columns differ across installations. Rows
    // stay on the server and are explicitly serialized at each API boundary.
    let query = supabase.from("travel_verifications").select("*", { count: "exact" });
    if (pendingOnly) query = query.eq(statusColumn, "pending");
    return query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  };
  let result = await read("status");
  let legacy = false;
  if (pendingOnly && result.error?.code === "42703" && result.error.message.includes("status")) {
    result = await read("verification_status");
    legacy = !result.error;
  }
  return { ...result, legacy };
}
