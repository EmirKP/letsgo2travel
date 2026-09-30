/** Only service-managed, published, unpaywalled discussion rows may bypass the
 * country-experience posting restriction. Normal country/visa topics keep it. */
export function isOpenStarterDiscussion(topic: { seed_key?: unknown; author_id?: unknown; status?: unknown; category?: unknown; is_paywalled?: unknown }) {
  return typeof topic.seed_key === "string" && /^starter-20260930-\d{2}$/.test(topic.seed_key)
    && topic.author_id === null && topic.status === "published"
    && topic.is_paywalled === false && topic.category === "Ülke Bazlı Sorunlar";
}
