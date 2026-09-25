import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAllHistory } from '../src/background/history.ts';
import type { Job, JobState, Snapshot } from '../src/shared/contracts.ts';

function job(state: JobState, hasPartials = false): Job {
  return { id: crypto.randomUUID(), attemptId: crypto.randomUUID(), revision: 1, provider: 'x', url: 'https://x.com/fixture/status/123', title: 'Fixture', quality: '1080', state, progress: null, createdAt: '', updatedAt: '', bytes: 0, resumable: hasPartials, hasPartials };
}
const snapshot = (jobs: Job[]): Snapshot => ({ revision: 1, jobs, destination: 'C:\\fixture', ffmpeg: true, helperVersion: '0.1.0' });

test('Remove all only forgets inactive entries without retained files', async () => {
  const clearable = [job('completed'), job('failed'), job('cancelled'), job('stopped')];
  const kept = [job('queued'), job('downloading'), job('merging'), job('deleting'), job('stopped', true), job('failed', true), job('completed', true)];
  const forgotten: string[] = [];
  const result = await removeAllHistory(async (action, fields) => {
    if (action === 'snapshot') return snapshot([...clearable, ...kept]);
    assert.equal(action, 'forget', 'Batch history removal must never invoke deletion or cancellation');
    forgotten.push(fields!.jobId as string); return {};
  });
  assert.deepEqual(forgotten, clearable.map(job => job.id));
  assert.deepEqual(result, { removed: clearable.length, kept: kept.length, failed: 0 });
});

test('A helper refusal during Remove all remains visible while other entries clear', async () => {
  const raced = job('failed'), complete = job('completed');
  const result = await removeAllHistory(async (action, fields) => {
    if (action === 'snapshot') return snapshot([raced, complete]);
    assert.equal(action, 'forget');
    if (fields!.jobId === raced.id) throw new Error('This job was retried in another window.');
    return {};
  });
  assert.deepEqual(result, { removed: 1, kept: 1, failed: 1 });
});

test('Unavailable history cannot be cleared from a stale cached snapshot', async () => {
  await assert.rejects(removeAllHistory(async action => {
    assert.equal(action, 'snapshot'); throw new Error('Helper disconnected');
  }), /Helper disconnected/);
});
