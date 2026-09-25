import { canonical } from '../../shared/providers.ts';
import type { Candidate } from '../../shared/contracts.ts';
export const REDDIT_POSTS = 'shreddit-post, article, .thing.link, [data-testid="post-container"]';
export function redditCandidate(target: Element, pageUrl: string): Candidate | null {
  const post = target.closest(REDDIT_POSTS);
  if (!post) return null;
  for (const attr of ['permalink', 'data-permalink']) {
    const value = post.getAttribute(attr);
    const result = value ? canonical(new URL(value, pageUrl).href) : null;
    if (result?.provider === 'reddit') return result;
  }
  const ownLinks = [...post.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]')]
    .filter(link => link.closest(REDDIT_POSTS) === post)
    .map(link => canonical(new URL(link.getAttribute('href')!, pageUrl).href))
    .filter((value): value is Candidate => !!value && value.provider === 'reddit');
  const unique = new Map(ownLinks.map(value => [value.contentId, value]));
  return unique.size === 1 ? [...unique.values()][0]! : null;
}
