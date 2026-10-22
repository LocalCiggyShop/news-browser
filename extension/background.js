import { api, readCache, writeCache } from './core/storage.js';
import { DEFAULT_PREFS, getSources, enabledSources, originFor } from './core/sources.js';
import { prefsWithDefaults } from './core/utils.js';
import { parseFeed } from './core/feed.js';
import { parseBlueskyFeed } from './core/channels.js';
import { mergeArticles, pruneArticles, nextFeedTime, backoffMinutes } from './core/cache.js';

const ALARM = 'refresh-news';
let refreshInFlight;
async function preferences() { return prefsWithDefaults((await api.storage.local.get('prefs')).prefs, DEFAULT_PREFS); }
async function ensureAlarm() {
  if (!await api.alarms.get(ALARM)) await api.alarms.create(ALARM, { periodInMinutes: 15 });
}
function broadcast(message) { api.runtime.sendMessage(message).catch(() => {}); }

async function limitedText(response) {
  if (Number(response.headers.get('content-length')) > 2000000) throw new Error('Feed exceeds the 2 MB limit.');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2000000) { await reader.cancel(); throw new Error('Feed exceeds the 2 MB limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(combined);
}

async function fetchSource(source, health) {
  if (!await api.permissions.contains({ origins: [originFor(source.url)] })) return { error: 'Feed access is not enabled. Allow access in Sources.', permission: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const headers = { Accept: source.format === 'bluesky' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' };
    if (health.etag) headers['If-None-Match'] = health.etag;
    if (health.lastModified) headers['If-Modified-Since'] = health.lastModified;
    const response = await fetch(source.url, { headers, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-cache' });
    if (response.status === 304) return { unchanged: true };
    if (!response.ok) {
      const retryHeader = response.headers.get('retry-after');
      const seconds = Number(retryHeader);
      const retryAfter = retryHeader ? (Number.isFinite(seconds) ? seconds / 60 : Math.max(0, (Date.parse(retryHeader) - Date.now()) / 60000)) : 0;
      return { error: `Publisher returned HTTP ${response.status}.`, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0 };
    }
    const text = await limitedText(response);
    const parsed = source.format === 'bluesky' ? parseBlueskyFeed(text, source) : parseFeed(text, source);
    return { articles: parsed.articles, etag: response.headers.get('etag') || '', lastModified: response.headers.get('last-modified') || '', title: parsed.title };
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'Publisher took too long to respond.' : error instanceof TypeError ? 'Could not reach this feed. It may be offline, redirected, or blocked.' : error.message };
  } finally { clearTimeout(timeout); }
}

async function refresh({ force = false, onlySource = '' } = {}) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    await ensureAlarm();
    const prefs = await preferences();
    if (!prefs.setup) return { checked: 0 };
    let cache = await readCache();
    const now = Date.now();
    const sources = enabledSources(prefs).filter(s => (!onlySource || s.id === onlySource) && nextFeedTime(cache.health[s.id], prefs.refreshMinutes, force, now) <= now);
    if (!sources.length) { broadcast({ type: 'refresh-finished', checked: 0 }); return { checked: 0 }; }
    broadcast({ type: 'refresh-started', total: sources.length });
    let checked = 0;
    // Fetch three publishers at a time, then persist each batch before continuing.
    for (let i = 0; i < sources.length; i += 3) {
      const batch = sources.slice(i, i + 3);
      const results = await Promise.all(batch.map(async source => ({ source, result: await fetchSource(source, cache.health[source.id] || {}) })));
      for (const { source, result } of results) {
        const completed = Date.now();
        const previous = cache.health[source.id] || {};
        if (result.error) {
          const failures = (previous.failures || 0) + 1;
          cache.health[source.id] = { ...previous, lastAttempt: completed, failures, error: result.error, permission: Boolean(result.permission), retryAt: completed + backoffMinutes(failures, result.retryAfter) * 60000 };
        } else {
          if (!result.unchanged) cache.articles = mergeArticles(cache.articles, result.articles, completed, !previous.lastSuccess);
          cache.health[source.id] = { ...previous, ...(!result.unchanged ? { etag: result.etag, lastModified: result.lastModified, feedTitle: result.title, count: result.articles.length } : {}), lastAttempt: completed, lastSuccess: completed, failures: 0, error: '', permission: false, retryAt: 0 };
          cache.historySince ||= completed;
        }
        checked++;
      }
      cache.articles = pruneArticles(cache.articles);
      await writeCache(cache);
      broadcast({ type: 'cache-updated', checked, total: sources.length });
    }
    broadcast({ type: 'refresh-finished', checked });
    return { checked };
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function handle(message) {
  if (message.type === 'refresh') return refresh({ force: message.force === true, onlySource: typeof message.sourceId === 'string' ? message.sourceId : '' });
  if (message.type === 'wake') { await ensureAlarm(); return { ready: true, refreshing: Boolean(refreshInFlight) }; }
  if (message.type === 'sources-changed') {
    if (refreshInFlight) await refreshInFlight;
    const prefs = await preferences();
    const valid = new Set(getSources(prefs).map(s => s.id));
    const cache = await readCache();
    cache.articles = cache.articles.filter(a => valid.has(a.sourceId));
    // Newly enabled permissions should not inherit an access-denied backoff.
    for (const id of prefs.sourceIds) if (cache.health[id]?.permission) cache.health[id] = { ...cache.health[id], lastAttempt: 0, retryAt: 0 };
    await writeCache(cache);
    return refresh({ force: true });
  }
  if (message.type === 'clear-cache') {
    if (refreshInFlight) await refreshInFlight;
    await writeCache({ articles: [], health: {}, historySince: 0 });
    await api.storage.local.set({ hidden: {} });
    broadcast({ type: 'cache-updated' });
    return { cleared: true };
  }
  throw new Error('Unknown request.');
}

// Register listeners synchronously so event pages and service workers can wake reliably.
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== api.runtime.id || !['refresh', 'wake', 'sources-changed', 'clear-cache'].includes(message?.type)) return false;
  handle(message).then(result => sendResponse({ ok: true, ...result })).catch(error => { broadcast({ type: 'refresh-finished', error: error.message }); sendResponse({ ok: false, error: error.message }); });
  return true;
});
api.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) refresh().catch(error => broadcast({ type: 'refresh-finished', error: error.message })); });
api.runtime.onInstalled.addListener(() => { ensureAlarm().catch(console.error); });
api.runtime.onStartup.addListener(() => { ensureAlarm().then(() => refresh()).catch(console.error); });
api.permissions.onAdded.addListener(() => {
  // The explicit save action refreshes with the final source selection.
  broadcast({ type: 'permissions-updated' });
});
