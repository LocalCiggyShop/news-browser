import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreArticle, prepareStories, sameEvent, clusterArticles, topicTrends } from '../extension/core/ranking.js';
import { HOUR, DAY } from '../extension/core/utils.js';
const now = Date.parse('2026-10-22T12:00:00Z');
const prefs = { country: 'AU', city: 'Melbourne', view: 'top', topic: 'All' };
let next = 0;
function article(patch = {}) { const id = `${++next}`; return { id, url: `https://example.com/${id}`, title: 'A thoughtful piece of reporting', summary: '', publishedAt: now - HOUR, firstSeenAt: now - HOUR, lastSeenAt: now, sourceName: 'Test News', sourceScope: 'world', sourceCountry: 'GB', sourceId: 'test', origin: 'test', categories: [], trendEligible: false, ...patch }; }

test('public consequences and proximity outweigh celebrity novelty', () => {
  const local = article({ title: 'Melbourne rail disruption affects hospitals and schools in Australia', sourceScope: 'national', sourceCountry: 'AU' });
  const celebrity = article({ title: 'Actor unveils unprecedented film premiere', publishedAt: now - 60000 });
  assert.ok(scoreArticle(local, prefs, now).newsworthiness > scoreArticle(celebrity, prefs, now).newsworthiness);
  assert.ok(scoreArticle(local, prefs, now).tags.some(t => t.text === 'Near you'));
});
test('all seven factors retain evidence and total 100 starting weight', () => {
  const result = scoreArticle(article({ title: 'Government volunteers rescue families after Australia flood dispute' }), prefs, now);
  assert.equal(result.scores.length, 7); assert.equal(result.scores.reduce((n, s) => n + s.weight, 0), 100);
  assert.ok(result.scores.find(s => s.key === 'human').evidence.length);
  assert.ok(result.scores.every(s => s.explanation && s.value >= 0 && s.value <= 1));
});
test('missing and future timestamps get no freshness advantage', () => {
  for (const time of [null, now + DAY]) assert.equal(scoreArticle(article({ publishedAt: time }), prefs, now).scores.find(s => s.key === 'timeliness').value, 0);
});
test('ambiguous cities require matching country context', () => {
  const paris = { ...prefs, city: 'Paris', country: 'FR' };
  assert.equal(scoreArticle(article({ title: 'Paris council approves new park', sourceCountry: 'US' }), paris, now).geo.city, false);
  assert.equal(scoreArticle(article({ title: 'Paris council in France approves new park' }), paris, now).geo.city, true);
});
test('no selected country makes Local empty instead of assuming a location', () => {
  assert.equal(prepareStories([article()], { ...prefs, country: '' }, { view: 'local', now }).length, 0);
});
test('national feed is wider coverage and does not establish a city match', () => {
  const a = article({ title: 'New rules announced', sourceScope: 'national', sourceCountry: 'AU' });
  const geo = scoreArticle(a, prefs, now).geo; assert.equal(geo.nationalFeed, true); assert.equal(geo.city, false);
  assert.equal(prepareStories([a], prefs, { view: 'local', now }).length, 1);
});
test('same event grouping is conservative across times and unrelated events', () => {
  const a = article({ title: 'Melbourne rail timetable changes daily commute for thousands' });
  const b = article({ title: 'New Melbourne rail timetable changes daily commute for thousands', sourceId: 'b', origin: 'b' });
  const c = article({ title: 'Melbourne rail bridge reopens after overnight repairs' });
  assert.equal(sameEvent(a, b), true); assert.equal(sameEvent(a, c), false);
  assert.equal(sameEvent(a, { ...b, publishedAt: now - 2 * DAY }), false);
  assert.equal(clusterArticles([a, b, c]).length, 2);
});
test('Latest puts valid original publication time ahead of future or undated data', () => {
  const dated = article({ publishedAt: now - 2 * HOUR }), future = article({ title: 'Future-dated item', publishedAt: now + DAY }), undated = article({ title: 'Undated item', publishedAt: null });
  const result = prepareStories([undated, future, dated], prefs, { view: 'latest', now });
  assert.equal(result[0].lead.id, dated.id); assert.equal(result[1].newest, 0);
});
test('hidden stories disappear while separately saved stories survive age and cache eviction', () => {
  const a = article({ publishedAt: now - 10 * DAY, savedAt: now });
  assert.equal(prepareStories([a], prefs, { now }).length, 0);
  assert.equal(prepareStories([], prefs, { now, view: 'saved', saved: { [a.url]: a } }).length, 1);
  const fresh = article(); assert.equal(prepareStories([fresh], prefs, { now, hidden: { [fresh.url]: now } }).length, 0);
});
test('source diversity preserves every story while varying the first ten', () => {
  const articles = Array.from({ length: 8 }, (_, i) => article({ title: `Unique story ${i} subject${i}`, origin: i < 5 ? 'dominant' : `other-${i}` }));
  const result = prepareStories(articles, prefs, { now }); assert.equal(result.length, 8); assert.notEqual(result[2].lead.origin, 'dominant');
});
test('trend history excludes bootstrap backfill and requires four hours of observations', () => {
  const articles = ['a', 'b'].map(origin => article({ title: `Climate flood response ${origin}`, origin, trendEligible: true, firstSeenAt: now - HOUR }));
  assert.equal(topicTrends(articles, now, now - HOUR).length, 0);
  assert.ok(topicTrends(articles, now, now - 5 * HOUR).some(t => t.topic === 'Climate'));
  assert.equal(topicTrends(articles.map(a => ({ ...a, trendEligible: false })), now, now - 5 * HOUR).length, 0);
});
test('topic and search filters combine across metadata', () => {
  const a = article({ title: 'New hospital health policy', sourceName: 'Community Post' });
  assert.equal(prepareStories([a], prefs, { now, topic: 'Health', search: 'community hospital' }).length, 1);
  assert.equal(prepareStories([a], prefs, { now, topic: 'Sport' }).length, 0);
});
