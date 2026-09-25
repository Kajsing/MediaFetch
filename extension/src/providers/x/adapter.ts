import { canonical } from '../../shared/providers.ts';
import type { Candidate } from '../../shared/contracts.ts';
export const X_POSTS = 'article[data-testid="tweet"], article';
const QUOTES = '[data-testid="quoteTweet"], [data-mediafetch-quote]';
const PLAYERS = '[data-testid="videoPlayer"], [data-testid="videoComponent"]';

function playerFor(target: Element): Element {
  return target.closest('[data-testid="videoPlayer"]') ?? target.closest(PLAYERS) ?? target;
}
export function xIsGif(target: Element): boolean {
  const player = playerFor(target);
  // X renders GIFs in the same video wrapper. Only inspect labels within that
  // player; post text mentioning "GIF" and ordinary looping videos are not GIF evidence.
  return [player, ...player.querySelectorAll('span, div, [aria-label]')].some(node =>
    /^gif$/i.test(node.getAttribute('aria-label')?.trim() ?? '')
    || (node.childElementCount === 0 && /^gif$/i.test(node.textContent?.trim() ?? '')),
  );
}
export function xHasDownloadableVideo(post: Element): boolean {
  const players = new Set([...post.querySelectorAll(`${PLAYERS}, video`)].map(playerFor));
  return [...players].some(player => player.closest(X_POSTS) === post && !player.closest(QUOTES) && !xIsGif(player));
}
export function xControlAnchor(post: Element): Element | null {
  // X's article can be a horizontal flex container. Attach inside its content
  // column after the native action row, never as another article-level column.
  return [...post.querySelectorAll('[role="group"]')].find(group =>
    group.closest(X_POSTS) === post
    && !group.closest('[data-testid="quoteTweet"], [data-mediafetch-quote]')
    && !!group.querySelector('[data-testid="reply"], [data-testid="retweet"], [data-testid="like"], [data-testid="unlike"]'),
  ) ?? null;
}
export function xCandidate(target: Element, pageUrl: string): Candidate | null {
  const post = target.closest(X_POSTS);
  if (!post) return null;
  if (target.closest(`${PLAYERS}, video`) && xIsGif(target)) return null;
  const quote = target.closest('[data-testid="quoteTweet"], [data-mediafetch-quote]');
  const scope = quote && post.contains(quote) ? quote : post;
  // Timeline timestamps identify the post; action links can refer to other posts.
  const links = [...scope.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')]
    .filter(link => !!link.querySelector('time') && (scope !== post || !link.closest('[data-testid="quoteTweet"], [data-mediafetch-quote]')))
    .map(link => canonical(new URL(link.getAttribute('href')!, pageUrl).href))
    .filter((value): value is Candidate => !!value && value.provider === 'x');
  const unique = new Map(links.map(value => [value.contentId, value]));
  if (unique.size !== 1) return null;
  const candidate = [...unique.values()][0]!;
  // A direct selected-video link carries an explicit index. Do not infer an index from DOM order.
  const selected = target.closest<HTMLAnchorElement>('a[href*="/video/"]');
  const video = selected ? canonical(new URL(selected.getAttribute('href')!, pageUrl).href) : null;
  return video?.contentId === candidate.contentId ? video : candidate;
}
