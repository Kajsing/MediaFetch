import { chromium } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

if (!process.argv.includes('--run')) throw new Error('Live provider inspection is opt-in: pass --run.');
const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, 'extension/dist');
const profile = await mkdtemp(path.join(root, '.local/providers-'));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const evidence = [];
try {
  for (const [provider, url] of [
    ['reddit', 'https://www.reddit.com/r/accelerate/comments/1wplszd/enterprised_bridge_recreated_in_blender_using_400/'],
    ['x', 'https://x.com/M1Astra/status/2103152489772073421'],
  ]) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForSelector('shreddit-post, article, video', { timeout: 20000 }).catch(() => undefined);
      await new Promise(resolve => setTimeout(resolve, 2500));
      const state = await page.evaluate(() => ({
        title: document.title,
        posts: document.querySelectorAll('shreddit-post, article').length,
        videos: document.querySelectorAll('video').length,
        controls: document.querySelectorAll('.mediafetch-control').length,
        structure: [...document.querySelectorAll('shreddit-post, article')].slice(0, 3).map(post => ({
          tag: post.tagName, testId: post.getAttribute('data-testid'), permalink: post.getAttribute('permalink'), postType: post.getAttribute('post-type'),
          timeLinks: [...post.querySelectorAll('a[href]')].filter(a => a.querySelector('time')).map(a => a.getAttribute('href')),
          players: [...post.querySelectorAll('video, shreddit-player, [data-testid="videoPlayer"], [data-testid="videoComponent"]')].map(item => item.tagName),
        })),
      }));
      await page.screenshot({ path: path.join(root, `artifacts/provider-${provider}.png`) });
      evidence.push({ provider, ...state, pageErrors: errors });
    } catch (error) { evidence.push({ provider, error: error.message }); }
    await page.close();
  }
} finally {
  await writeFile(path.join(root, 'artifacts/provider-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  await context.close();
}
