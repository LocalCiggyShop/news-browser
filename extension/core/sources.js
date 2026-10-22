import { hash } from './utils.js';

export const SOURCES = [
  { id: 'bbc-world', name: 'BBC News', label: 'World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', group: 'bbc', scope: 'world', country: 'GB', language: 'en', terms: 'https://www.bbc.co.uk/usingthebbc/terms/' },
  { id: 'guardian-world', name: 'The Guardian', label: 'World', url: 'https://www.theguardian.com/world/rss', group: 'guardian', scope: 'world', country: 'GB', language: 'en', terms: 'https://www.theguardian.com/help/feeds' },
  { id: 'aljazeera', name: 'Al Jazeera', label: 'International', url: 'https://www.aljazeera.com/xml/rss/all.xml', group: 'aljazeera', scope: 'world', country: 'QA', language: 'en', terms: 'https://www.aljazeera.com/terms-and-conditions' },
  { id: 'dw-world', name: 'DW', label: 'International', url: 'https://rss.dw.com/rdf/rss-en-top', group: 'dw', scope: 'world', country: 'DE', language: 'en', terms: 'https://www.dw.com/en/terms-of-use/a-16390866' },
  { id: 'bbc-uk', name: 'BBC News', label: 'United Kingdom', url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', group: 'bbc', scope: 'national', country: 'GB', language: 'en' },
  { id: 'guardian-au', name: 'The Guardian', label: 'Australia', url: 'https://www.theguardian.com/australia-news/rss', group: 'guardian', scope: 'national', country: 'AU', language: 'en' },
  { id: 'abc-au', name: 'ABC News Australia', label: 'Australia', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', group: 'abc-au', scope: 'national', country: 'AU', language: 'en' },
  { id: 'npr-us', name: 'NPR', label: 'United States', url: 'https://feeds.npr.org/1001/rss.xml', group: 'npr', scope: 'national', country: 'US', language: 'en' },
  { id: 'cbc-ca', name: 'CBC News', label: 'Canada', url: 'https://www.cbc.ca/webfeed/rss/rss-topstories', group: 'cbc', scope: 'national', country: 'CA', language: 'en' },
  { id: 'rnz-nz', name: 'RNZ', label: 'New Zealand', url: 'https://www.rnz.co.nz/rss/national.xml', group: 'rnz', scope: 'national', country: 'NZ', language: 'en' },
  { id: 'cnn-us', name: 'CNN', label: 'United States · via Google News', url: 'https://news.google.com/rss/search?q=site%3Acnn.com%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen', group: 'cnn', scope: 'national', country: 'US', language: 'en', via: 'Google News', aggregate: true, publisherDomain: 'cnn.com', terms: 'https://news.google.com/' },
  { id: 'pbs-us', name: 'PBS News', label: 'United States', url: 'https://www.pbs.org/newshour/feeds/rss/headlines', group: 'pbs', scope: 'national', country: 'US', language: 'en', terms: 'https://www.pbs.org/newshour/about/pbs-news-rss-feeds' },
  { id: 'cbs-us', name: 'CBS News', label: 'United States', url: 'https://www.cbsnews.com/latest/rss/main', group: 'cbs', scope: 'national', country: 'US', language: 'en' },
  { id: 'abc-us', name: 'ABC News US', label: 'United States', url: 'https://abcnews.com/abcnews/topstories', group: 'abc-us', scope: 'national', country: 'US', language: 'en' },
  { id: 'france24-world', name: 'France 24', label: 'International · English', url: 'https://www.france24.com/en/rss', group: 'france24', scope: 'world', country: 'FR', language: 'en' },
  { id: 'sky-world', name: 'Sky News', label: 'World', url: 'https://feeds.skynews.com/feeds/rss/world.xml', group: 'sky', scope: 'world', country: 'GB', language: 'en' },
  { id: 'sky-uk', name: 'Sky News', label: 'United Kingdom', url: 'https://feeds.skynews.com/feeds/rss/uk.xml', group: 'sky', scope: 'national', country: 'GB', language: 'en' },
  { id: 'sbs-au', name: 'SBS News', label: 'Australia', url: 'https://www.sbs.com.au/news/topic/australia/feed', group: 'sbs', scope: 'national', country: 'AU', language: 'en', terms: 'https://www.sbs.com.au/news/article/feeds/nbv1rs3kw' },
  { id: 'sbs-world', name: 'SBS News', label: 'World', url: 'https://www.sbs.com.au/news/topic/world/feed', group: 'sbs', scope: 'world', country: 'AU', language: 'en' },
  { id: 'nasa', name: 'NASA', label: 'Space & science · primary source', url: 'https://www.nasa.gov/news-release/feed/', group: 'nasa', scope: 'world', country: 'US', language: 'en', kind: 'primary', topics: ['Science', 'Technology'], terms: 'https://www.nasa.gov/rss-feeds/' },
  { id: 'who', name: 'World Health Organization', label: 'Health · primary source', url: 'https://www.who.int/rss-feeds/news-english.xml', group: 'who', scope: 'world', country: '', language: 'en', kind: 'primary', topics: ['Health'] },
  { id: 'un', name: 'UN News', label: 'International · primary source', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', group: 'un', scope: 'world', country: '', language: 'en', kind: 'primary' },
];
export const DEFAULT_SOURCES = ['bbc-world', 'guardian-world', 'aljazeera'];
export const COUNTRY_SOURCES = {
  US: ['cnn-us', 'npr-us', 'pbs-us'], AU: ['abc-au', 'guardian-au'], GB: ['bbc-uk', 'sky-uk'], CA: ['cbc-ca'], NZ: ['rnz-nz'], FR: ['france24-world'], DE: ['dw-world'],
};
export const COUNTRIES = [
  ['AU', 'Australia', ['australia', 'australian']], ['CA', 'Canada', ['canada', 'canadian']],
  ['GB', 'United Kingdom', ['united kingdom', 'britain', 'british', 'england', 'scotland', 'wales', 'northern ireland']],
  ['US', 'United States', ['united states', 'u.s.', 'american']], ['NZ', 'New Zealand', ['new zealand']],
  ['IE', 'Ireland', ['ireland', 'irish']], ['DE', 'Germany', ['germany', 'german']],
  ['FR', 'France', ['france', 'french']], ['IN', 'India', ['india', 'indian']],
  ['SG', 'Singapore', ['singapore']], ['ZA', 'South Africa', ['south africa']],
  ['JP', 'Japan', ['japan', 'japanese']], ['CN', 'China', ['china', 'chinese']],
  ['BR', 'Brazil', ['brazil', 'brazilian']], ['IT', 'Italy', ['italy', 'italian']],
  ['ES', 'Spain', ['spain', 'spanish']], ['MX', 'Mexico', ['mexico', 'mexican']],
  ['PH', 'Philippines', ['philippines', 'filipino']], ['PK', 'Pakistan', ['pakistan', 'pakistani']],
  ['BD', 'Bangladesh', ['bangladesh', 'bangladeshi']], ['ID', 'Indonesia', ['indonesia', 'indonesian']],
  ['MY', 'Malaysia', ['malaysia', 'malaysian']], ['AE', 'United Arab Emirates', ['united arab emirates', 'uae']],
  ['UA', 'Ukraine', ['ukraine', 'ukrainian']], ['IL', 'Israel', ['israel', 'israeli']],
  ['PS', 'Palestine', ['palestine', 'palestinian', 'gaza', 'west bank']],
  ['RU', 'Russia', ['russia', 'russian']], ['IR', 'Iran', ['iran', 'iranian']],
].sort((a, b) => a[1].localeCompare(b[1]));
export const TOPICS = ['All', 'Politics', 'Business', 'Technology', 'Science', 'Health', 'Climate', 'Sport', 'Culture'];
export const DEFAULT_PREFS = Object.freeze({ setup: false, country: '', city: '', sourceIds: DEFAULT_SOURCES, customSources: [], xAccounts: [], localNewsEnabled: true, theme: 'system', refreshMinutes: 15, view: 'top', topic: 'All', search: '', scroll: 0 });
export function localSourceFor(country, city) {
  const place = String(city || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!place || !COUNTRIES.some(c => c[0] === country)) return null;
  const query = new URLSearchParams({ q: `"${place.replace(/["\\]/g, '')}" "${countryName(country)}" when:2d`, hl: 'en-US', gl: country, ceid: `${country}:en` });
  return { id: `local-${country.toLowerCase()}-${hash(place.toLowerCase())}`, name: `${place} local news`, label: `${countryName(country)} · via Google News`, url: `https://news.google.com/rss/search?${query}`, group: 'local-news', scope: 'national', country, language: 'en', locality: place, aggregate: true, via: 'Google News', kind: 'local' };
}
export function recommendedSourceIds(country = '', city = '') {
  const local = localSourceFor(country, city);
  return [...new Set([...DEFAULT_SOURCES, ...(COUNTRY_SOURCES[country] || []), ...(local ? [local.id] : [])])];
}
export function getSources(prefs) {
  const local = localSourceFor(prefs.country, prefs.city);
  return [...SOURCES, ...(prefs.customSources || []), ...(local ? [local] : [])];
}
export function enabledSources(prefs) { return getSources(prefs).filter(s => prefs.sourceIds.includes(s.id)); }
export function originFor(url) { return `${new URL(url).origin}/*`; }
export function countryName(code) { return COUNTRIES.find(c => c[0] === code)?.[1] || ''; }
