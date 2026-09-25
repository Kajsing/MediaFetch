// Real Slate pages and service-worker routing with an isolated native-protocol double.
// No connection to the installed helper, provider network or user download history.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/slate');
await mkdir(output, { recursive: true });
await mkdir(path.join(root, '.local'), { recursive: true });
const fixture = await mkdtemp(path.join(root, '.local/slate-'));
const extension = path.join(fixture, 'extension');
await cp(path.join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
delete manifest.key;
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(path.join(fixture, 'profile'), {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, viewport: { width: 1200, height: 1000 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const errors = [], checks = [];
context.on('weberror', event => errors.push(event.error().message));
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    const states = ['downloading', 'merging', 'failed', 'completed', 'stopped', 'interrupted', 'queued', 'resolving', 'stopping', 'deleting', 'cancelled'];
    const titles = ['Enterprise-D bridge recreated in Blender', 'Computer, lights on please', 'Choose a video from this post', 'A research facility built by Astra'];
    const jobs = states.map((state, index) => ({
      id: crypto.randomUUID(), attemptId: crypto.randomUUID(), revision: 1, provider: index % 2 ? 'x' : 'reddit',
      url: index % 2 ? `https://x.com/fixture/status/${index + 1}` : `https://www.reddit.com/r/example/comments/abc${index}/video/`,
      title: titles[index] ?? `${state} video`, quality: '1080', state, progress: 48, createdAt: '', updatedAt: '', bytes: 5767168,
      resumable: ['stopped', 'interrupted'].includes(state), hasPartials: !['completed', 'cancelled', 'queued', 'failed'].includes(state),
      ...(state === 'failed' ? { mediaCount: 3, error: 'This post contains several videos. Choose one and retry.' } : {}),
      ...(state === 'completed' ? { path: 'C:\\Users\\Example\\Downloads\\VideoDownload\\A research facility built by Astra.mp4' } : {}),
      ...(state === 'interrupted' ? { resumeRestarted: true } : {}),
      ...(state === 'stopped' ? { resumedBytes: 1048576 } : {}),
    }));
    const f = globalThis.uiFixture = { jobs, initial: structuredClone(jobs), revision: 1, requests: [], listeners: [], disconnects: [], destination: 'C:\\Users\\Example\\Downloads\\VideoDownload' };
    const snapshot = () => ({ jobs: structuredClone(f.jobs), revision: f.revision, destination: f.destination, ffmpeg: true, helperVersion: '0.2.0', ...(f.providers ? { providers: f.providers } : {}) });
    f.publish = () => { f.revision++; f.listeners.forEach(listener => listener({ kind: 'snapshot', data: snapshot() })); };
    chrome.runtime.connectNative = () => {
      f.listeners = []; f.disconnects = [];
      return {
        onMessage: { addListener: listener => f.listeners.push(listener) },
        onDisconnect: { addListener: listener => f.disconnects.push(listener) },
        postMessage(message) {
          f.requests.push(message);
          queueMicrotask(() => {
            let data = {}, error;
            const job = f.jobs.find(job => job.id === message.jobId);
            if (message.action === 'hello') data = { protocolVersion: 1, snapshot: snapshot() };
            else if (message.action === 'snapshot') data = snapshot();
            else if (message.action === 'configure') { f.destination = message.destination; f.publish(); }
            else if (message.action === 'enqueue') {
              f.jobs.unshift({ ...f.initial[6], id: crypto.randomUUID(), url: message.url, quality: message.quality, title: 'New queued video' }); f.publish();
            } else if (job && ['stop', 'resume', 'retry', 'delete', 'forget'].includes(message.action)) {
              if (message.action === 'forget') f.jobs = f.jobs.filter(item => item !== job);
              else if (message.action === 'stop') { job.state = 'stopped'; job.resumable = true; }
              else if (message.action === 'delete') { job.state = 'cancelled'; job.hasPartials = false; job.resumable = false; }
              else { job.state = 'queued'; job.error = ''; }
              f.publish();
            } else error = 'Unexpected fixture command';
            f.listeners.forEach(listener => listener({ kind: 'reply', id: message.id, ok: !error, data, error }));
          });
        },
      };
    };
  });
  const base = `chrome-extension://${worker.url().split('/')[2]}`;
  const page = await context.newPage();
  await page.goto(`${base}/downloads.html`);
  await expect(page.locator('.job')).toHaveCount(11);
  await expect(page.getByRole('region', { name: 'In progress', exact: true }).locator('.job')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'Needs attention', exact: true }).locator('.job')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Finished', exact: true }).locator('.job')).toHaveCount(2);
  for (const state of ['stopping', 'deleting']) await expect(page.locator(`[data-state=${state}] button`)).toHaveCount(0);
  await expect(page.locator('[data-state=merging] progress')).not.toHaveAttribute('value');
  await expect(page.locator('[data-state=completed]')).not.toContainText('48%');
  await expect(page.getByText('The source restarted the transfer.', { exact: true })).toBeVisible();
  await expect(page.getByText('Resumed a transfer at 1.0 MB', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'downloads-all-states.png'), fullPage: true });
  checks.push('All eleven states remain visible in the correct groups; transitional controls and merge progress are honest');

  const download = page.locator('[data-state=downloading]');
  const id = await download.getAttribute('data-job-id');
  await download.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = page.locator(`[data-job-id="${id}"]`);
  await expect(stopped).toHaveAttribute('data-state', 'stopped');
  await expect(stopped.locator('.job-title')).toBeFocused();
  await stopped.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(stopped).toHaveAttribute('data-state', 'queued');
  await stopped.getByRole('button', { name: 'Stop and delete', exact: true }).click();
  await expect(stopped).toHaveAttribute('data-state', 'cancelled');
  await stopped.getByRole('button', { name: 'Remove from list', exact: true }).click();
  await expect(stopped).toHaveCount(0);

  const choice = page.getByRole('combobox', { name: 'Choose video in this post' });
  await choice.selectOption('3'); await choice.focus();
  await worker.evaluate(() => { globalThis.uiFixture.jobs[0].bytes++; globalThis.uiFixture.publish(); });
  await page.waitForTimeout(1700);
  await expect(choice).toBeFocused(); await expect(choice).toHaveValue('3');
  await page.locator('[data-state=failed]').getByRole('button', { name: 'Retry', exact: true }).focus();
  await page.waitForTimeout(1700);
  await expect(choice).toHaveValue('3');
  await page.locator('[data-state=failed]').getByRole('button', { name: 'Retry', exact: true }).click();
  assert.equal(await worker.evaluate(() => globalThis.uiFixture.requests.findLast(r => r.action === 'retry').mediaIndex), 3);
  const savedFile = page.locator('[data-state=completed] .saved-file');
  await savedFile.locator('summary').click();
  await worker.evaluate(() => { globalThis.uiFixture.jobs[0].bytes++; globalThis.uiFixture.publish(); });
  await page.waitForTimeout(1700); await expect(savedFile).toHaveAttribute('open');
  await expect(savedFile.locator('summary')).toBeFocused();
  checks.push('Stop, Continue, partial deletion, removal and selected-video Retry route through the service worker; focus and expanded file details survive updates');

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Default quality', { exact: true }).selectOption('720');
  await page.getByLabel('Show Save video buttons on X').uncheck();
  await page.getByLabel('Show Save video buttons on YouTube').uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByRole('status')).toHaveText('Preferences saved.');
  await page.reload();
  await expect(page.getByLabel('Default quality', { exact: true })).toHaveValue('720');
  await expect(page.getByLabel('Show Save video buttons on X')).not.toBeChecked();
  await expect(page.getByLabel('Show Save video buttons on YouTube')).not.toBeChecked();
  await page.getByLabel('Download folder', { exact: true }).fill('C:\\Fixture\\VideoDownload');
  await page.getByRole('button', { name: 'Set download folder', exact: true }).click();
  await expect(page.locator('#destination-display')).toHaveText('C:\\Fixture\\VideoDownload');
  await page.screenshot({ path: path.join(output, 'settings.png'), fullPage: true });
  checks.push('Settings persist across reload and destination routing still works');

  await worker.evaluate(() => { const f = globalThis.uiFixture; f.jobs = structuredClone(f.initial.slice(0, 4)); f.publish(); });
  await page.goto(`${base}/downloads.html`);
  await expect(page.locator('.job')).toHaveCount(4);
  await page.screenshot({ path: path.join(output, 'downloads.png'), fullPage: true });
  await page.goto(`${base}/popup.html`);
  await expect(page.locator('.job')).toHaveCount(2);
  await expect(page.locator('#recent-count')).toHaveText('2 of 4');
  assert.ok(await page.locator('#app').evaluate(node => node.getBoundingClientRect().height <= 600));
  await page.locator('#app').screenshot({ path: path.join(output, 'popup.png') });
  await page.getByLabel('Post link', { exact: true }).fill('https://x.com.evil.test/user/status/123');
  await page.getByRole('button', { name: 'Download video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Enter a supported Reddit, X or YouTube video link.');
  await page.getByLabel('Post link', { exact: true }).fill('https://x.com/example/status/123');
  await page.getByRole('button', { name: 'Download video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Added to your downloads.');
  assert.equal(await worker.evaluate(() => globalThis.uiFixture.requests.findLast(r => r.action === 'enqueue').quality), '720');
  checks.push('Compact popup caps recent jobs, keeps View all accessible, rejects an unsupported URL and queues with saved quality');
  const beforeYouTube = await worker.evaluate(() => globalThis.uiFixture.requests.filter(r => r.action === 'enqueue').length);
  await page.getByLabel('Post link', { exact: true }).fill('https://youtu.be/MkycQONC3SE?si=discard');
  await page.getByRole('button', { name: 'Download video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Update the local helper to install YouTube support, then reconnect.');
  assert.equal(await worker.evaluate(() => globalThis.uiFixture.requests.filter(r => r.action === 'enqueue').length), beforeYouTube);
  await worker.evaluate(() => { globalThis.uiFixture.providers = ['reddit', 'x', 'youtube']; globalThis.uiFixture.publish(); });
  await page.getByRole('button', { name: 'Download video', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Added to your downloads.');
  assert.equal(await worker.evaluate(() => globalThis.uiFixture.requests.findLast(r => r.action === 'enqueue').url), 'https://www.youtube.com/watch?v=MkycQONC3SE');
  checks.push('Older helpers preserve Reddit/X operation and reject YouTube before enqueue; capable helpers accept the canonical single video');

  for (const width of [736, 360, 320]) {
    await page.setViewportSize({ width, height: 850 });
    for (const surface of ['downloads', 'popup', 'options']) {
      await page.goto(`${base}/${surface}.html`);
      await expect(page.getByText('Local helper connected', { exact: true })).toBeVisible();
      const bounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(bounds.scroll <= bounds.width + 1, `${surface}/${width}: ${JSON.stringify(bounds)}`);
      await page.screenshot({ path: path.join(output, `${surface}-${width}.png`), fullPage: true });
    }
  }
  checks.push('All three production pages fit at 736px, 360px and 320px');

  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto(`${base}/downloads.html`);
  const longJobId = await worker.evaluate(() => { const f = globalThis.uiFixture; f.jobs[0].title = '<img src=x onerror=alert(1)>' + 'LongTitle'.repeat(35); f.jobs[0].error = 'Long error details '.repeat(20); f.jobs[0].state = 'failed'; f.publish(); return f.jobs[0].id; });
  await expect(page.locator(`[data-job-id="${longJobId}"] .job-title`)).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.job img')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 850 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await page.screenshot({ path: path.join(output, 'long-content.png'), fullPage: true });
  await worker.evaluate(() => globalThis.uiFixture.disconnects.forEach(listener => listener()));
  await expect(page.getByText('Local helper not connected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove all', exact: true })).toBeDisabled();
  assert.equal(await page.locator('.job button:enabled').count(), 0);
  await page.screenshot({ path: path.join(output, 'disconnected.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await expect(page.getByText('Local helper connected', { exact: true })).toBeVisible();
  await worker.evaluate(() => { globalThis.uiFixture.jobs = []; globalThis.uiFixture.publish(); });
  await expect(page.getByRole('heading', { name: 'Your list is clear' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove all', exact: true })).toBeDisabled();
  await page.screenshot({ path: path.join(output, 'empty.png'), fullPage: true });
  checks.push('Long untrusted text stays literal and wraps; disconnected helper disables job controls, reconnect works and empty state is available');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'validation.json'), JSON.stringify({ nativeProtocolDouble: true, checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  const page = context.pages().at(-1);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await context.close(); }
