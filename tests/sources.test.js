import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, DEFAULT_PREFS, recommendedSourceIds, localSourceFor, getSources } from '../extension/core/sources.js';
import { parseFeed } from '../extension/core/feed.js';
import { scoreArticle } from '../extension/core/ranking.js';
import { socialSource, xAccount, parseBlueskyFeed } from '../extension/core/channels.js';
import { prefsWithDefaults } from '../extension/core/utils.js';

test('USA suggestions include CNN and US services, without Australian defaults', () => {
  const ids = recommendedSourceIds('US');
  assert.ok(ids.includes('cnn-us') && ids.includes('npr-us') && ids.includes('pbs-us'));
  assert.ok(!ids.includes('abc-au') && !ids.includes('sbs-au'));
});
test('World, Australian, UK and Canadian suggestions use the chosen country', () => {
  assert.deepEqual(recommendedSourceIds(), DEFAULT_PREFS.sourceIds);
  assert.ok(recommendedSourceIds('AU').includes('abc-au'));
  assert.ok(!recommendedSourceIds('AU').includes('cnn-us'));
  assert.ok(recommendedSourceIds('GB').includes('bbc-uk'));
  assert.ok(recommendedSourceIds('CA').includes('cbc-ca'));
});
test('city feeds distinguish places with the same name in different countries', () => {
  const us = localSourceFor('US', 'Richmond'), au = localSourceFor('AU', 'Richmond');
  assert.notEqual(us.id, au.id);
  assert.equal(new URL(us.url).searchParams.get('gl'), 'US');
  assert.match(new URL(us.url).searchParams.get('q'), /United States/);
  assert.match(new URL(au.url).searchParams.get('q'), /Australia/);
  assert.equal(localSourceFor('', 'Richmond'), null); assert.equal(localSourceFor('US', ' '), null);
});
test('local source lookup and recommendations share a stable source identity', () => {
  const prefs = { ...DEFAULT_PREFS, country: 'US', city: ' New York ' };
  const source = localSourceFor('US', 'New York');
  assert.ok(getSources(prefs).some(s => s.id === source.id));
  assert.ok(recommendedSourceIds('US', prefs.city).includes(source.id));
});
test('existing preferences keep their chosen sources after the catalogue expands', () => {
  const prefs = prefsWithDefaults({ setup: true, sourceIds: ['npr-us'], country: 'US' }, DEFAULT_PREFS);
  assert.deepEqual(prefs.sourceIds, ['npr-us']); assert.deepEqual(prefs.xAccounts, []);
});
test('every preset is HTTPS and has a unique source id', () => {
  assert.equal(new Set(SOURCES.map(s => s.id)).size, SOURCES.length);
  for (const source of SOURCES) assert.equal(new URL(source.url).protocol, 'https:');
});
const item = (publisher, domain, title = 'Local hospital services expand') => `<item><title>${title}</title><link>https://news.google.com/rss/articles/abc</link><source url="https://${domain}">${publisher}</source><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate></item>`;
const feed = items => `<rss><channel><title>News</title>${items}</channel></rss>`;
test('CNN aggregation filters other domains and retains original publisher attribution', () => {
  const cnn = SOURCES.find(s => s.id === 'cnn-us');
  const result = parseFeed(feed(item('CNN', 'cnn.com') + item('Other', 'other.example')), cnn);
  assert.equal(result.articles.length, 1); assert.equal(result.articles[0].sourceName, 'CNN');
  assert.equal(result.articles[0].via, 'Google News'); assert.equal(result.articles[0].origin, 'cnn.com');
});
test('local aggregation attributes each publisher rather than counting Google as its origin', () => {
  const source = localSourceFor('US', 'New York');
  const a = parseFeed(feed(item('Neighbourhood News', 'local.example')), source).articles[0];
  assert.equal(a.sourceName, 'Neighbourhood News'); assert.equal(a.origin, 'local.example'); assert.equal(a.sourceLocality, 'New York');
  const proximity = scoreArticle(a, { country: 'US', city: 'New York' }).scores.find(s => s.key === 'proximity');
  assert.match(proximity.explanation, /selected feed/); assert.match(proximity.explanation, /not independently confirmed/);
});
test('aggregated entries without usable attribution are dropped', () => {
  const source = localSourceFor('US', 'New York');
  assert.equal(parseFeed(feed('<item><title>Unknown</title><link>https://example.com/unknown</link></item>'), source).articles.length, 0);
});
test('X shortcuts canonicalise profiles without accepting post URLs or foreign hosts', () => {
  assert.equal(xAccount('@Example_News').url, 'https://x.com/Example_News');
  assert.equal(xAccount('https://twitter.com/ExampleNews').handle, 'ExampleNews');
  for (const input of ['https://x.com.evil.example/Reporter', 'https://x.com/home', 'https://x.com/Reporter/status/123', 'https://x.com:8443/Reporter', '@too_long_for_x_12345', 'javascript:alert(1)']) assert.throws(() => xAccount(input));
});
test('Bluesky sources use the public API without a token or a profile redirect', () => {
  const source = socialSource('bluesky', 'https://bsky.app/profile/news.bsky.social', 'News');
  assert.equal(new URL(source.url).origin, 'https://public.api.bsky.app');
  assert.equal(new URL(source.url).searchParams.get('actor'), 'news.bsky.social'); assert.equal(source.format, 'bluesky');
  assert.throws(() => socialSource('bluesky', 'https://evil.example/profile/news.bsky.social'));
});
test('Mastodon account handles become public RSS feeds', () => {
  assert.equal(socialSource('mastodon', '@news@mastodon.social').url, 'https://mastodon.social/@news.rss');
  assert.equal(socialSource('mastodon', 'https://mastodon.social/@news.rss').url, 'https://mastodon.social/@news.rss');
  for (const value of ['http://mastodon.social/@news', 'https://mastodon.social/@news/123', 'https://user:pass@mastodon.social/@news']) assert.throws(() => socialSource('mastodon', value));
});
test('Bluesky parses original public posts and excludes reposts, replies and non-English posts', () => {
  const source = socialSource('bluesky', 'news.bsky.social');
  const post = { uri: 'at://did:plc:abc123/app.bsky.feed.post/record123', author: { did: 'did:plc:abc123', handle: 'news.bsky.social' }, record: { text: 'New hospital services open today.', langs: ['en'], createdAt: '2026-10-22T10:00:00Z' } };
  const data = { feed: [{ post }, { post, reason: { $type: 'reasonRepost' } }, { post: { ...post, record: { ...post.record, reply: {} } } }, { post: { ...post, record: { ...post.record, langs: ['fr'] } } }] };
  const result = parseBlueskyFeed(JSON.stringify(data), source);
  assert.equal(result.articles.length, 1); assert.equal(result.articles[0].url, 'https://bsky.app/profile/did:plc:abc123/post/record123'); assert.equal(result.articles[0].platform, 'Bluesky');
  assert.throws(() => parseBlueskyFeed('<html>blocked</html>', source)); assert.throws(() => parseBlueskyFeed('{}', source));
});
