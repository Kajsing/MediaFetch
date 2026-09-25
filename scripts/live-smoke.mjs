import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (!process.argv.includes('--run')) throw new Error('Live downloads are opt-in: pass --run.');
const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, 'extension/dist');
const id = (await readFile(path.join(extension, 'extension-id.txt'), 'utf8')).trim();
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const profile = await mkdtemp(path.join(root, '.local/live-'));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const urls = process.argv.filter(value => value.startsWith('https://'));
if (!urls.length) throw new Error('Pass one or more explicitly selected public post URLs.');
const evidence = { date: new Date().toISOString(), browser: context.browser()?.version(), results: [] };
try {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/downloads.html`);
  await page.getByText('Local helper connected', { exact: true }).waitFor();
  for (const url of urls) {
    const result = await page.evaluate(async url => chrome.runtime.sendMessage({ type: 'enqueue', url, quality: '1080' }), url);
    if (!result.ok) throw new Error(result.error);
    evidence.results.push({ url, jobId: result.data.jobId });
  }
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'getState' }));
    let pending = false;
    for (const item of evidence.results) {
      const job = reply.data?.snapshot?.jobs.find(job => job.id === item.jobId);
      if (job) {
        Object.assign(item, { state: job.state, path: job.path, bytes: job.bytes, error: job.error, errorCode: job.errorCode });
        if (!['completed', 'failed', 'cancelled', 'stopped', 'interrupted'].includes(job.state)) pending = true;
      } else pending = true;
    }
    if (!pending) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await page.screenshot({ path: path.join(root, 'artifacts/live-downloads.png'), fullPage: true });
} finally {
  await writeFile(path.join(root, 'artifacts/live-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
}
