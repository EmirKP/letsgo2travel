export const PULL_REFRESH_THRESHOLD = 62;
export const PULL_REFRESH_MIN_FLIGHT_MS = 550;

export function pullRefreshDistance(startY: number, currentY: number): number {
  if (!Number.isFinite(startY) || !Number.isFinite(currentY)) return 0;
  return Math.max(0, Math.min(96, (currentY - startY) * .55));
}

export function pullRefreshProgress(distance: number): number {
  return Number.isFinite(distance) ? Math.max(0, Math.min(1, distance / PULL_REFRESH_THRESHOLD)) : 0;
}

export function pullRefreshFinishDelay(startedAt: number, now: number): number {
  return Math.max(0, PULL_REFRESH_MIN_FLIGHT_MS - Math.max(0, now - startedAt));
}
