import type { Evidence } from './types';

const DAY = 86_400_000;
export type EvidenceStatus = 'checked' | 'review-due' | 'expired' | 'unverified';
export function dateStamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

// Editorial recheck policy, not a claim that the source expires in 90 days.
export function evidenceStatus(item: Evidence, now = new Date()): EvidenceStatus {
  const today = dateStamp(now.toISOString().slice(0, 10))!;
  const checked = dateStamp(item.verifiedAt);
  if (checked === null || checked > today) return 'unverified';
  if (item.validUntil !== undefined) {
    const until = dateStamp(item.validUntil);
    if (until === null || until < checked) return 'unverified';
    if (today > until) return 'expired';
  }
  const nextReview = item.reviewAfter === undefined ? checked + 90 * DAY : dateStamp(item.reviewAfter);
  if (nextReview === null || nextReview < checked) return 'unverified';
  return today >= nextReview ? 'review-due' : 'checked';
}
