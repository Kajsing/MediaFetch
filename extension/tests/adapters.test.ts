import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { redditCandidate } from '../src/providers/reddit/adapter.ts';
import { xCandidate, xHasDownloadableVideo } from '../src/providers/x/adapter.ts';

test('Reddit uses clicked post permalink rather than neighboring feed media', () => {
  const { document } = parseHTML('<shreddit-post permalink="/r/a/comments/abc123/title/"><video id="a"></video></shreddit-post><shreddit-post permalink="/r/b/comments/def456/title/"><video id="b"></video></shreddit-post>');
  assert.equal(redditCandidate(document.querySelector('#b')!, 'https://www.reddit.com/')?.contentId, 'def456');
});
test('ambiguous Reddit links fail closed', () => {
  const { document } = parseHTML('<article><a href="/comments/abc123/a/">one</a><a href="/comments/def456/b/">two</a><video></video></article>');
  assert.equal(redditCandidate(document.querySelector('video')!, 'https://www.reddit.com/'), null);
});
test('X quote and outer video map to their own timestamp', () => {
  const { document } = parseHTML('<article data-testid="tweet"><a href="/author/status/111"><time>today</time></a><video id="outer"></video><div data-testid="quoteTweet"><a href="/quoted/status/222"><time>yesterday</time></a><video id="inner"></video></div></article>');
  assert.equal(xCandidate(document.querySelector('#outer')!, 'https://x.com/')?.contentId, '111');
  assert.equal(xCandidate(document.querySelector('#inner')!, 'https://x.com/')?.contentId, '222');
});
test('X unknown quote markup with conflicting timestamps is not guessed', () => {
  const { document } = parseHTML('<article><a href="/author/status/111"><time>today</time></a><div role="link"><a href="/quoted/status/222"><time>yesterday</time></a><video></video></div></article>');
  assert.equal(xCandidate(document.querySelector('video')!, 'https://x.com/'), null);
});

test('X GIF player badge suppresses inline and video-context candidates', () => {
  const { document } = parseHTML('<article><a href="/gif/status/123"><time>Today</time></a><div data-testid="videoPlayer"><div data-testid="videoComponent"><video loop></video><div><span>GIF</span></div></div></div></article>');
  assert.equal(xHasDownloadableVideo(document.querySelector('article')!), false);
  assert.equal(xCandidate(document.querySelector('video')!, 'https://x.com/'), null);
});

test('GIF in post text or a quote does not hide the post\'s own ordinary video', () => {
  const { document } = parseHTML('<article><p>GIF</p><div data-testid="videoPlayer"><video loop id="own"></video></div><div data-testid="quoteTweet"><div data-testid="videoPlayer"><video></video><span>GIF</span></div></div></article>');
  const post = document.querySelector('article')!;
  assert.equal(xHasDownloadableVideo(post), true);
  document.querySelector('#own')!.parentElement!.remove();
  assert.equal(xHasDownloadableVideo(post), false, 'A quoted GIF is not the outer post\'s video');
});

test('A GIF player does not mask another real video in the same post', () => {
  const { document } = parseHTML('<article><div data-testid="videoPlayer" aria-label="GIF"><video></video></div><div data-testid="videoPlayer"><video></video></div></article>');
  assert.equal(xHasDownloadableVideo(document.querySelector('article')!), true);
});
