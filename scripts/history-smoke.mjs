// Real extension UI and service worker with a native-protocol double.
// The separate extension identity cannot access the user's installed helper or history.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, '.local'), { recursive: true });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const fixture = await mkdtemp(path.join(root, '.local/history-'));
const extension = path.join(fixture, 'extension');
await cp(path.join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
delete manifest.key;
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(path.join(fixture, 'profile'), {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    const jobs = [['completed', false], ['failed', false], ['cancelled', false], ['stopped', true], ['downloading', true], ['queued', false]].map(([state, hasPartials], index) => ({
      id: crypto.randomUUID(), attemptId: crypto.randomUUID(), revision: 1, provider: 'x', url: `https://x.com/fixture/status/${index + 1}`,
      title: `${state} fixture`, quality: '1080', state, progress: null, createdAt: '', updatedAt: '', bytes: 0, resumable: false, hasPartials,
    }));
    globalThis.historyFixture = { jobs, revision: 1, requests: [] };
    const snapshot = () => ({ jobs: structuredClone(globalThis.historyFixture.jobs), revision: globalThis.historyFixture.revision, destination: 'C:\\Fixture', ffmpeg: true, helperVersion: '0.1.0' });
    chrome.runtime.connectNative = () => {
      const listeners = [];
      return {
        onMessage: { addListener: listener => listeners.push(listener) },
        onDisconnect: { addListener() {} },
        postMessage(message) {
          const fixture = globalThis.historyFixture;
          fixture.requests.push(message.action);
          queueMicrotask(() => {
            let data = {}, error;
            if (message.action === 'hello') data = { protocolVersion: 1, snapshot: snapshot() };
            else if (message.action === 'snapshot') data = snapshot();
            else if (message.action === 'forget') {
              const target = fixture.jobs.find(job => job.id === message.jobId);
              if (!target || target.hasPartials || ['queued', 'downloading'].includes(target.state)) error = 'Protected fixture';
              else {
                fixture.jobs = fixture.jobs.filter(job => job !== target); fixture.revision++;
                listeners.forEach(listener => listener({ kind: 'snapshot', data: snapshot() }));
              }
            } else error = 'Unexpected command';
            listeners.forEach(listener => listener({ kind: 'reply', id: message.id, ok: !error, data, error }));
          });
        },
      };
    };
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${worker.url().split('/')[2]}/downloads.html`);
  await page.getByText('Local helper connected', { exact: true }).waitFor();
  const clear = page.getByRole('button', { name: 'Remove all', exact: true });
  assert.equal(await clear.isEnabled(), true);
  assert.equal(await page.locator('[data-job-id]').count(), 6);
  await page.screenshot({ path: path.join(root, 'artifacts/history-before.png'), fullPage: true });
  await clear.click();
  await page.getByRole('status').filter({ hasText: 'Removed 3 entries. Saved videos were kept.' }).waitFor();
  assert.equal(await page.locator('[data-job-id]').count(), 3);
  assert.equal(await clear.isDisabled(), true);
  await page.reload();
  await page.getByText('Local helper connected', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-job-id]').count(), 3);
  const state = await worker.evaluate(() => ({ states: globalThis.historyFixture.jobs.map(job => job.state), requests: globalThis.historyFixture.requests }));
  assert.deepEqual(state.states, ['stopped', 'downloading', 'queued']);
  assert.equal(state.requests.filter(action => action === 'forget').length, 3);
  assert.ok(state.requests.every(action => ['hello', 'snapshot', 'forget'].includes(action)));
  await page.screenshot({ path: path.join(root, 'artifacts/history-after.png'), fullPage: true });
  const evidence = { date: new Date().toISOString(), nativeProtocolDouble: true, checks: ['Remove all routes through actual trusted UI and service worker', 'Only eligible history entries are forgotten', 'Active jobs and retained files stay listed', 'Button disables when nothing can be removed', 'Reopening the list shows remaining jobs'], ...state };
  await writeFile(path.join(root, 'artifacts/history-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await context.close(); }
