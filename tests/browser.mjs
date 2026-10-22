import { chromium } from 'playwright';
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { SOURCES } from '../extension/core/sources.js';

const root = path.resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'news-browser-check-'));
const extension = path.join(temporary, 'extension');
await cp(path.join(root, 'extension'), extension, { recursive: true });
// Only this test copy pre-grants hosts, avoiding browser-chrome permission dialogs in headless QA.
// Production manifests keep every feed host optional and require the user's save gesture.
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...new Set(SOURCES.filter(s => ['bbc-world', 'guardian-world', 'aljazeera', 'guardian-au', 'abc-au'].includes(s.id)).map(s => `${new URL(s.url).origin}/*`)), 'https://example.com/*', 'https://news.google.com/*', 'https://public.api.bsky.app/*'];
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const artifacts = path.join(root, 'artifacts'); await mkdir(artifacts, { recursive: true });
const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), { channel: 'chromium', headless: true, viewport: { width: 1200, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-sandbox'] });
const errors = [];
let passed = 0;
function watch(page) { page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); }
async function check(name, run) { await run(); passed++; console.log(`✓ ${name}`); }
async function waitUntil(page, fn) { await page.waitForFunction(fn, { timeout: 15000 }); }
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2]; const base = `chrome-extension://${id}/`;
  const page = await context.newPage(); watch(page);
  await page.goto(`${base}popup.html`);
  await check('First opening shows setup instead of fabricated headlines', async () => {
    await page.locator('#welcome:not([hidden])').waitFor(); assert.equal(await page.locator('.story-card').count(), 0);
    await page.screenshot({ path: path.join(artifacts, 'welcome.png'), clip: { x: 0, y: 0, width: 440, height: 580 } });
  });
  await page.goto(`${base}settings.html`);
  await page.locator('.source-row').first().waitFor();
  await check('Setup leaves location optional and selects three world feeds', async () => {
    assert.equal(await page.locator('#country').inputValue(), ''); assert.equal(await page.locator('#city').isDisabled(), true); assert.equal(await page.locator('.source-row input:checked').count(), 3);
  });
  await page.selectOption('#country', 'US');
  await check('US setup suggests CNN and US services without Australian defaults', async () => { assert.equal(await page.locator('#source-cnn-us').isChecked(), true); assert.equal(await page.locator('#source-npr-us').isChecked(), true); assert.equal(await page.locator('#source-abc-au').isChecked(), false); });
  await page.selectOption('#country', 'AU'); await page.fill('#city', 'Melbourne');
  await page.waitForFunction(() => document.querySelectorAll('.source-row input:checked').length === 6);
  await check('City setup adds a matching local-publisher feed alongside country services', async () => { assert.equal(await page.locator('.source-row input:checked').count(), 6); assert.match(await page.locator('#local-feed-note').innerText(), /Melbourne, Australia/); });
  await page.locator('.custom-feed > summary').first().click();
  await page.fill('#custom-name', 'Example Community News'); await page.fill('#custom-url', 'http://example.com/feed');
  await page.click('#add-feed');
  await check('Custom feed validation rejects insecure URLs', async () => { assert.match(await page.locator('#custom-error').innerText(), /HTTPS/); });
  await page.fill('#custom-url', 'https://example.com/feed'); await page.selectOption('#custom-scope', 'national'); await page.selectOption('#custom-country', 'AU'); await page.click('#add-feed');
  await page.locator('.custom-feed > summary').first().click();
  await worker.evaluate(() => {
    const esc = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    const item = (slug, title, summary, minutes, category = '') => `<item><title>${esc(title)}</title><link>https://example.org/${slug}</link><description>${esc(summary)}</description><pubDate>${new Date(Date.now() - minutes * 60000).toUTCString()}</pubDate><category>${category}</category></item>`;
    const wrap = items => `<rss version="2.0"><channel><title>Illustrative test feed</title><language>en</language>${items}</channel></rss>`;
    globalThis.fetch = async url => {
      const host = new URL(url).hostname;
      if (host === 'public.api.bsky.app') return new Response(JSON.stringify({ feed: [{ post: { uri: 'at://did:plc:examplenews/app.bsky.feed.post/news123', author: { did: 'did:plc:examplenews', handle: 'news.bsky.social' }, record: { text: 'Scientists share new public health research.', langs: ['en'], createdAt: new Date(Date.now() - 3600000).toISOString() } } }] }), { headers: { 'content-type': 'application/json' } });
      const items = host.includes('bbci') ? item('rail-a', 'Melbourne rail disruption affects hospitals and schools in Australia', 'Rail services are disrupted across Melbourne, with public transport changes for families and hospital staff.', 12, 'Business')
        : host.includes('theguardian') && !String(url).includes('australia-news') ? item('rail-b', 'Melbourne rail disruption affects schools and hospitals across Australia', 'Public transport disruption affects schools, hospitals and jobs in Melbourne, Australia.', 15, 'Business')
        : host.includes('aljazeera') ? item('coasts', 'Pacific nations expand shared coastal protection programme', 'Climate research and coastal communities shape a new environmental programme.', 28, 'Climate')
        : host.includes('theguardian') ? item('volunteers', 'Melbourne volunteers help families rebuild after Australia flood', 'Community volunteers support recovery and reunite families following the flood in Australia.', 35, 'Climate')
        : host.includes('abc.net') ? item('science', 'Australian scientists open a new chapter in space research', 'Scientists in Australia share a new astronomy discovery with international researchers.', 42, 'Science')
        : item('community', 'Melbourne community celebrates its neighbourhood gardens', 'Volunteers and families come together across Melbourne, Australia.', 52, 'Culture');
      const xml = host === 'news.google.com' ? wrap(items).replaceAll('</item>', '<source url="https://example.org">Example Community News</source></item>') : wrap(items);
      return new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml', etag: '"fixture-v1"' } });
    };
  });
  await page.click('#save-settings');
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Your brief is ready'), null, { timeout: 15000 }).catch(async error => { console.error('Save status:', await page.locator('#save-status').innerText(), errors); throw error; });
  await check('Settings save fetches and caches selected sources', async () => { const data = await worker.evaluate(() => chrome.storage.local.get('prefs')); assert.equal(data.prefs.city, 'Melbourne'); assert.equal(data.prefs.sourceIds.length, 7); });
  await page.screenshot({ path: path.join(artifacts, 'settings.png'), fullPage: true });
  await page.goto(`${base}popup.html`); await page.locator('.story-card').first().waitFor();
  await check('Popup renders real extension cache and groups matching reports', async () => { assert.equal(await page.locator('.story-card').count(), 5); assert.ok((await page.locator('.reports-button').allTextContents()).some(text => text.startsWith('2 reports'))); });
  // Clearly label screenshots that use synthetic reporting.
  await page.locator('#view-kicker').evaluate(node => { node.textContent = 'ILLUSTRATIVE NEWS · TEST PREVIEW'; });
  await page.locator('#today').evaluate(node => { node.textContent = 'Illustrative preview'; });
  await page.screenshot({ path: path.join(artifacts, 'popup-light.png'), clip: { x: 0, y: 0, width: 440, height: 580 } });
  await page.locator('.why-button').first().click();
  await check('All seven ranking explanations expand accessibly', async () => { assert.equal(await page.locator('.factor').count(), 7); assert.equal(await page.locator('.why-button').first().getAttribute('aria-expanded'), 'true'); });
  await page.locator('.why-button').first().click();
  await page.locator('.reports-button').filter({ hasText: '2 reports' }).first().click();
  await check('Grouped reporting exposes publisher links', async () => { assert.equal(await page.locator('.reports-panel:not([hidden]) a').count(), 2); });
  await page.locator('.reports-button').filter({ hasText: '2 reports' }).first().click();
  await page.locator('.save-story').first().click(); await page.waitForFunction(() => document.querySelector('.save-story').getAttribute('aria-pressed') === 'true');
  await page.click('#saved-view');
  await check('Saved stories persist in a separate reading list', async () => { assert.equal(await page.locator('.story-card').count(), 1); });
  await page.click('[data-view="top"]');
  await page.locator('.hide-story').first().click(); await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 4);
  await page.click('#toast-action'); await page.waitForFunction(() => document.querySelectorAll('.story-card').length === 5);
  await check('Hiding an event supports undo', async () => { assert.equal(await page.locator('.story-card').count(), 5); });
  await page.click('[data-view="local"]');
  await check('Local view uses selected country and city context', async () => { assert.equal(await page.locator('.story-card').count(), 4); assert.ok((await page.locator('.story-tags').allTextContents()).some(text => text.includes('Near you'))); });
  await page.click('[data-view="latest"]');
  await check('Latest sorts the original publication times', async () => { assert.match(await page.locator('.story-link').first().innerText(), /rail disruption/); });
  await page.selectOption('#topic-filter', 'Science');
  await check('Topic filtering includes science and cross-topic research', async () => { assert.equal(await page.locator('.story-card').count(), 2); assert.ok((await page.locator('.story-link').allTextContents()).some(title => /scientists/.test(title))); });
  await page.selectOption('#topic-filter', 'All'); await page.click('#toggle-search'); await page.fill('#story-search', 'no matching report abcxyz');
  await page.locator('.empty-state').waitFor();
  await check('Search provides a recoverable empty state', async () => { assert.match(await page.locator('.empty-state h2').innerText(), /No matching/); });
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.click('#toggle-search');
  await page.click('[data-view="top"]');
  await context.setOffline(true); await page.reload(); await page.locator('.story-card').first().waitFor();
  await check('Reopening offline retains cached news and saved links', async () => { assert.equal(await page.locator('.story-card').count(), 5); assert.match(await page.locator('#check-status').innerText(), /Offline/); });
  await context.setOffline(false);
  await worker.evaluate(async () => { const { prefs } = await chrome.storage.local.get('prefs'); await chrome.storage.local.set({ prefs: { ...prefs, theme: 'dark' } }); });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.locator('#view-kicker').evaluate(node => { node.textContent = 'ILLUSTRATIVE NEWS · TEST PREVIEW'; });
  await page.locator('#today').evaluate(node => { node.textContent = 'Illustrative preview'; });
  await page.screenshot({ path: path.join(artifacts, 'popup-dark.png'), clip: { x: 0, y: 0, width: 440, height: 580 } });
  await check('Theme updates propagate without reloading', async () => { assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); });
  await page.goto(`${base}popup.html?expanded=1`); await page.locator('.story-card').first().waitFor();
  await page.locator('#view-kicker').evaluate(node => { node.textContent = 'ILLUSTRATIVE NEWS · TEST PREVIEW'; });
  await page.screenshot({ path: path.join(artifacts, 'expanded.png'), fullPage: true });
  await check('Expanded view adapts to narrow displays without horizontal overflow', async () => { await page.setViewportSize({ width: 375, height: 800 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); });
  await page.setViewportSize({ width: 1200, height: 900 });
  // Ensure content from a feed can never inject executable HTML.
  await page.evaluate(async () => {
    const { readCache, writeCache } = await import(chrome.runtime.getURL('core/storage.js'));
    const cache = await readCache(); cache.articles[0].title = '<img src=x onerror="globalThis.injected=true"> Test'; cache.articles[0].summary = '<script>globalThis.injected=true</script>'; await writeCache(cache);
  });
  await page.reload(); await page.locator('.story-card').first().waitFor();
  await check('Untrusted feed fields render as text, never executable markup', async () => { assert.equal(await page.locator('.story-card img, .story-card script').count(), 0); assert.equal(await page.evaluate(() => Boolean(globalThis.injected)), false); });
  await page.goto(`${base}settings.html`); await page.locator('.source-row').first().waitFor();
  await page.selectOption('#source-filter', 'country');
  await check('Source discovery filters the catalogue for the chosen country', async () => { assert.equal(await page.locator('#source-cnn-us').count(), 0); assert.ok(await page.locator('#source-abc-au').count()); });
  await page.selectOption('#source-filter', 'all');
  await page.locator('#social-channels summary').click();
  await page.fill('#channel-address', '@ExampleNews'); await page.click('#add-channel');
  await check('X accounts are explicit profile shortcuts and do not become fetched feeds', async () => { assert.equal(await page.locator('#x-account-list a').getAttribute('href'), 'https://x.com/ExampleNews'); assert.match(await page.locator('#channel-help').innerText(), /aren't imported/); });
  await page.selectOption('#channel-platform', 'bluesky'); await page.fill('#channel-address', 'news.bsky.social'); await page.click('#add-channel');
  await page.click('#save-settings'); await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Your brief is ready'));
  await page.goto(`${base}popup.html`); await page.locator('.story-card').first().waitFor();
  await check('Bluesky public posts flow through background fetching into the brief', async () => { assert.ok((await page.locator('.source-name').allTextContents()).some(name => name.includes('Bluesky'))); });
  await page.locator('#channel-shortcuts summary').click();
  await check('Saved X channels appear in the popup without requesting X host access', async () => { assert.equal(await page.locator('#x-channel-links a').getAttribute('href'), 'https://x.com/ExampleNews'); const all = await page.evaluate(() => chrome.permissions.getAll()); assert.ok(!all.origins.some(origin => origin.includes('x.com'))); });
  await check('No page errors or CSP errors during the reading flow', async () => { assert.deepEqual(errors, []); });
  console.log(`\n${passed} browser checks passed. Screenshots: artifacts/`);
} finally { await context.close(); await rm(temporary, { recursive: true, force: true }); }
