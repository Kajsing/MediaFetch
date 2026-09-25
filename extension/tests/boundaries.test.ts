import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, providerFor } from '../src/shared/providers.ts';
import { actionsFor, parseSettings, jobId, type Job } from '../src/shared/contracts.ts';

test('canonicalizes supported posts without signed tracking query data', () => {
  assert.equal(canonical('https://www.reddit.com/r/accelerate/comments/1wplszd/enterprised_bridge_recreated_in_blender_using_400/?share_id=secret')?.url, 'https://www.reddit.com/comments/1wplszd/');
  assert.equal(canonical('https://old.reddit.com/r/test/comments/abc123/title/')?.contentId, 'abc123');
  assert.equal(canonical('https://redd.it/abc123')?.url, 'https://www.reddit.com/comments/abc123/');
  assert.deepEqual(canonical('https://twitter.com/M1Astra/status/2103152489772073421/video/2?x=1'), { provider: 'x', contentId: '2103152489772073421', url: 'https://x.com/M1Astra/status/2103152489772073421', mediaIndex: 2 });
});
test('rejects unsupported and deceptive URLs', () => {
  for (const value of ['http://x.com/u/status/1', 'https://x.com.evil.test/u/status/1', 'https://user:pass@x.com/u/status/1', 'https://x.com:444/u/status/1', 'file:///x.com/a/status/1', 'https://www.youtube.com/watch?v=a', 'https://x.com/u', 'https://www.reddit.com/r/test/', 'https://x.com/u/status/1/photo/1', 'https://reddit.com/comments/abc123/t/extra', 'https://v.redd.it/123', 'https://x.com/u/status/1/video/99']) assert.equal(canonical(value), null, value);
  assert.equal(providerFor('https://evilreddit.com/'), null);
});
test('settings and action IDs have explicit boundaries', () => {
  assert.throws(() => parseSettings({ quality: '9999', inlineX: true, inlineReddit: true }));
  assert.throws(() => parseSettings({ quality: '1080', inlineX: 'true', inlineReddit: true }));
  assert.throws(() => jobId('../../Downloads'));
});
test('completed and transitional downloads cannot be deleted through active-job actions', () => {
  const base = { resumable: false, hasPartials: false };
  assert.deepEqual(actionsFor({ ...base, state: 'completed' } as Job), ['forget']);
  assert.deepEqual(actionsFor({ ...base, state: 'deleting' } as Job), []);
  assert.deepEqual(actionsFor({ ...base, state: 'downloading' } as Job), ['stop', 'delete']);
  assert.deepEqual(actionsFor({ ...base, hasPartials: true, resumable: true, state: 'stopped' } as Job), ['resume', 'retry', 'delete']);
});
