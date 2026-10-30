type Change = { ownerId?: string; blockedUserId?: string };
const revisions = new Map<string, number>();
const listeners = new Set<(change: Change) => void>();
let globalRevision = 0;
export function communityVisibilityRevision(ownerId?: string | null) { return `${globalRevision}:${revisions.get(ownerId || 'guest') || 0}`; }
export function communityVisibilityChanged(change: Change = {}) {
  if (change.ownerId) revisions.set(change.ownerId, (revisions.get(change.ownerId) || 0) + 1);
  else globalRevision++;
  for (const listener of listeners) listener(change);
}
export function subscribeCommunityVisibility(listener: (change: Change) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
