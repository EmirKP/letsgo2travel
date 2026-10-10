// Screen instances can unmount while their account write is still in flight.
// Share the barrier by owner so newly opened screens read the settled result.
const writesByOwner = new Map<string, Set<Promise<unknown>>>();

export function trackProfileWrite<T>(ownerId: string, write: Promise<T>): Promise<T> {
  const pending = writesByOwner.get(ownerId) || new Set<Promise<unknown>>();
  writesByOwner.set(ownerId, pending);
  pending.add(write);
  const settled = () => {
    pending.delete(write);
    if (!pending.size && writesByOwner.get(ownerId) === pending) writesByOwner.delete(ownerId);
  };
  void write.then(settled, settled);
  return write;
}

export function pendingProfileWrites(ownerId: string): Promise<void> | null {
  const pending = writesByOwner.get(ownerId);
  if (!pending?.size) return null;
  return Promise.allSettled([...pending]).then(async () => {
    // Include another write started while the original snapshot was settling.
    await pendingProfileWrites(ownerId);
  });
}
