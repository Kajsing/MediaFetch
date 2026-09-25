import type { Candidate, Provider } from './contracts.ts';

const X = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const REDDIT = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com', 'sh.reddit.com', 'redd.it']);
const YOUTUBE = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
export const PAGE_PATTERNS = [...X, ...REDDIT, ...YOUTUBE].map(host => `https://${host}/*`);
export function providerFor(raw: string): Provider | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return X.has(url.hostname) ? 'x' : REDDIT.has(url.hostname) ? 'reddit' : YOUTUBE.has(url.hostname) ? 'youtube' : null;
  } catch { return null; }
}
export function canonical(raw: unknown): Candidate | null {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\u0000-\u0020\\]/.test(raw)) return null;
  const provider = providerFor(raw);
  if (!provider) return null;
  const url = new URL(raw);
  if (provider === 'youtube') {
    let id: string | undefined;
    if (url.hostname === 'youtu.be') id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
    else if (url.pathname === '/watch') {
      const values = url.searchParams.getAll('v'); if (values.length === 1) id = values[0];
    } else id = /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider, contentId: id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (provider === 'x') {
    const match = /^\/([A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{1,25})(?:\/video\/([1-9]\d?))?\/?$/.exec(url.pathname);
    if (!match) return null;
    const mediaIndex = match[3] ? Number(match[3]) : undefined;
    if (mediaIndex && mediaIndex > 16) return null;
    return { provider, contentId: match[2]!, url: `https://x.com/${match[1]}/status/${match[2]}`, ...(mediaIndex ? { mediaIndex } : {}) };
  }
  const match = url.hostname === 'redd.it' ? /^\/([a-z0-9]{3,12})\/?$/i.exec(url.pathname) : /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]{3,12})(?:\/[^/]*)?\/?$/i.exec(url.pathname);
  if (!match) return null;
  return { provider, contentId: match[1]!.toLowerCase(), url: `https://www.reddit.com/comments/${match[1]!.toLowerCase()}/` };
}
export function requireCandidate(value: unknown): Candidate {
  const candidate = canonical(value);
  if (!candidate) throw new Error('Open a Reddit, X or YouTube video.');
  return candidate;
}
