import { canonicalUrl, hash, validDate } from './utils.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©' };
export function decodeEntities(text) {
  return String(text).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, name) => {
    if (!name.startsWith('#')) return ENTITIES[name] ?? all;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
  });
}
export function plainText(text, max = 500) {
  return decodeEntities(String(text).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);
}
const local = name => name.toLowerCase().split(':').pop();
function children(node, name) { return node.children.filter(c => typeof c === 'object' && local(c.name) === name); }
function textOf(node) { return node ? node.children.map(c => typeof c === 'string' ? c : textOf(c)).join('') : ''; }
function field(node, name) { return textOf(children(node, name)[0]); }
function descendants(node, name, out = []) {
  for (const child of node.children) if (typeof child === 'object') { if (local(child.name) === name) out.push(child); else descendants(child, name, out); }
  return out;
}

// Bounded, non-validating RSS/Atom parser. No DOM or entity expansion is needed in a service worker.
export function parseXml(xml) {
  if (typeof xml !== 'string' || xml.length > 2000000) throw new Error('Feed exceeds the 2 MB limit.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Document types and external entities are not supported.');
  const document = { name: '#document', children: [] };
  const stack = [document];
  const tokens = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g;
  let nodes = 0, cursor = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== cursor) throw new Error('Malformed XML.');
    const token = match[0]; cursor += token.length;
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    const parent = stack[stack.length - 1];
    if (token.startsWith('<![CDATA[')) { parent.children.push(token.slice(9, -3)); continue; }
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim();
      if (stack.length < 2 || stack.pop().name !== name) throw new Error('Malformed XML closing tag.');
    } else if (token.startsWith('<')) {
      const name = /^<([\w:.-]+)/.exec(token)?.[1];
      if (!name || ++nodes > 30000 || stack.length > 64) throw new Error('Invalid or overly complex feed.');
      const attrs = Object.create(null);
      for (const a of token.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3]);
      const node = { name, attrs, children: [] }; parent.children.push(node);
      if (!/\/\s*>$/.test(token)) stack.push(node);
    } else parent.children.push(decodeEntities(token));
  }
  if (cursor !== xml.length || stack.length !== 1) throw new Error('Incomplete XML feed.');
  const roots = document.children.filter(c => typeof c === 'object');
  if (roots.length !== 1 || !['rss', 'rdf', 'feed'].includes(local(roots[0].name))) throw new Error('This address did not return an RSS or Atom feed.');
  return roots[0];
}

export function parseFeed(xml, source, now = Date.now()) {
  const root = parseXml(xml);
  const channel = children(root, 'channel')[0] || root;
  const language = (field(channel, 'language') || root.attrs['xml:lang'] || source.language || 'en').slice(0, 12);
  const entries = [...descendants(root, 'item'), ...descendants(root, 'entry')].slice(0, 150);
  const articles = new Map();
  for (const item of entries) {
    const links = children(item, 'link');
    const linkNode = links.find(n => n.attrs?.href && (!n.attrs.rel || n.attrs.rel === 'alternate'));
    const link = linkNode?.attrs.href || field(item, 'link') || field(item, 'guid');
    let url;
    try { url = canonicalUrl(new URL(link.trim(), source.url).href); } catch { continue; }
    const title = plainText(field(item, 'title'), 280);
    if (!url || !title || !link.trim()) continue;
    const publisher = children(item, 'source')[0];
    const publisherName = plainText(textOf(publisher), 100);
    const publisherUrl = publisher?.attrs?.url ? canonicalUrl(publisher.attrs.url) : null;
    const publisherHost = publisherUrl ? new URL(publisherUrl).hostname.replace(/^www\./, '') : '';
    if (source.aggregate && (!publisherName || !publisherHost)) continue;
    if (source.publisherDomain && publisherHost !== source.publisherDomain && !publisherHost.endsWith(`.${source.publisherDomain}`)) continue;
    const publishedAt = validDate(field(item, 'pubdate') || field(item, 'published') || field(item, 'date'));
    const updatedAt = validDate(field(item, 'updated'));
    const categories = children(item, 'category').map(n => plainText(n.attrs.term || textOf(n), 60)).slice(0, 12);
    const author = plainText(field(item, 'creator') || field(item, 'author'), 100);
    const wire = /\b(reuters|associated press|agence france-presse|\bafp\b)\b/i.exec(author)?.[1]?.toLowerCase();
    const summary = source.aggregate ? '' : plainText(field(item, 'description') || field(item, 'summary') || field(item, 'encoded') || field(item, 'content'), 360);
    const id = hash(`${source.id}:${url}`);
    articles.set(id, { id, url, title, summary, publishedAt, updatedAt, firstSeenAt: now, lastSeenAt: now, sourceId: source.id, sourceName: source.aggregate ? publisherName : source.name, origin: source.aggregate ? (source.publisherDomain || publisherHost) : wire || source.group, sourceScope: source.scope, sourceCountry: source.country || '', sourceLocality: source.locality || '', via: source.via || '', platform: source.platform || '', language, categories, author });
  }
  return { title: plainText(field(channel, 'title'), 120), articles: [...articles.values()] };
}
