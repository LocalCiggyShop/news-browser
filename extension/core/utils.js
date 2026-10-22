export const HOUR = 3600000;
export const DAY = 24 * HOUR;
export function hash(value) {
  let n = 2166136261;
  for (const char of value) { n ^= char.codePointAt(0); n = Math.imul(n, 16777619); }
  return (n >>> 0).toString(36);
}
export function safeUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function canonicalUrl(value) {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function normalise(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function containsPhrase(text, phrase) { return ` ${normalise(text)} `.includes(` ${normalise(phrase)} `); }
export function ageLabel(time, now = Date.now()) {
  if (!time) return 'Undated';
  if (time > now + 5 * 60000) return 'Date needs checking';
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return 'Just published';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function checkedLabel(time, now = Date.now()) {
  if (!time) return 'Not checked yet';
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  return minutes < 1 ? 'Checked just now' : minutes < 60 ? `Checked ${minutes}m ago` : `Checked ${Math.floor(minutes / 60)}h ago`;
}
export function validDate(value) { const n = Date.parse(value || ''); return Number.isFinite(n) && n > 0 ? n : null; }
export function prefsWithDefaults(value, defaults) {
  const prefs = { ...defaults, ...value };
  prefs.sourceIds = Array.isArray(prefs.sourceIds) ? prefs.sourceIds : [...defaults.sourceIds];
  prefs.customSources = Array.isArray(prefs.customSources) ? prefs.customSources : [];
  prefs.xAccounts = Array.isArray(prefs.xAccounts) ? prefs.xAccounts : [];
  return prefs;
}
