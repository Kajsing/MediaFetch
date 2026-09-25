import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { canonical } from '../src/shared/providers.ts';
import { parseSettings } from '../src/shared/contracts.ts';
import { youtubeCandidate, youtubeControlAnchor } from '../src/providers/youtube/adapter.ts';

const id = 'MkycQONC3SE';
const page = `https://www.youtube.com/watch?v=${id}`;
test('YouTube normalizes one video and discards playlist, time and tracking context', () => {
  for (const url of [page + '&list=PLx&t=8', `https://youtu.be/${id}?si=private`, `https://m.youtube.com/shorts/${id}/`, `https://youtube.com/watch?v=${id}`]) {
    assert.deepEqual(canonical(url), { provider: 'youtube', contentId: id, url: page });
  }
  for (const url of [page + '&v=abcdefghijk', 'https://youtube.com/playlist?list=PLx', 'https://youtube.com/@Kajsing', `https://www.youtube.com/embed/${id}`, `https://youtu.be.evil.test/${id}`, `https://youtube.com/watch?v=${id}x`, `https://u:p@youtube.com/watch?v=${id}`, `https://youtube.com:444/watch?v=${id}`, `https://youtube.com/watch?v=${id}\n`]) assert.equal(canonical(url), null, url);
});
test('Settings migration preserves preferences and explicitly validates YouTube', () => {
  assert.deepEqual(parseSettings({ quality: '720', inlineReddit: false, inlineX: true }), { quality: '720', inlineReddit: false, inlineX: true, inlineYouTube: true });
  assert.equal(parseSettings({ quality: 'best', inlineReddit: true, inlineX: false, inlineYouTube: false }).inlineYouTube, false);
  assert.throws(() => parseSettings({ quality: '720', inlineReddit: true, inlineX: true, inlineYouTube: 'yes' }));
});
test('YouTube watch player requires matching DOM identity and rejects ads and hidden stale pages', () => {
  const { document } = parseHTML(`<ytd-watch-flexy video-id="${id}"><div id="movie_player"><video></video></div><ytd-watch-metadata><div id="top-row"></div></ytd-watch-metadata></ytd-watch-flexy>`);
  const root = document.querySelector('ytd-watch-flexy')!;
  const video = root.querySelector('video')!;
  assert.equal(youtubeCandidate(video, page)?.contentId, id);
  assert.equal(youtubeControlAnchor(root)?.id, 'top-row');
  assert.equal(youtubeCandidate(root, page.replace(id, 'abcdefghijk')), null);
  root.querySelector('#movie_player')!.classList.add('ad-showing');
  assert.equal(youtubeCandidate(video, page), null);
  root.querySelector('#movie_player')!.classList.remove('ad-showing');
  root.setAttribute('hidden', '');
  assert.equal(youtubeCandidate(video, page), null);
});
test('Shorts requires the active matching player; explicit links identify neighboring videos independently', () => {
  const { document } = parseHTML(`<ytd-reel-video-renderer is-active video-id="${id}"><video id="current"></video><div id="actions"></div></ytd-reel-video-renderer><ytd-reel-video-renderer video-id="abcdefghijk"><video id="next"></video></ytd-reel-video-renderer><a href="/watch?v=abcdefghijk"><img id="link"></a>`);
  const shorts = `https://www.youtube.com/shorts/${id}`;
  assert.equal(youtubeCandidate(document.querySelector('#current')!, shorts)?.contentId, id);
  assert.equal(youtubeCandidate(document.querySelector('#next')!, shorts), null);
  assert.equal(youtubeCandidate(document.querySelector('#link')!, shorts)?.contentId, 'abcdefghijk');
  assert.equal(youtubeCandidate(document.querySelector('#next')!, 'https://www.youtube.com/'), null);
  const root = document.querySelector('ytd-reel-video-renderer')!;
  root.removeAttribute('video-id');
  assert.equal(youtubeCandidate(root, shorts), null);
  root.innerHTML += `<a href="/shorts/${id}">Permalink</a>`;
  assert.equal(youtubeCandidate(root, shorts)?.contentId, id);
});
