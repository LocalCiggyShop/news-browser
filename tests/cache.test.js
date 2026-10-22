import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeArticles, pruneArticles, nextFeedTime, backoffMinutes, MAX_ARTICLES } from '../extension/core/cache.js';
import { DAY } from '../extension/core/utils.js';
const now = 1800000000000;
const a = { id: 'a', title: 'Original story', publishedAt: now - DAY, firstSeenAt: now - DAY, lastSeenAt: now - DAY, trendEligible: false };
test('refresh preserves original publication, first observation and trend eligibility', () => {
  const merged = mergeArticles([a], [{ ...a, title: 'Updated headline', publishedAt: now, firstSeenAt: now }], now);
  assert.equal(merged[0].publishedAt, a.publishedAt); assert.equal(merged[0].firstSeenAt, a.firstSeenAt); assert.equal(merged[0].lastSeenAt, now); assert.equal(merged[0].trendEligible, false); assert.equal(merged[0].title, 'Updated headline');
});
test('first poll is bootstrap while subsequent new items may contribute trends', () => {
  assert.equal(mergeArticles([], [a], now, true)[0].trendEligible, false);
  assert.equal(mergeArticles([], [a], now, false)[0].trendEligible, true);
});
test('rediscovered old or undated reports cannot manufacture a trend', () => {
  for (const publishedAt of [null, now - 10 * DAY, now + DAY]) assert.equal(mergeArticles([], [{ ...a, publishedAt }], now, false)[0].trendEligible, false);
});
test('cache pruning enforces age and item limits', () => {
  assert.equal(pruneArticles([{ ...a, firstSeenAt: now - 8 * DAY }], now).length, 0);
  const many = Array.from({ length: 2000 }, (_, i) => ({ ...a, id: String(i), firstSeenAt: now })); assert.equal(pruneArticles(many, now).length, MAX_ARTICLES);
});
test('manual refresh obeys cooldowns and publisher backoff', () => {
  assert.equal(nextFeedTime({ lastAttempt: now }, 15, true, now), now + 60000);
  assert.equal(nextFeedTime({ retryAt: now + DAY }, 15, true, now), now + DAY);
  assert.ok(backoffMinutes(3) > backoffMinutes(1)); assert.equal(backoffMinutes(1, 200), 200);
});
