import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, 'extension/dist');
await mkdir(path.join(root, '.local'), { recursive: true });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const profile = await mkdtemp(path.join(root, '.local/browser-'));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }), headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const errors = [];
context.on('weberror', event => errors.push(event.error().message));
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = worker.url().split('/')[2];
  assert.equal(id, (await readFile(path.join(extension, 'extension-id.txt'), 'utf8')).trim());
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.getByRole('heading', { name: 'Save the moment.' }).waitFor();
  await page.getByText(/Local helper (connected|not connected)/, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, 'artifacts/popup.png'), fullPage: true });
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.getByLabel('DEFAULT QUALITY').selectOption('720');
  await page.getByLabel('Show Save video buttons on X').uncheck();
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await page.getByText('Preferences saved.', { exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#quality')?.value === '720');
  assert.equal(await page.getByLabel('Show Save video buttons on X').isChecked(), false);
  await page.goto(`chrome-extension://${id}/downloads.html`);
  await page.getByRole('heading', { name: 'Your download shelf.' }).waitFor();
  await page.getByText(/Local helper (connected|not connected)/, { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, 'artifacts/downloads.png'), fullPage: true });
  await worker.evaluate(() => chrome.contextMenus.update('mediafetch-download', { enabled: true }));
  const bad = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'enqueue', url: 'https://x.com.evil.test/u/status/123', quality: '1080' }));
  assert.equal(bad.ok, false);
  assert.deepEqual(errors, []);
  const evidence = { date: new Date().toISOString(), browser: context.browser()?.version(), extensionId: id, checks: ['actual unpacked extension load', 'popup and list render', 'options persist after reload', 'context menu registered', 'deceptive URL rejected'], errors };
  await writeFile(path.join(root, 'artifacts/browser-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  const page = context.pages().at(-1);
  if (page) {
    await page.screenshot({ path: path.join(root, 'artifacts/browser-failure.png'), fullPage: true });
    console.error(await page.locator('body').innerText());
  }
  console.error('Page errors:', errors);
  throw error;
} finally { await context.close(); }
