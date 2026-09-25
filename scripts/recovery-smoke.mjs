import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

if (!process.argv.includes('--run')) throw new Error('This live recovery test is opt-in: pass --run.');
const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, 'extension/dist');
const id = (await readFile(path.join(extension, 'extension-id.txt'), 'utf8')).trim();
const profile = await mkdtemp(path.join(root, '.local/recovery-'));
const launch = () => chromium.launchPersistentContext(profile, {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
let context = await launch();
let page;
const evidence = { date: new Date().toISOString(), checks: [], jobs: [] };
let originalDestination;
async function open() {
  page = await context.newPage();
  await page.goto(`chrome-extension://${id}/downloads.html`);
  await page.getByText('Local helper connected', { exact: true }).waitFor();
}
async function call(type, fields = {}) {
  const result = await page.evaluate(message => chrome.runtime.sendMessage(message), { type, ...fields });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
async function waitJob(jobId, accept, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await call('getState');
    const job = state.snapshot.jobs.find(item => item.id === jobId);
    if (job && accept(job)) return job;
    if (job?.state === 'failed') throw new Error(`Download failed: ${job.errorCode}: ${job.error}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${jobId}`);
}
try {
  await open();
  originalDestination = (await call('getState')).snapshot.destination;
  const testDestination = await mkdtemp(path.join(root, '.local/recovery-downloads-'));
  await call('setDestination', { path: testDestination });
  const first = await call('enqueue', { url: 'https://x.com/M1Astra/status/2103152489772073421', quality: '1080' });
  await waitJob(first.jobId, job => job.state === 'downloading' && job.bytes > 1024);
  await page.locator(`[data-job-id="${first.jobId}"]`).getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await waitJob(first.jobId, job => job.state === 'stopped');
  assert.equal(stopped.hasPartials, true);
  assert.equal(stopped.resumable, true);
  const stagedDirectory = path.join(testDestination, '.mediafetch-partials', first.jobId);
  const stagedFiles = await Promise.all((await readdir(stagedDirectory)).map(async name => ({ name, size: (await stat(path.join(stagedDirectory, name))).size })));
  evidence.checks.push('Stop retains resumable partial data');
  evidence.jobs.push({ id: first.jobId, stoppedBytes: stopped.bytes, stagedFiles });
  await context.close();
  context = await launch();
  await open();
  const recovered = await waitJob(first.jobId, job => job.state === 'stopped');
  assert.equal(recovered.resumable, true);
  evidence.checks.push('Stopped job survives browser restart without automatic download');
  await page.locator(`[data-job-id="${first.jobId}"]`).getByRole('button', { name: 'Continue', exact: true }).click();
  const complete = await waitJob(first.jobId, job => job.state === 'completed');
  assert.ok(stagedFiles.some(file => file.size > 0), 'Continue must start with retained media');
  evidence.jobs[0] = { ...evidence.jobs[0], resumedBytes: complete.resumedBytes, path: complete.path };
  evidence.checks.push(complete.resumedBytes > 0 ? 'Continue re-resolves the source and receives a positive byte-range response' : 'Continue successfully processes compatible retained media');

  const second = await call('enqueue', { url: 'https://www.reddit.com/comments/1wplszd/', quality: '1080' });
  await waitJob(second.jobId, job => job.state === 'downloading' && job.bytes > 0);
  await page.locator(`[data-job-id="${second.jobId}"]`).getByRole('button', { name: 'Stop and delete', exact: true }).click();
  const cancelled = await waitJob(second.jobId, job => job.state === 'cancelled');
  assert.equal(cancelled.hasPartials, false);
  const snapshot = (await call('getState')).snapshot;
  const partials = path.join(snapshot.destination, '.mediafetch-partials', second.jobId);
  assert.equal(await stat(partials).then(() => true, () => false), false);
  assert.ok((await stat(complete.path)).size > 0);
  evidence.jobs.push({ id: second.jobId, state: 'cancelled', partialsRemoved: true });
  evidence.checks.push('Stop and delete removes the real job directory and preserves completed video');

  await call('jobAction', { action: 'retry', jobId: second.jobId });
  await page.close();
  await new Promise(resolve => setTimeout(resolve, 2000));
  await open();
  const retried = await waitJob(second.jobId, job => job.state === 'completed');
  evidence.jobs[1] = { ...evidence.jobs[1], retryState: retried.state, path: retried.path };
  evidence.checks.push('Retry starts a fresh attempt; closing the UI does not stop the download');
  await page.screenshot({ path: path.join(root, 'artifacts/recovery.png'), fullPage: true });
} finally {
  if (originalDestination) {
    if (!page || page.isClosed()) await open();
    await call('setDestination', { path: originalDestination });
  }
  await writeFile(path.join(root, 'artifacts/recovery-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
}
