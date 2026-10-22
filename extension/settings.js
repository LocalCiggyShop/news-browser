import { api, readCache } from './core/storage.js';
import { SOURCES, DEFAULT_PREFS, COUNTRIES, getSources, localSourceFor, recommendedSourceIds, originFor, countryName } from './core/sources.js';
import { hash, prefsWithDefaults, checkedLabel } from './core/utils.js';
import { xAccount, socialSource } from './core/channels.js';

const $ = selector => document.querySelector(selector);
let prefs, customSources = [], xAccounts = [], localFeed, cache = { health: {} }, selected = new Set(), dirty = false, selectionTouched = false, cityTimer;
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
function countSources() { $('#source-count').textContent = `${selected.size} selected`; }
function markDirty() { dirty = true; $('#save-status').textContent = 'You have unsaved changes.'; }
function currentSources() { return getSources({ country: $('#country').value, city: $('#city').value, customSources }); }
function syncLocalSource() {
  const next = localSourceFor($('#country').value, $('#city').value);
  if (next?.id !== localFeed?.id) {
    const follow = localFeed ? selected.has(localFeed.id) : prefs.localNewsEnabled !== false;
    if (localFeed) selected.delete(localFeed.id);
    if (next && follow) selected.add(next.id);
  }
  localFeed = next;
  $('#local-feed-note').textContent = next ? `A local-news feed for ${$('#city').value.trim()}, ${countryName($('#country').value)} will look for reporting from local publishers. Results come through Google News; coverage varies.` : 'Add a city or region to include a feed for local publishers. You can also add your local service’s direct RSS feed below.';
}
function sourceList() {
  const fragment = document.createDocumentFragment();
  const suggested = new Set(recommendedSourceIds($('#country').value, $('#city').value));
  const search = $('#source-search').value.trim().toLowerCase(), filter = $('#source-filter').value;
  let visible = 0;
  for (const source of currentSources()) {
    if (search && !`${source.name} ${source.label} ${countryName(source.country)} ${(source.topics || []).join(' ')} ${source.platform || ''}`.toLowerCase().includes(search)) continue;
    if (filter === 'selected' && !selected.has(source.id)) continue;
    if (filter === 'country' && (!$('#country').value || source.country !== $('#country').value || source.scope !== 'national')) continue;
    if (filter === 'world' && source.scope !== 'world') continue;
    if (filter === 'primary' && source.kind !== 'primary') continue;
    if (filter === 'social' && !source.platform) continue;
    visible++;
    const row = el('div', 'source-row');
    const input = el('input'); input.type = 'checkbox'; input.id = `source-${source.id}`; input.checked = selected.has(source.id); input.value = source.id;
    input.addEventListener('change', () => { if (input.checked) selected.add(source.id); else selected.delete(source.id); selectionTouched = true; countSources(); markDirty(); });
    const label = el('label', 'source-label'); label.htmlFor = input.id;
    const avatar = el('span', 'source-avatar', source.name[0]); avatar.setAttribute('aria-hidden', 'true');
    const detail = el('span', 'source-detail'); detail.append(el('strong', '', source.name), el('small', '', `${source.label || countryName(source.country) || 'Custom feed'} · English${suggested.has(source.id) ? ' · Suggested' : ''}`)); label.append(avatar, detail);
    const health = cache.health[source.id];
    const status = el('span', `source-health${health?.error ? ' error' : ''}`, health?.error ? 'Needs attention' : health?.lastSuccess ? checkedLabel(health.lastSuccess) : 'Ready to connect');
    status.title = health?.error || (health?.count !== undefined ? `${health.count} items at last check` : 'Access will be requested when you save.');
    const links = el('span', 'source-links');
    const feedLink = el('a', '', 'Feed ↗'); feedLink.href = source.url; feedLink.target = '_blank'; feedLink.rel = 'noopener noreferrer'; feedLink.setAttribute('aria-label', `Open ${source.name} feed`); links.append(feedLink);
    if (source.terms) { const terms = el('a', '', 'Terms'); terms.href = source.terms; terms.target = '_blank'; terms.rel = 'noopener noreferrer'; links.append(terms); }
    if (source.id.startsWith('custom-')) { const remove = el('button', '', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${source.name} feed`); remove.addEventListener('click', () => { customSources = customSources.filter(s => s.id !== source.id); selected.delete(source.id); sourceList(); markDirty(); }); links.append(remove); }
    row.append(input, label, status, links); fragment.append(row);
    if (health?.error) fragment.append(el('p', 'source-error-message', `${source.name}: ${health.error}`));
  }
  if (!visible) fragment.append(el('p', 'quiet-note', 'No sources match these filters. Try another search or choose All sources.'));
  $('#source-list').replaceChildren(fragment); countSources();
}
for (const [code, name] of COUNTRIES) for (const select of [$('#country'), $('#custom-country'), $('#channel-country')]) { const option = el('option', '', name); option.value = code; select.append(option); }
$('#country').addEventListener('change', () => {
  $('#city').disabled = !$('#country').value;
  if (!$('#country').value) $('#city').value = '';
  if (!prefs.setup && !selectionTouched) selected = new Set(recommendedSourceIds($('#country').value, $('#city').value));
  syncLocalSource(); sourceList();
  $('#custom-country').value = $('#country').value; markDirty();
});
$('#city').addEventListener('input', () => { clearTimeout(cityTimer); cityTimer = setTimeout(() => { syncLocalSource(); sourceList(); }, 200); });
$('#source-search').addEventListener('input', sourceList);
$('#source-filter').addEventListener('change', sourceList);
$('#use-suggested').addEventListener('click', () => {
  const custom = customSources.filter(s => selected.has(s.id)).map(s => s.id);
  selected = new Set([...recommendedSourceIds($('#country').value, $('#city').value), ...custom]);
  localFeed = localSourceFor($('#country').value, $('#city').value); selectionTouched = true; sourceList(); markDirty();
  $('#save-status').textContent = `Suggested sources selected for ${countryName($('#country').value) || 'World view'}. Save to apply.`;
});
$('#theme').addEventListener('change', () => { document.documentElement.dataset.theme = $('#theme').value; });
$('#settings-form').addEventListener('input', event => { if (!event.target.closest('.source-finder')) markDirty(); });
$('#settings-form').addEventListener('change', event => { if (!event.target.closest('.source-finder')) markDirty(); });
$('#add-feed').addEventListener('click', () => {
  const error = $('#custom-error'); error.hidden = true;
  try {
    const name = $('#custom-name').value.trim(); const url = new URL($('#custom-url').value.trim());
    if (!name) throw new Error('Give the publisher a name.');
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS feed address without embedded credentials.');
    if (currentSources().some(s => s.url === url.href)) throw new Error('That feed is already in your sources.');
    if (customSources.length >= 30) throw new Error('You can add up to 30 custom feeds.');
    const scope = $('#custom-scope').value, country = $('#custom-country').value;
    if (scope === 'national' && !country) throw new Error('Choose a country for a national or regional feed.');
    const source = { id: `custom-${hash(url.href)}`, name, url: url.href, group: url.hostname.replace(/^www\./, ''), scope, country, label: scope === 'national' ? countryName(country) : 'Custom · international', language: 'en' };
    customSources.push(source); selected.add(source.id); selectionTouched = true; sourceList(); markDirty();
    $('#custom-name').value = ''; $('#custom-url').value = '';
    $('#save-status').textContent = 'Feed added. Save to allow access and check it.';
  } catch (e) { error.textContent = e instanceof TypeError ? 'Enter a valid HTTPS feed URL.' : e.message; error.hidden = false; }
});
function renderXAccounts() {
  const list = $('#x-account-list'); list.replaceChildren();
  if (!xAccounts.length) return;
  list.append(el('h3', '', 'Your X shortcuts'));
  for (const account of xAccounts) {
    const row = el('div', 'account-row');
    const detail = el('div', 'source-detail'); detail.append(el('strong', '', account.name || `@${account.handle}`), el('small', '', `@${account.handle} · opens on X`));
    const open = el('a', 'text-button', 'Open ↗'); open.href = account.url; open.target = '_blank'; open.rel = 'noopener noreferrer';
    const remove = el('button', 'text-button', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove @${account.handle} shortcut`);
    remove.addEventListener('click', () => { xAccounts = xAccounts.filter(a => a.handle.toLowerCase() !== account.handle.toLowerCase()); renderXAccounts(); markDirty(); });
    row.append(detail, open, remove); list.append(row);
  }
}
$('#channel-platform').addEventListener('change', () => {
  const platform = $('#channel-platform').value;
  $('#channel-country-field').hidden = platform === 'x';
  $('#channel-address-label').textContent = platform === 'x' ? 'X handle or profile link' : platform === 'bluesky' ? 'Bluesky handle or profile link' : 'Mastodon account or profile link';
  $('#channel-address').placeholder = platform === 'x' ? '@reporter or https://x.com/reporter' : platform === 'bluesky' ? 'reporter.bsky.social' : '@reporter@mastodon.social';
  $('#channel-help').textContent = platform === 'x' ? "X profiles open in a new tab. Posts aren't imported because X's official reading API is paid." : 'Public posts appear in your brief with the platform labelled. No login or API key. Pick accounts you trust; server availability and account visibility can vary.';
  $('#channel-error').hidden = true;
});
$('#add-channel').addEventListener('click', () => {
  const error = $('#channel-error'); error.hidden = true;
  try {
    const platform = $('#channel-platform').value, address = $('#channel-address').value, name = $('#channel-name').value.trim();
    if (platform === 'x') {
      const account = xAccount(address);
      if (xAccounts.length >= 30) throw new Error('You can keep up to 30 X profile shortcuts.');
      if (xAccounts.some(a => a.handle.toLowerCase() === account.handle.toLowerCase())) throw new Error('That X account is already in your shortcuts.');
      xAccounts.push({ ...account, name }); renderXAccounts();
    } else {
      const source = socialSource(platform, address, name, $('#channel-country').value);
      if (customSources.length >= 30) throw new Error('You can add up to 30 custom and social feeds.');
      if (customSources.some(s => s.id === source.id || s.url === source.url)) throw new Error('That account is already in your sources.');
      customSources.push(source); selected.add(source.id); sourceList(); selectionTouched = true;
    }
    markDirty(); $('#channel-address').value = ''; $('#channel-name').value = '';
    $('#save-status').textContent = 'Channel added. Save to apply it to your brief.';
  } catch (e) { error.textContent = e.message; error.hidden = false; }
});

$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  clearTimeout(cityTimer); syncLocalSource();
  const button = $('#save-settings');
  if (!selected.size) { $('#save-status').textContent = 'Choose at least one source for your brief.'; $('#sources').scrollIntoView({ block: 'start' }); return; }
  const sources = currentSources().filter(s => selected.has(s.id));
  const origins = [...new Set(sources.map(s => originFor(s.url)))];
  button.disabled = true; $('#save-status').textContent = 'Allow access to your selected feeds…';
  try {
    // Invoke immediately from the submit gesture, before any await.
    const allowed = await api.permissions.request({ origins });
    if (!allowed) { $('#save-status').textContent = 'Feed access wasn’t allowed. Select fewer sources or save again to allow access.'; return; }
    const current = (await api.storage.local.get('prefs')).prefs || DEFAULT_PREFS;
    const next = { ...DEFAULT_PREFS, ...current, setup: true, country: $('#country').value, city: $('#country').value ? $('#city').value.trim() : '', sourceIds: sources.map(s => s.id), customSources, xAccounts, localNewsEnabled: localFeed ? selected.has(localFeed.id) : prefs.localNewsEnabled !== false, theme: $('#theme').value, refreshMinutes: Number($('#refresh-minutes').value) };
    await api.storage.local.set({ prefs: next }); prefs = next; dirty = false;
    const permissions = await api.permissions.getAll();
    const requiredOrigins = api.runtime.getManifest().host_permissions || [];
    const unused = (permissions.origins || []).filter(origin => !origins.includes(origin) && !requiredOrigins.includes(origin));
    if (unused.length) await api.permissions.remove({ origins: unused });
    $('#save-status').textContent = 'Saved. Checking your sources…';
    $('#save-settings').textContent = 'Save changes';
    $('#open-brief-after-save')?.remove();
    const open = el('a', 'saved-brief-link', 'Open your news brief ↗'); open.id = 'open-brief-after-save'; open.href = 'popup.html?expanded=1'; $('.save-bar > div').append(open);
    const result = await api.runtime.sendMessage({ type: 'sources-changed' });
    if (!result.ok) throw new Error(result.error);
    $('#save-status').textContent = 'Your brief is ready. Open it here or click the toolbar icon.';
    cache = await readCache(); sourceList();
  } catch (error) { $('#save-status').textContent = `Could not finish: ${error.message}`; }
  finally { button.disabled = false; }
});
$('#clear-cache').addEventListener('click', async () => {
  const button = $('#clear-cache'); button.disabled = true;
  try {
    const result = await api.runtime.sendMessage({ type: 'clear-cache' });
    if (!result.ok) throw new Error(result.error);
    cache = { health: {} }; sourceList(); $('#data-status').textContent = 'Feed cache cleared. Your saved links and preferences are kept. Refresh your brief to fetch news again.';
  } catch (error) { $('#data-status').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#export-saved').addEventListener('click', async () => {
  try {
    const { saved = {} } = await api.storage.local.get('saved');
    const links = Object.values(saved).map(({ title, url, sourceName, savedAt }) => ({ title, url, source: sourceName, savedAt: new Date(savedAt).toISOString() }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), links }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = el('a'); link.href = url; link.download = 'news-browser-saved.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#data-status').textContent = `Exported ${links.length} saved links.`;
  } catch (error) { $('#data-status').textContent = error.message; }
});
api.runtime.onMessage.addListener(message => { if (message.type === 'cache-updated' || message.type === 'refresh-finished') readCache().then(data => { cache = data; if (!dirty) sourceList(); }).catch(() => {}); return false; });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

async function init() {
  const data = await api.storage.local.get('prefs');
  prefs = prefsWithDefaults(data.prefs, DEFAULT_PREFS); customSources = [...prefs.customSources]; selected = new Set(prefs.sourceIds);
  xAccounts = prefs.xAccounts.map(account => { try { return { ...xAccount(account.handle), name: String(account.name || '').slice(0, 60) }; } catch { return null; } }).filter(Boolean);
  document.documentElement.dataset.theme = prefs.theme;
  $('#country').value = prefs.country; $('#city').value = prefs.city; $('#city').disabled = !prefs.country;
  $('#theme').value = prefs.theme; $('#refresh-minutes').value = String(prefs.refreshMinutes); $('#custom-country').value = prefs.country;
  if (prefs.setup) $('#save-settings').textContent = 'Save changes';
  cache = await readCache(); syncLocalSource(); sourceList(); renderXAccounts();
}
init().catch(error => { $('#save-status').textContent = `Could not load settings: ${error.message}`; });
