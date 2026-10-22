import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseXml, plainText } from '../extension/core/feed.js';
const source = { id: 'test', name: 'Test News', url: 'https://example.com/feed', group: 'test', scope: 'world', language: 'en' };
const wrap = item => `<rss version="2.0"><channel><title>Example News</title><language>en-GB</language>${item}</channel></rss>`;

test('RSS preserves publisher metadata, strips markup and canonicalises links', () => {
  const result = parseFeed(wrap(`<item><title>Health &amp; public services</title><link>https://example.com/a?utm_source=feed&amp;id=2#comments</link><description><![CDATA[<p>Useful <b>reporting</b>.</p><script>alert(1)</script>]]></description><pubDate>Thu, 22 Oct 2026 01:00:00 GMT</pubDate><dc:creator>Reuters</dc:creator><category>Health</category></item>`), source, 123);
  assert.equal(result.articles.length, 1);
  const a = result.articles[0];
  assert.equal(a.title, 'Health & public services'); assert.equal(a.url, 'https://example.com/a?id=2');
  assert.equal(a.summary, 'Useful reporting .'); assert.equal(a.origin, 'reuters');
  assert.equal(a.publishedAt, Date.parse('2026-10-22T01:00:00Z')); assert.equal(a.firstSeenAt, 123); assert.equal(a.language, 'en-GB');
});
test('Atom uses alternate links, original publication and category terms', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en"><title>Atom</title><entry><title>Research &lt;advances&gt;</title><link rel="self" href="https://example.com/api"/><link rel="alternate" href="/science"/><published>2026-10-21T10:00:00Z</published><updated>2026-10-22T10:00:00Z</updated><summary>New science.</summary><category term="Science"/></entry></feed>`;
  const a = parseFeed(xml, source).articles[0];
  assert.equal(a.url, 'https://example.com/science'); assert.equal(a.categories[0], 'Science'); assert.ok(a.updatedAt > a.publishedAt);
});
test('RDF/RSS 1.0 namespaced items are supported', () => {
  const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel><title>RDF feed</title></channel><item><title>World report</title><link>https://example.com/world</link><dc:date>2026-10-22T10:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(xml, source).articles[0].title, 'World report');
});
test('unsafe schemes, empty links and untitled entries are discarded', () => {
  const xml = wrap('<item><title>Unsafe</title><link>javascript:alert(1)</link></item><item><title>Empty</title></item><item><link>https://example.com/a</link></item>');
  assert.equal(parseFeed(xml, source).articles.length, 0);
});
test('undated reporting stays undated', () => {
  assert.equal(parseFeed(wrap('<item><title>Report</title><link>https://example.com/a</link><pubDate>not a date</pubDate></item>'), source).articles[0].publishedAt, null);
});
test('duplicate URLs within a feed are collapsed', () => {
  const item = '<item><title>Same story</title><link>https://example.com/a</link></item>';
  assert.equal(parseFeed(wrap(item + item), source).articles.length, 1);
});
test('XML rejects DTD, external entities, malformed tags, HTML and excessive depth', () => {
  for (const xml of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', '<rss><item></rss>', '<html>denied</html>', '<rss>' + '<x>'.repeat(70) + '</x>'.repeat(70) + '</rss>', '<rss/><rss/>']) assert.throws(() => parseXml(xml));
  assert.throws(() => parseXml('x'.repeat(2000001)), /limit/);
});
test('CDATA, quoted greater-than signs and numeric entities parse without execution', () => {
  const xml = `<feed><entry><title>&#x1F30D; News</title><link href="https://example.com/a?q=a&gt;b" title="a>b"/><summary><![CDATA[<img src=x onerror=alert(1)>News]]></summary></entry></feed>`;
  const a = parseFeed(xml, source).articles[0]; assert.equal(a.title, '🌍 News'); assert.equal(a.summary, 'News'); assert.ok(a.url.startsWith('https://'));
  assert.equal(plainText('&#999999999;'), '�');
});
