import assert from "node:assert/strict";
import { blockedAuthorFilter, canCommunityUsersInteract, findForumTarget, hiddenCommunityUsers, parseCommunityReport } from "../../lib/community/safety";
import { serializeAnswer } from "../../lib/community/serializers";
import type { SupabaseClient } from "@supabase/supabase-js";
const targetId = "20000000-0000-4000-8000-000000000001";
const authorId = "10000000-0000-4000-8000-000000000001";
async function main() {
  assert.deepEqual(parseCommunityReport({ targetType: "question", targetId, reason: "spam", note: "  detail  " }), { targetType: "topic", targetId, reason: "spam", note: "detail" });
  assert.equal(parseCommunityReport({ targetType: "warning", targetId, reason: "spam" }), null);
  assert.equal(parseCommunityReport({ targetType: "answer", targetId, reason: "other" }), null);
  assert.equal(parseCommunityReport({ targetType: "answer", targetId, reason: "hate", note: "x".repeat(1001) }), null);
  assert.equal(parseCommunityReport({ targetType: "answer", targetId: "bad", reason: "spam" }), null);
  assert.equal(parseCommunityReport({ targetType: "answer", targetId, reason: "anything" }), null);
  console.log("PASS report parsing uses canonical targets and bounded declared reasons");
  assert.equal(blockedAuthorFilter("author_id", [authorId, "malicious),status.eq.published"]), `author_id.is.null,author_id.not.in.(${authorId})`);
  assert.equal(blockedAuthorFilter("user_id", []), null);
  assert.equal(serializeAnswer({ id: targetId, authorId, email: "private@example.com" }, "public").authorId, authorId);
  assert.equal(serializeAnswer({ id: targetId, user_id: authorId }, "public").authorId, null);
  console.log("PASS author identity is explicit and malformed block IDs cannot modify query filters");
  const offline = { rpc: async () => ({ data: null, error: { code: "42P01" } }) } as unknown as SupabaseClient;
  await assert.rejects(hiddenCommunityUsers(offline, authorId));
  await assert.rejects(canCommunityUsersInteract(offline, authorId, targetId));
  console.log("PASS missing block infrastructure fails closed instead of showing blocked content");
  let call = 0;
  const fake = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return call++ === 0 ? { data: { id: targetId, user_id: authorId, topic_id: targetId, author_name: "Person" }, error: null } : { data: null, error: null }; } }) } as unknown as SupabaseClient;
  assert.equal(await findForumTarget(fake, "reply", targetId), null);
  console.log("PASS published reply in a hidden topic cannot be reported or used to discover an author");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
