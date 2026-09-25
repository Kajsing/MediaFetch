import { canonical } from '../../shared/providers.ts';
import type { Candidate } from '../../shared/contracts.ts';

export const YOUTUBE_POSTS = 'ytd-watch-flexy, ytd-reel-video-renderer';

function activeVideo(root: Element, page: string): Candidate | null {
  const current = canonical(page);
  if (current?.provider !== 'youtube' || root.closest('[hidden], [aria-hidden="true"]')) return null;
  if (!root.querySelector('video') || root.querySelector('.ad-showing, .ad-interrupting')) return null;
  if (root.matches('ytd-watch-flexy')) {
    return new URL(page).pathname === '/watch' && root.getAttribute('video-id') === current.contentId ? current : null;
  }
  if (!new URL(page).pathname.startsWith('/shorts/') || !root.hasAttribute('is-active')) return null;
  const id = root.getAttribute('video-id');
  if (id) return id === current.contentId ? current : null;
  // Some Shorts layouts expose the current identity as an explicit permalink.
  // Do not use internal Polymer state or assume the URL identifies a recycled player.
  const ids = new Set([...root.querySelectorAll('a[href]')].map(link => {
    try {
      const linked = canonical(new URL(link.getAttribute('href')!, page).href);
      return linked?.provider === 'youtube' ? linked.contentId : undefined;
    } catch { return undefined; }
  }).filter(Boolean));
  return ids.size === 1 && ids.has(current.contentId) ? current : null;
}

export function youtubeCandidate(target: Element, page: string): Candidate | null {
  const link = target.closest('a[href]');
  if (link) {
    try {
      const explicit = canonical(new URL(link.getAttribute('href')!, page).href);
      if (explicit?.provider === 'youtube') return explicit;
    } catch { /* An invalid page link cannot become a download request. */ }
  }
  const root = target.closest(YOUTUBE_POSTS);
  return root ? activeVideo(root, page) : null;
}

export function youtubeControlAnchor(root: Element): Element | null {
  if (root.matches('ytd-watch-flexy')) return root.querySelector('ytd-watch-metadata #top-row') ?? root.querySelector('#above-the-fold #title');
  return root.querySelector('#actions');
}
