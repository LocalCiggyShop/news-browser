import { api, readCache } from './core/storage.js';
import { DEFAULT_PREFS, TOPICS, countryName, enabledSources } from './core/sources.js';
import { prefsWithDefaults, ageLabel, checkedLabel, DAY, safeUrl } from './core/utils.js';
import { prepareStories, topicTrends } from './core/ranking.js';
import { xAccount } from './core/channels.js';

const $ = selector => document.querySelector(selector);
const state = { prefs: { ...DEFAULT_PREFS }, cache: { articles: [], health: {}, historySince: 0 }, saved: {}, hidden: {}, stories: [], limit: 15, refreshing: false, pending: false, loaded: false };
const expanded = new URLSearchParams(location.search).has('expanded');
let prefQueue = Promise.resolve(), toastTimer, scrollTimer, searchTimer;
if (expanded) document.body.classList.add('expanded');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); svg.setAttribute('aria-hidden', 'true'); svg.append(use); return svg;
}
function theme() { document.documentElement.dataset.theme = state.prefs.theme; }
function announce(text) { $('#announcer').textContent = text; }
function toast(message, undo) {
  clearTimeout(toastTimer); $('#toast-message').textContent = message;
  $('#toast-action').hidden = !undo;
  $('#toast-action').onclick = undo ? async () => { try { await undo(); $('#toast').hidden = true; } catch (error) { toast(error.message); } } : null;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, undo ? 10000 : 5500);
}
function persistPreferences(patch) {
  Object.assign(state.prefs, patch);
  prefQueue = prefQueue.catch(() => {}).then(async () => {
    const { prefs } = await api.storage.local.get('prefs');
    await api.storage.local.set({ prefs: { ...DEFAULT_PREFS, ...prefs, ...patch } });
  });
  prefQueue.catch(error => toast(`Could not save preferences: ${error.message}`));
  return prefQueue;
}
function settings(section = '') {
  return api.tabs.create({ url: api.runtime.getURL(`settings.html${section ? `#${section}` : ''}`) });
}
function availableArticles() {
  const ids = new Set(state.prefs.sourceIds);
  return state.cache.articles.filter(a => ids.has(a.sourceId) && (!a.language || a.language.toLowerCase().startsWith('en')));
}
function storiesNow() { return prepareStories(availableArticles(), state.prefs, { hidden: state.hidden, saved: state.saved, historySince: state.cache.historySince, search: state.prefs.search || '' }); }

function updateStatus() {
  const health = enabledSources(state.prefs).map(s => state.cache.health[s.id]).filter(Boolean);
  const failures = health.filter(h => h.error).length;
  const successes = health.filter(h => h.lastSuccess).map(h => h.lastSuccess);
  const offline = !navigator.onLine;
  $('#check-status').textContent = state.refreshing ? 'Checking your sources…' : offline ? 'Offline · saved brief' : checkedLabel(successes.length ? Math.min(...successes) : 0);
  $('#status-dot').classList.toggle('warning', failures > 0 || offline);
  $('#source-health').textContent = failures ? `${failures} source${failures === 1 ? '' : 's'} unavailable` : `${state.prefs.sourceIds.length} source${state.prefs.sourceIds.length === 1 ? '' : 's'}`;
  $('#refresh').classList.toggle('spinning', state.refreshing);
  $('#refresh').disabled = state.refreshing;
  $('#refresh').setAttribute('aria-label', state.refreshing ? 'Refreshing news' : 'Refresh news');
}
function renderHeading() {
  const view = state.prefs.view;
  const headings = { top: ['YOUR DAILY PERSPECTIVE', 'The stories that matter.', 'Ranked by newsworthiness.'], latest: ['AS IT HAPPENS', 'The latest reporting.', 'Newest publication times first.'], local: ['CLOSER TO HOME', 'Around your world.', 'Nearby matches, then your country.'], world: ['A WIDER PERSPECTIVE', 'Beyond the borders.', 'International reporting.'], saved: ['KEPT FOR LATER', 'Your reading list.', 'Kept on this device.'] };
  const [kicker, title, description] = headings[view] || headings.top;
  $('#view-kicker').textContent = kicker; $('#view-title').textContent = title; $('#view-description').textContent = description;
  document.querySelectorAll('[data-view]').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('#saved-view').setAttribute('aria-pressed', String(view === 'saved'));
  $('#location span').textContent = state.prefs.city || countryName(state.prefs.country) || 'World edition';
  $('#location').title = [state.prefs.city, countryName(state.prefs.country)].filter(Boolean).join(', ') || 'Choose your location';
  $('#topic-filter').value = state.prefs.topic || 'All';
  $('#story-search').value = state.prefs.search || '';
  $('#search-panel').hidden = !(state.prefs.search || $('#toggle-search').getAttribute('aria-expanded') === 'true');
}
function renderTrends() {
  const trends = topicTrends(availableArticles(), Date.now(), state.cache.historySince);
  $('#trending').hidden = state.prefs.view !== 'top' || !trends.length;
  $('#trend-chips').replaceChildren();
  for (const trend of trends) {
    const button = element('button', 'chip', `${trend.topic} ↗`);
    button.title = `Growing coverage across ${trend.origins} observed editorial origins; not readership data.`;
    button.addEventListener('click', () => { persistPreferences({ topic: trend.topic, scroll: 0 }); state.limit = 15; render(); });
    $('#trend-chips').append(button);
  }
}
function renderChannels() {
  const list = $('#x-channel-links'); list.replaceChildren();
  let count = 0;
  for (const stored of state.prefs.xAccounts || []) {
    try {
      const account = xAccount(stored.handle);
      const link = element('a', 'chip', stored.name || `@${account.handle}`); link.href = account.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = `Open @${account.handle} on X`;
      list.append(link); count++;
    } catch { /* Ignore malformed local entries rather than making unsafe links. */ }
  }
  $('#channel-shortcuts').hidden = !count;
  $('#x-channel-count').textContent = `${count} · open on X`;
}
function renderCoverage() {
  const note = $('#coverage-note');
  note.hidden = true;
  if (state.prefs.view === 'local' && state.prefs.country && state.stories.length) {
    const cityMatches = state.stories.filter(s => s.reports.some(a => a.geo.city)).length;
    const description = state.prefs.city && !cityMatches ? `No clear mentions of ${state.prefs.city} in matching country context. Showing wider ${countryName(state.prefs.country)} coverage.` : state.prefs.city ? 'Place matching uses feed text and country context. Check the original reporting for exact locations.' : 'Showing country coverage. Add a city in Settings for more local matches.';
    note.textContent = description; note.hidden = false;
  } else if (!navigator.onLine) { note.textContent = 'You’re offline. This is your last saved brief; articles open when a connection is available.'; note.hidden = false; }
}
function whyPanel(story, container) {
  container.replaceChildren(element('p', '', 'A local estimate from the headline and feed description. Missing evidence receives no boost. These signals measure newsworthiness, not accuracy.'));
  for (const factor of story.lead.scores) {
    const row = element('section', 'factor');
    row.append(element('h3', '', factor.name), element('span', '', `${factor.weight}% starting weight`));
    const progress = element('progress', 'factor-meter'); progress.max = 1; progress.value = factor.value; progress.setAttribute('aria-label', `${factor.name}: ${factor.evidence.length ? 'evidence found' : 'no clear evidence'}`);
    row.append(progress, element('p', '', factor.explanation)); container.append(row);
  }
  const detail = story.trend ? 'Coverage is increasing across observed editorial origins.' : state.cache.historySince && Date.now() - state.cache.historySince >= 4 * 3600000 ? 'No qualifying coverage-growth boost for this event.' : 'Collecting four hours of observations before estimating coverage trends.';
  container.append(element('p', '', `Ranking: 90% newsworthiness and up to 10% coverage trend. ${detail}${!state.prefs.country ? ' Proximity weight is redistributed until you choose a location.' : ''}`));
}
function reportsPanel(story, container) {
  container.replaceChildren(element('p', '', 'Related reports are grouped by headline similarity. Report counts do not establish independent verification.'));
  const urls = new Set();
  for (const report of story.reports) {
    if (urls.has(report.url) || !safeUrl(report.url)) continue;
    urls.add(report.url);
    const link = element('a', '', report.title); link.href = report.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(element('span', '', `${report.sourceName} · ${ageLabel(report.publishedAt)}`)); container.append(link);
  }
}
async function toggleSaved(story, button) {
  const data = await api.storage.local.get('saved');
  const saved = data.saved || {};
  const isSaved = story.reports.some(a => saved[a.url]);
  if (isSaved) { for (const a of story.reports) delete saved[a.url]; }
  else {
    if (Object.keys(saved).length >= 300) { toast('Your reading list holds 300 stories. Remove one to save another.'); return; }
    saved[story.lead.url] = { ...story.lead, scores: undefined, geo: undefined, tags: undefined, savedAt: Date.now() };
  }
  await api.storage.local.set({ saved }); state.saved = saved;
  button.setAttribute('aria-pressed', String(!isSaved)); button.setAttribute('aria-label', isSaved ? 'Save story' : 'Remove from saved stories'); button.title = isSaved ? 'Save story' : 'Remove from saved stories';
  toast(isSaved ? 'Removed from your reading list.' : 'Saved for a quieter moment.');
  if (state.prefs.view === 'saved') render();
}
async function hideStory(story) {
  const { hidden: stored } = await api.storage.local.get('hidden');
  const now = Date.now();
  const hidden = Object.fromEntries(Object.entries(stored || {}).filter(([, time]) => now - time < 7 * DAY).slice(-1500));
  for (const a of story.reports) hidden[a.url] = now;
  await api.storage.local.set({ hidden }); state.hidden = hidden; render();
  toast('Story hidden from your brief.', async () => {
    const { hidden: current = {} } = await api.storage.local.get('hidden');
    for (const a of story.reports) if (current[a.url] === now) delete current[a.url];
    await api.storage.local.set({ hidden: current }); state.hidden = current; render();
  });
}
function card(story) {
  const article = $('#story-template').content.firstElementChild.cloneNode(true);
  const lead = story.lead;
  article.dataset.event = story.id;
  article.querySelector('.source-monogram').textContent = lead.sourceName[0];
  article.querySelector('.source-name').textContent = `${lead.sourceName}${lead.via ? ` · via ${lead.via}` : lead.platform ? ` · ${lead.platform}` : ''}`;
  const time = article.querySelector('time'); time.textContent = ageLabel(lead.publishedAt);
  if (lead.publishedAt) { time.dateTime = new Date(lead.publishedAt).toISOString(); time.title = new Date(lead.publishedAt).toLocaleString(); }
  const link = article.querySelector('.story-link'); link.textContent = lead.title; link.href = safeUrl(lead.url) || '#';
  link.addEventListener('click', () => { persistPreferences({ scroll: $('#news-scroll').scrollTop }); });
  article.querySelector('.story-summary').textContent = lead.summary;
  for (const tag of lead.tags) { const label = element('span', 'tag', tag.text); label.dataset.kind = tag.kind; article.querySelector('.story-tags').append(label); }
  const savedButton = article.querySelector('.save-story');
  const isSaved = story.reports.some(a => state.saved[a.url]);
  savedButton.setAttribute('aria-pressed', String(isSaved)); savedButton.setAttribute('aria-label', isSaved ? 'Remove from saved stories' : 'Save story'); savedButton.title = isSaved ? 'Remove from saved stories' : 'Save story';
  savedButton.addEventListener('click', () => toggleSaved(story, savedButton).catch(error => toast(error.message)));
  article.querySelector('.hide-story').addEventListener('click', () => hideStory(story).catch(error => toast(error.message)));
  const why = article.querySelector('.why-button');
  why.addEventListener('click', () => {
    const panel = article.querySelector('.why-panel'); const opening = panel.hidden;
    if (opening) whyPanel(story, panel); panel.hidden = !opening; why.setAttribute('aria-expanded', String(opening));
  });
  const reports = article.querySelector('.reports-button');
  const count = new Set(story.reports.map(a => a.url)).size;
  reports.textContent = `${count} ${count === 1 ? 'report' : 'reports'} ↗`;
  reports.addEventListener('click', () => {
    const panel = article.querySelector('.reports-panel'); const opening = panel.hidden;
    if (opening) reportsPanel(story, panel); panel.hidden = !opening; reports.setAttribute('aria-expanded', String(opening));
  });
  return article;
}
function emptyState() {
  const box = element('section', 'empty-state'); const art = element('div', 'empty-icon'); art.append(icon(state.prefs.view === 'saved' ? 'bookmark' : 'globe')); box.append(art);
  let title = 'A little quiet here.', description = 'Try another topic or check your selected sources.', action = 'Manage sources', onClick = () => settings('sources');
  if (state.prefs.search || state.prefs.topic !== 'All') { title = 'No matching stories.'; description = 'Try a broader search or return to all topics.'; action = 'Clear filters'; onClick = () => { persistPreferences({ search: '', topic: 'All' }); render(); }; }
  else if (state.prefs.view === 'saved') { title = 'Keep a story for later.'; description = 'Use the bookmark on any story. Saved links stay here when the news moves on.'; action = 'Back to Top'; onClick = () => switchView('top'); }
  else if (state.prefs.view === 'local' && !state.prefs.country) { title = 'Make yourself at home.'; description = 'Choose a country and optional city to find stories closer to you.'; action = 'Choose your location'; onClick = () => settings('location'); }
  else if (state.prefs.view === 'local') { title = 'No recent local matches.'; description = 'Your feeds may not cover this area yet. Add a regional feed or explore World news.'; }
  else if (!availableArticles().length) { title = navigator.onLine ? 'Your brief is taking shape.' : 'Your first brief needs a connection.'; description = 'Enable at least one source and allow feed access. If a publisher is unavailable, the other sources can still update.'; }
  box.append(element('h2', '', title), element('p', '', description));
  const button = element('button', 'button secondary', action); button.addEventListener('click', onClick); box.append(button);
  return box;
}
function render({ restoreScroll = false } = {}) {
  theme();
  $('#welcome').hidden = state.prefs.setup; $('#reader').hidden = !state.prefs.setup;
  if (!state.prefs.setup) return;
  const previousScroll = $('#news-scroll').scrollTop;
  renderHeading(); state.stories = storiesNow(); renderTrends(); renderChannels(); renderCoverage();
  const fragment = document.createDocumentFragment();
  if (!state.stories.length && state.refreshing && !availableArticles().length && state.prefs.view !== 'saved') {
    for (let i = 0; i < 2; i++) { const placeholder = element('div', 'skeleton-card'); placeholder.setAttribute('aria-hidden', 'true'); for (let n = 0; n < 4; n++) placeholder.append(element('div', `skeleton-line${n === 1 || n === 2 ? ' large' : ''}`)); fragment.append(placeholder); }
  } else if (!state.stories.length) fragment.append(emptyState());
  else for (const story of state.stories.slice(0, state.limit)) fragment.append(card(story));
  $('#stories').replaceChildren(fragment);
  $('#load-more').hidden = state.stories.length <= state.limit;
  $('#end-note').hidden = !state.stories.length || state.stories.length > state.limit;
  state.pending = false; $('#new-stories').hidden = true;
  updateStatus();
  $('#news-scroll').scrollTop = restoreScroll ? state.prefs.scroll || 0 : previousScroll;
}
function switchView(view) {
  state.limit = 15; persistPreferences({ view, scroll: 0 }); render(); $('#news-scroll').scrollTop = 0; announce(`Showing ${view === 'saved' ? 'saved' : view} stories.`);
}
async function requestRefresh(force = false) {
  if (state.refreshing) return;
  state.refreshing = true; updateStatus();
  if (!availableArticles().length) render();
  try {
    const result = await api.runtime.sendMessage({ type: 'refresh', force });
    if (!result.ok) throw new Error(result.error);
    if (!result.checked && force) toast('Sources were checked recently or are waiting to retry. See Sources for details.');
  } catch (error) { toast(`Could not refresh: ${error.message}`); }
  finally { state.refreshing = false; updateStatus(); if (!state.stories.length) render(); }
}

api.runtime.onMessage.addListener(message => {
  if (message.type === 'refresh-started') { state.refreshing = true; updateStatus(); }
  if (message.type === 'refresh-finished') { state.refreshing = false; updateStatus(); if (message.error) toast(message.error); if (!state.stories.length) render(); }
  if (message.type === 'cache-updated') readCache().then(cache => {
    state.cache = cache; updateStatus();
    if (!state.stories.length) { render(); return; }
    const current = state.stories.map(s => `${s.id}:${s.reports.length}:${s.lead.title}`).join('|');
    const next = storiesNow();
    if (current !== next.map(s => `${s.id}:${s.reports.length}:${s.lead.title}`).join('|')) {
      state.pending = true; const added = next.filter(s => !state.stories.some(old => old.id === s.id)).length;
      $('#new-stories').textContent = added ? `${added} new ${added === 1 ? 'story' : 'stories'} · Update brief ↑` : 'Your brief has updates · Show them ↑';
      $('#new-stories').hidden = false; announce(added ? `${added} new stories available.` : 'Updates available.');
    }
  }).catch(error => toast(error.message));
  return false;
});
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !state.loaded) return;
  if (changes.prefs) { const old = state.prefs; state.prefs = prefsWithDefaults(changes.prefs.newValue, DEFAULT_PREFS); theme(); renderChannels(); if (old.country !== state.prefs.country || old.city !== state.prefs.city || old.sourceIds.join() !== state.prefs.sourceIds.join() || old.setup !== state.prefs.setup) render(); }
  if (changes.saved) { state.saved = changes.saved.newValue || {}; document.querySelectorAll('.story-card').forEach(node => { const story = state.stories.find(s => s.id === node.dataset.event); if (story) node.querySelector('.save-story').setAttribute('aria-pressed', String(story.reports.some(a => state.saved[a.url]))); }); }
  if (changes.hidden) state.hidden = changes.hidden.newValue || {};
});

$('#start-setup').addEventListener('click', () => settings('location'));
$('#open-settings').addEventListener('click', () => settings());
$('#source-health').addEventListener('click', () => settings('sources'));
$('#location').addEventListener('click', () => settings('location'));
$('#expand-view').addEventListener('click', () => api.tabs.create({ url: api.runtime.getURL('popup.html?expanded=1') }));
$('#expand-view').hidden = expanded;
$('#saved-view').addEventListener('click', () => switchView(state.prefs.view === 'saved' ? 'top' : 'saved'));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
for (const topic of TOPICS) { const option = element('option', '', topic === 'All' ? 'All topics' : topic); option.value = topic; $('#topic-filter').append(option); }
$('#topic-filter').addEventListener('change', event => { persistPreferences({ topic: event.target.value, scroll: 0 }); state.limit = 15; render(); $('#news-scroll').scrollTop = 0; });
$('#toggle-search').addEventListener('click', () => { const open = $('#search-panel').hidden; $('#search-panel').hidden = !open; $('#toggle-search').setAttribute('aria-expanded', String(open)); if (open) $('#story-search').focus(); else { persistPreferences({ search: '' }); render(); } });
$('#story-search').addEventListener('input', event => { const value = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { persistPreferences({ search: value, scroll: 0 }); state.limit = 15; render(); }, 180); });
$('#load-more').addEventListener('click', () => { state.limit += 15; render(); });
$('#refresh').addEventListener('click', () => requestRefresh(true));
$('#new-stories').addEventListener('click', () => { render(); $('#news-scroll').scrollTop = 0; });
$('#news-scroll').addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(() => persistPreferences({ scroll: $('#news-scroll').scrollTop }), 200); }, { passive: true });
window.addEventListener('offline', updateStatus); window.addEventListener('online', () => { updateStatus(); requestRefresh(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#search-panel').hidden) { $('#search-panel').hidden = true; $('#toggle-search').setAttribute('aria-expanded', 'false'); persistPreferences({ search: '' }); render(); $('#toggle-search').focus(); } });

async function init() {
  $('#today').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date());
  const data = await api.storage.local.get(['prefs', 'saved', 'hidden']);
  state.prefs = prefsWithDefaults(data.prefs, DEFAULT_PREFS);
  if (!['top', 'latest', 'local', 'world', 'saved'].includes(state.prefs.view)) state.prefs.view = 'top';
  state.saved = data.saved || {}; state.hidden = data.hidden || {};
  state.cache = await readCache(); state.loaded = true;
  render({ restoreScroll: true });
  if (state.prefs.setup) {
    const response = await api.runtime.sendMessage({ type: 'wake' });
    state.refreshing = Boolean(response.refreshing); updateStatus();
    if (!state.refreshing) requestRefresh();
  }
}
init().catch(error => { $('#welcome').hidden = false; toast(`Could not load your brief: ${error.message}`); });
