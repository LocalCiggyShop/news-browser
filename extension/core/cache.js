import { DAY } from './utils.js';
export const MAX_ARTICLES = 1600;
export const MAX_CACHE_BYTES = 6 * 1024 * 1024;
export function mergeArticles(existing, incoming, now = Date.now(), bootstrap = false) {
  const byId = new Map(existing.map(a => [a.id, a]));
  for (const article of incoming) {
    const old = byId.get(article.id);
    const recentPublication = article.publishedAt && article.publishedAt <= now + 5 * 60000 && now - article.publishedAt < 2 * DAY;
    byId.set(article.id, { ...article, publishedAt: old?.publishedAt || article.publishedAt, firstSeenAt: old?.firstSeenAt || now, lastSeenAt: now, trendEligible: old ? old.trendEligible : Boolean(!bootstrap && recentPublication) });
  }
  return pruneArticles([...byId.values()], now);
}
export function pruneArticles(articles, now = Date.now()) {
  const candidates = articles.filter(a => now - a.firstSeenAt < 7 * DAY).sort((a, b) => b.lastSeenAt - a.lastSeenAt || (b.publishedAt || 0) - (a.publishedAt || 0)).slice(0, MAX_ARTICLES);
  let bytes = 0;
  return candidates.filter(a => { bytes += new TextEncoder().encode(JSON.stringify(a)).length; return bytes <= MAX_CACHE_BYTES; });
}
export function backoffMinutes(failures, retryAfter = 0) { return Math.min(24 * 60, Math.max(retryAfter, 15 * 2 ** Math.min(6, failures))); }
export function nextFeedTime(health = {}, minutes = 15, force = false, now = Date.now()) {
  if (health.retryAt > now) return health.retryAt;
  // Even manual refresh obeys a one-minute cooldown.
  return (health.lastAttempt || 0) + (force ? 60000 : Math.max(15, minutes) * 60000);
}
