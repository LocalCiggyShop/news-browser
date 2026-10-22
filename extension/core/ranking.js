import { COUNTRIES } from './sources.js';
import { HOUR, DAY, normalise, hash } from './utils.js';

const RULES = {
  Politics: ['election', 'government', 'parliament', 'president', 'minister', 'vote', 'senate', 'policy', 'congress'],
  Business: ['economy', 'inflation', 'interest rates', 'bank', 'market', 'jobs', 'trade', 'tax', 'cost of living', 'business'],
  Technology: ['technology', 'artificial intelligence', 'software', 'cyber', 'ai', 'chip', 'apple', 'google', 'microsoft', 'internet'],
  Science: ['science', 'scientists', 'research', 'space', 'nasa', 'discovery', 'physics', 'astronomy'],
  Health: ['health', 'hospital', 'disease', 'vaccine', 'doctors', 'cancer', 'outbreak', 'medical', 'mental health'],
  Climate: ['climate', 'flood', 'wildfire', 'emissions', 'environment', 'renewable', 'heatwave', 'drought', 'storm', 'coastal'],
  Sport: ['sport', 'football', 'cricket', 'tennis', 'olympics', 'rugby', 'soccer', 'basketball', 'championship'],
  Culture: ['film', 'music', 'art', 'festival', 'actor', 'culture', 'book', 'museum', 'television'],
};
const SIGNALS = {
  impact: ['evacuation', 'evacuated', 'outbreak', 'power outage', 'public transport', 'hospital', 'hospitals', 'inflation', 'interest rates', 'water supply', 'earthquake', 'flood', 'wildfire', 'killed', 'deaths', 'displaced', 'jobs', 'schools', 'public services', 'rail', 'disruption'],
  prominence: ['president', 'prime minister', 'parliament', 'united nations', 'central bank', 'supreme court', 'government', 'nato', 'world health organization'],
  conflict: ['war', 'conflict', 'dispute', 'protest', 'strike', 'clashes', 'lawsuit', 'attack', 'opposition', 'controversy', 'ceasefire'],
  human: ['volunteers', 'rescued', 'rescue', 'reunited', 'survivor', 'community', 'families', 'charity', 'fundraiser', 'recovery'],
  unusual: ['first ever', 'first time', 'record breaking', 'unprecedented', 'rare discovery', 'never before'],
};
const STOP = new Set('a an the and or but of for to in on at by from with as is are was were be been it its this that these those into over after before amid says said say new latest live updates news how why what who will has have had more than could can about their his her out up not us uk'.split(' '));
const phraseCache = new Map();
function phrase(word) { if (!phraseCache.has(word)) phraseCache.set(word, ` ${normalise(word)} `); return phraseCache.get(word); }
const evidenceFor = (normalised, words) => words.filter(word => normalised.includes(phrase(word)));

export function topicsFor(article) {
  const text = ` ${normalise(`${article.title} ${article.summary} ${(article.categories || []).join(' ')}`)} `;
  const ranked = Object.entries(RULES).map(([topic, words]) => [topic, evidenceFor(text, words).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  return ranked.slice(0, 3).map(([topic]) => topic);
}
export function geography(article, prefs) {
  const text = `${article.title} ${article.summary} ${(article.categories || []).join(' ')}`;
  const normalised = ` ${normalise(text)} `;
  const countries = COUNTRIES.filter(([, , aliases]) => aliases.some(alias => normalised.includes(phrase(alias)))).map(([code]) => code);
  if (/\b(?:US|U\.S\.)\b/.test(text) && !countries.includes('US')) countries.push('US');
  if (/\bUK\b/.test(text) && !countries.includes('GB')) countries.push('GB');
  const explicitCountry = Boolean(prefs.country && countries.includes(prefs.country));
  const nationalFeed = Boolean(prefs.country && article.sourceScope === 'national' && article.sourceCountry === prefs.country);
  const cityMention = Boolean(prefs.country && prefs.city?.trim() && normalised.includes(phrase(prefs.city)) && (explicitCountry || nationalFeed));
  const cityFeed = Boolean(prefs.country && prefs.city?.trim() && article.sourceCountry === prefs.country && normalise(article.sourceLocality) === normalise(prefs.city));
  const city = cityMention || cityFeed;
  return { countries, explicitCountry, nationalFeed, city, cityMention, cityFeed, local: city || explicitCountry || nationalFeed };
}

export function scoreArticle(article, prefs, now = Date.now()) {
  const text = ` ${normalise(`${article.title} ${article.summary}`)} `;
  const geo = geography(article, prefs);
  const hits = Object.fromEntries(Object.entries(SIGNALS).map(([key, terms]) => [key, evidenceFor(text, terms)]));
  const validTime = article.publishedAt && article.publishedAt <= now + 5 * 60000;
  const age = validTime ? Math.max(0, now - article.publishedAt) : null;
  const timeScore = age === null ? 0 : Math.pow(0.5, age / (6 * HOUR));
  const proximity = geo.cityMention ? 1 : geo.cityFeed ? 0.8 : geo.explicitCountry ? 0.65 : geo.nationalFeed ? 0.35 : 0;
  const impact = Math.min(1, hits.impact.length * 0.3);
  const scores = [
    { key: 'impact', name: 'Impact', weight: 25, value: impact, evidence: hits.impact, explanation: hits.impact.length ? `Reporting mentions ${hits.impact.slice(0, 3).join(', ')}. This is an estimate of public consequences.` : 'No clear impact evidence in the feed text.' },
    { key: 'timeliness', name: 'Timeliness', weight: 25, value: timeScore, evidence: validTime ? [new Date(article.publishedAt).toISOString()] : [], explanation: validTime ? 'Based on the original publication time, with a six-hour freshness half-life.' : 'Publication time is missing or in the future; no freshness boost.' },
    { key: 'proximity', name: 'Proximity', weight: 20, value: proximity, evidence: geo.city ? [prefs.city] : geo.explicitCountry ? [prefs.country] : geo.nationalFeed ? ['National feed'] : [], explanation: geo.cityMention ? `Mentions ${prefs.city} in matching country context.` : geo.cityFeed ? `From the selected feed for ${prefs.city}. Event location is not independently confirmed.` : geo.explicitCountry ? 'Mentions your selected country; this may be context rather than the event location.' : geo.nationalFeed ? 'From a national feed for your country; the event location is not confirmed.' : prefs.country ? 'No clear match to your selected location.' : 'Choose a location to enable this signal.' },
    { key: 'prominence', name: 'Prominence', weight: 10, value: Math.min(1, hits.prominence.length * 0.4), evidence: hits.prominence, explanation: hits.prominence.length ? `Mentions ${hits.prominence.slice(0, 2).join(', ')}.` : 'No prominence evidence in the feed text.' },
    { key: 'conflict', name: 'Conflict', weight: 8, value: Math.min(1, hits.conflict.length * 0.4), evidence: hits.conflict, explanation: hits.conflict.length ? `Mentions ${hits.conflict.slice(0, 2).join(', ')}.` : 'No conflict evidence in the feed text.' },
    { key: 'human', name: 'Human interest', weight: 7, value: Math.min(1, hits.human.length * 0.4), evidence: hits.human, explanation: hits.human.length ? `Mentions ${hits.human.slice(0, 2).join(', ')}.` : 'No human-interest evidence in the feed text.' },
    { key: 'unusual', name: 'The unusual', weight: 5, value: Math.min(1, hits.unusual.length * 0.5), evidence: hits.unusual, explanation: hits.unusual.length ? `Uses ${hits.unusual.slice(0, 2).join(', ')}; rarity has not been independently established.` : 'No explicit rarity evidence in the feed text.' },
  ];
  // Without a home location, redistribute the unavailable proximity weight.
  const availableWeight = prefs.country ? 100 : 80;
  const newsworthiness = scores.reduce((n, s) => n + s.weight * s.value, 0) / availableWeight;
  const tags = [];
  if (geo.city) tags.push({ text: 'Near you', kind: 'local' });
  else if (geo.explicitCountry) tags.push({ text: 'Your country', kind: 'local' });
  if (impact >= 0.6) tags.push({ text: 'Public impact', kind: 'impact' });
  if (hits.human.length && tags.length < 2) tags.push({ text: 'Human interest', kind: 'human' });
  if (hits.unusual.length && tags.length < 2) tags.push({ text: 'Unusual', kind: 'unusual' });
  return { newsworthiness, scores, tags: tags.slice(0, 2), geo, topics: topicsFor(article) };
}

export function headlineTokens(title) { return new Set(normalise(title).split(' ').filter(t => t.length > 2 && !STOP.has(t))); }
function signature(a) { return { url: a.url, time: a.publishedAt || a.firstSeenAt, title: normalise(a.title), tokens: headlineTokens(a.title) }; }
function sameSignature(a, b) {
  if (a.url === b.url) return true;
  if (Math.abs(a.time - b.time) > 18 * HOUR) return false;
  if (a.title === b.title) return true;
  const ta = a.tokens, tb = b.tokens;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap++;
  const union = ta.size + tb.size - overlap;
  // Conservative overlap avoids treating every report about a place/person as one event.
  return overlap >= 4 && union > 0 && overlap / union >= 0.60;
}
export function sameEvent(a, b) { return sameSignature(signature(a), signature(b)); }
export function clusterArticles(articles) {
  const clusters = [];
  const sorted = [...articles].sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.id.localeCompare(b.id));
  const signatures = [];
  for (const article of sorted) {
    const entry = signature(article);
    const index = signatures.findIndex(first => sameSignature(first, entry));
    const existing = index >= 0 ? clusters[index] : null;
    if (existing) existing.articles.push(article);
    else { clusters.push({ id: `event-${hash(article.url)}`, articles: [article] }); signatures.push(entry); }
  }
  return clusters;
}
export function trendFor(articles, now = Date.now(), totalRecent = 0, totalPrevious = 0) {
  const recentOrigins = new Set(), previousOrigins = new Set();
  for (const a of articles) {
    if (!a.trendEligible) continue;
    const age = now - a.firstSeenAt;
    if (age >= 0 && age < 2 * HOUR) recentOrigins.add(a.origin);
    else if (age < 4 * HOUR && age >= 2 * HOUR) previousOrigins.add(a.origin);
  }
  const recent = recentOrigins.size, previous = previousOrigins.size;
  const growth = recent / Math.max(1, totalRecent) - previous / Math.max(1, totalPrevious);
  return recent < 2 || growth <= 0 ? 0 : Math.min(1, growth * 8);
}
export function topicTrends(articles, now = Date.now(), historySince = 0) {
  if (!historySince || now - historySince < 4 * HOUR) return [];
  const sourceVolumes = new Map();
  for (const a of articles) {
    if (!a.trendEligible || now - a.firstSeenAt >= 4 * HOUR) continue;
    const v = sourceVolumes.get(a.origin) || { recent: 0, previous: 0 };
    v[now - a.firstSeenAt < 2 * HOUR ? 'recent' : 'previous']++;
    sourceVolumes.set(a.origin, v);
  }
  const events = clusterArticles(articles.filter(a => a.trendEligible && now - a.firstSeenAt < 4 * HOUR));
  const counts = new Map();
  for (const event of events) {
    const seen = new Set();
    for (const a of event.articles) {
      const period = now - a.firstSeenAt < 2 * HOUR ? 'recent' : 'previous';
      for (const topic of topicsFor(a)) {
        const key = `${topic}:${a.origin}:${period}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const count = counts.get(topic) || { recent: 0, previous: 0, origins: new Set() };
        count[period] += 1 / Math.max(1, sourceVolumes.get(a.origin)?.[period] || 1);
        if (period === 'recent') count.origins.add(a.origin);
        counts.set(topic, count);
      }
    }
  }
  return [...counts].filter(([, c]) => c.origins.size >= 2 && c.recent > c.previous).map(([topic, c]) => ({ topic, growth: c.recent - c.previous, origins: c.origins.size })).sort((a, b) => b.growth - a.growth).slice(0, 4);
}

export function prepareStories(articles, prefs, { now = Date.now(), hidden = {}, saved = {}, historySince = 0, view = prefs.view, topic = prefs.topic, search = '' } = {}) {
  const savedMode = view === 'saved';
  let pool = articles.filter(a => !hidden[a.url] && (savedMode || !a.publishedAt || a.publishedAt > now + 5 * 60000 || now - a.publishedAt < 2 * DAY));
  if (savedMode) pool = Object.values(saved);
  if (view === 'latest') pool = [...pool].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  const recent = new Set(pool.filter(a => a.trendEligible && now - a.firstSeenAt < 2 * HOUR).map(a => a.origin)).size;
  const previous = new Set(pool.filter(a => a.trendEligible && now - a.firstSeenAt >= 2 * HOUR && now - a.firstSeenAt < 4 * HOUR).map(a => a.origin)).size;
  let stories = clusterArticles(pool).map(cluster => {
    const reports = cluster.articles.map(a => ({ ...a, ...scoreArticle(a, prefs, now) })).sort((a, b) => b.newsworthiness - a.newsworthiness || a.firstSeenAt - b.firstSeenAt);
    const lead = reports[0];
    const trend = now - historySince >= 4 * HOUR && historySince ? trendFor(reports, now, recent, previous) : 0;
    const base = lead.newsworthiness * 0.9 + trend * 0.1;
    return { ...cluster, lead, reports, score: base, trend, newest: Math.max(...reports.map(a => a.publishedAt && a.publishedAt <= now + 5 * 60000 ? a.publishedAt : 0)), topics: [...new Set(reports.flatMap(a => a.topics))] };
  });
  if (view === 'local') stories = prefs.country ? stories.filter(s => s.reports.some(a => a.geo.local)) : [];
  if (view === 'world') stories = stories.filter(s => s.reports.some(a => a.sourceScope === 'world' && (!prefs.country || a.geo.countries.length !== 1 || a.geo.countries[0] !== prefs.country)));
  if (topic && topic !== 'All') stories = stories.filter(s => s.topics.includes(topic));
  if (search.trim()) {
    const terms = normalise(search).split(' ');
    stories = stories.filter(s => terms.every(t => normalise(`${s.lead.title} ${s.lead.summary} ${s.lead.sourceName}`).includes(t)));
  }
  if (view === 'latest') return stories.sort((a, b) => b.newest - a.newest);
  if (savedMode) return stories.sort((a, b) => (b.lead.savedAt || 0) - (a.lead.savedAt || 0));
  stories.sort((a, b) => view === 'local' ? Number(b.lead.geo.city) - Number(a.lead.geo.city) || b.score - a.score : b.score - a.score);
  // Keep the first ten varied when alternatives exist, then retain every remaining story.
  const first = [], rest = [], counts = new Map();
  for (const story of stories) {
    const origin = story.lead.origin;
    if (first.length < 10 && (counts.get(origin) || 0) < 2) { first.push(story); counts.set(origin, (counts.get(origin) || 0) + 1); }
    else rest.push(story);
  }
  return [...first, ...rest];
}
