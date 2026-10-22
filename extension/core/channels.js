import { hash, safeUrl, validDate } from './utils.js';
import { plainText } from './feed.js';

const X_RESERVED = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'i', 'intent', 'share', 'compose', 'login', 'signup', 'tos', 'privacy']);
export function xAccount(value) {
  let handle = String(value || '').trim();
  if (/^https?:\/\//i.test(handle)) {
    const url = new URL(handle);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.protocol !== 'https:') throw new Error('Use an @handle or an HTTPS X profile link.');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('Use a profile link, not a post or search link.');
    handle = parts[0];
  }
  handle = handle.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || X_RESERVED.has(handle.toLowerCase())) throw new Error('Enter a valid X handle (up to 15 letters, numbers or underscores).');
  return { handle, url: `https://x.com/${handle}` };
}
export function socialSource(platform, value, name = '', country = '') {
  let input = String(value || '').trim();
  if (platform === 'bluesky') {
    if (/^https:\/\//i.test(input)) {
      const url = new URL(input);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname !== 'bsky.app' || url.username || url.password || url.port || parts.length !== 2 || parts[0] !== 'profile') throw new Error('Use a Bluesky handle or a bsky.app profile link.');
      input = decodeURIComponent(parts[1]);
    }
    input = input.replace(/^@/, '').toLowerCase();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(input) || input.length > 253) throw new Error('Use a full Bluesky handle, such as reporter.bsky.social.');
    const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
    url.search = new URLSearchParams({ actor: input, limit: '30', filter: 'posts_no_replies' });
    return { id: `custom-bsky-${hash(input)}`, name: name.trim().slice(0, 60) || `@${input}`, url: url.href, profileUrl: `https://bsky.app/profile/${input}`, group: `bsky:${input}`, format: 'bluesky', platform: 'Bluesky', scope: country ? 'national' : 'world', country, language: 'en', label: 'Bluesky · public posts' };
  }
  if (platform === 'mastodon') {
    if (/^@?[^@\s/]+@[^@\s/]+$/.test(input)) { const [user, host] = input.replace(/^@/, '').split('@'); input = `https://${host}/@${user}`; }
    let url;
    try { url = new URL(input); } catch { throw new Error('Use @account@server or an HTTPS Mastodon profile link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^\/@[A-Za-z0-9_]+(?:\.rss)?\/?$/.test(url.pathname) || url.search || url.hash) throw new Error('Use a public Mastodon profile URL, such as https://mastodon.social/@reporter.');
    const user = url.pathname.replace(/^\/@/, '').replace(/\.rss\/?$/, '').replace(/\/$/, '');
    url.pathname = `/@${user}.rss`;
    return { id: `custom-mastodon-${hash(url.href)}`, name: name.trim().slice(0, 60) || `@${user}@${url.hostname}`, url: url.href, profileUrl: `${url.origin}/@${user}`, group: `mastodon:${url.hostname}:${user.toLowerCase()}`, platform: 'Mastodon', scope: country ? 'national' : 'world', country, language: 'en', label: 'Mastodon · public posts' };
  }
  throw new Error('Choose Bluesky or Mastodon for a public-post feed.');
}
export function parseBlueskyFeed(text, source, now = Date.now()) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Bluesky did not return a valid public feed.'); }
  if (!Array.isArray(data.feed)) throw new Error('Bluesky did not return a public feed for this account.');
  const articles = new Map();
  for (const item of data.feed.slice(0, 100)) {
    if (item.reason || item.reply || item.post?.record?.reply) continue; // Reposts, pins and replies are not new reporting by this account.
    const post = item.post, record = post?.record;
    const uri = /^at:\/\/(did:[a-z]+:[a-zA-Z0-9:._%-]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9._~-]+)$/.exec(post?.uri || '');
    const fullText = plainText(record?.text || '', 1200);
    if (!uri || !fullText || post.author?.did !== uri[1]) continue;
    const languages = Array.isArray(record.langs) ? record.langs : [];
    if (languages.length && !languages.some(lang => lang.toLowerCase().startsWith('en'))) continue;
    const url = safeUrl(`https://bsky.app/profile/${uri[1]}/post/${uri[2]}`);
    const title = fullText.length > 240 ? `${fullText.slice(0, 237).trim()}…` : fullText;
    const id = hash(`${source.id}:${url}`);
    articles.set(id, { id, url, title, summary: fullText.length > 240 ? fullText : '', sourceId: source.id, sourceName: source.name, sourceScope: source.scope, sourceCountry: source.country || '', origin: `bsky:${post.author.did}`, language: 'en', platform: 'Bluesky', categories: [], author: post.author.handle || '', publishedAt: validDate(record.createdAt), updatedAt: null, firstSeenAt: now, lastSeenAt: now });
  }
  return { title: source.name, articles: [...articles.values()] };
}
