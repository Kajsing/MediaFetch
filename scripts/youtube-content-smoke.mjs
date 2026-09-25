// Controlled SPA fixtures plus optional public-page placement. Uses an isolated
// extension identity and profile that cannot access the user's native helper.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, '.local'), { recursive: true });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const folder = await mkdtemp(path.join(root, '.local/youtube-content-'));
const extension = path.join(folder, 'extension');
await cp(path.join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
delete manifest.key;
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(path.join(folder, 'profile'), {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const checks = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.observedRequests = [];
    chrome.runtime.onMessage.addListener(message => { if (message.type === 'enqueue') globalThis.observedRequests.push(message); });
  });
  const page = await context.newPage();
  const fixture = '<!doctype html><style>ytd-watch-flexy,ytd-watch-metadata,ytd-reel-video-renderer{display:block}video{width:480px;height:270px;background:#222}#top-row{display:flex;height:40px}</style><ytd-watch-flexy video-id="MkycQONC3SE"><div id="movie_player"><video id="current"></video></div><ytd-watch-metadata><div id="above-the-fold"><h1>Tail Count Nine</h1><div id="top-row">Author and native actions</div><div>Description</div></div></ytd-watch-metadata></ytd-watch-flexy><a href="/watch?v=abcdefghijk">Neighbor</a>';
  await context.route('**/*', route => route.request().resourceType() === 'document' ? route.fulfill({contentType:'text/html',body:fixture}) : route.abort());
  const count = n => expect(page.locator('.mediafetch-control')).toHaveCount(n);
  async function selected(selector) {
    await page.locator(selector).dispatchEvent('contextmenu');
    return worker.evaluate(async () => {
      const tab = (await chrome.tabs.query({})).find(t => t.url?.startsWith('https://www.youtube.com/'));
      return chrome.tabs.sendMessage(tab.id, { type: 'contextCandidate' });
    });
  }
  await page.goto('https://www.youtube.com/watch?v=MkycQONC3SE');
  await count(1);
  assert.equal((await selected('#current')).url, 'https://www.youtube.com/watch?v=MkycQONC3SE');
  await page.locator('.mediafetch-control').click();
  await expect.poll(() => worker.evaluate(() => globalThis.observedRequests.at(-1)?.url)).toBe('https://www.youtube.com/watch?v=MkycQONC3SE');
  assert.ok(await page.locator('.mediafetch-control').evaluate(e => e.previousElementSibling.id === 'top-row' && e.getBoundingClientRect().height <= 34));
  checks.push('The compact watch-page control and video context target the matching video');
  await page.evaluate(() => document.querySelector('#movie_player').classList.add('ad-showing'));
  await count(0); assert.equal(await selected('#current'), null);
  await page.evaluate(() => document.querySelector('#movie_player').classList.remove('ad-showing'));
  await count(1);
  await page.evaluate(() => { window.dispatchEvent(new Event('yt-navigate-start')); history.pushState({}, '', '/watch?v=abcdefghijk'); window.dispatchEvent(new Event('yt-navigate-finish')); });
  await count(0);
  await page.evaluate(() => document.querySelector('ytd-watch-flexy').setAttribute('video-id', 'abcdefghijk'));
  await count(1);
  assert.equal((await selected('#current')).url, 'https://www.youtube.com/watch?v=abcdefghijk');
  await page.locator('.mediafetch-control').click();
  await expect.poll(() => worker.evaluate(() => globalThis.observedRequests.at(-1)?.url)).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  checks.push('Ads hide controls; SPA URL/DOM disagreement removes stale controls until identities match');
  await page.evaluate(() => {
    document.querySelector('ytd-watch-flexy').setAttribute('hidden','');
    history.pushState({}, '', '/shorts/MkycQONC3SE');
    document.body.insertAdjacentHTML('beforeend', '<ytd-reel-video-renderer is-active video-id="MkycQONC3SE"><video id="short-current"></video><div id="actions">Actions</div></ytd-reel-video-renderer><ytd-reel-video-renderer video-id="abcdefghijk"><video id="short-next"></video><div id="actions">Actions</div></ytd-reel-video-renderer>');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await count(1); assert.equal(await selected('#short-next'), null);
  await page.evaluate(() => {
    const [first,next] = document.querySelectorAll('ytd-reel-video-renderer');
    first.removeAttribute('is-active'); next.setAttribute('is-active','');
    history.pushState({}, '', '/shorts/abcdefghijk'); window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await count(1); assert.equal((await selected('#short-next')).url, 'https://www.youtube.com/watch?v=abcdefghijk');
  checks.push('Only the matching active Short receives a control when the player is recycled');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html`);
  await options.evaluate(() => chrome.runtime.sendMessage({type:'saveSettings',settings:{quality:'1080',inlineReddit:true,inlineX:true,inlineYouTube:false}}));
  await count(0);
  await options.evaluate(() => chrome.runtime.sendMessage({type:'saveSettings',settings:{quality:'1080',inlineReddit:true,inlineX:true,inlineYouTube:true}}));
  await count(1);
  checks.push('The YouTube preference immediately removes and restores controls');
  if (process.argv.includes('--live')) {
    await context.unrouteAll(); await options.close();
    await page.goto('https://www.youtube.com/watch?v=MkycQONC3SE', {waitUntil:'domcontentloaded', timeout:45000});
    // Optional EU consent dialog in this fresh, signed-out test profile.
    for (let attempt = 0; attempt < 20; attempt++) {
      let dismissed = false;
      for (const frame of page.frames()) {
        const reject = frame.getByRole('button', { name: /^(Reject all|Reject the use of cookies and other data for the purposes described)$/ });
        if (await reject.isVisible()) { await reject.click(); await reject.waitFor({state:'hidden'}); dismissed = true; break; }
      }
      if (dismissed) break;
      await page.waitForTimeout(500);
    }
    await expect(page.locator('.mediafetch-control')).toHaveCount(1, {timeout:30000});
    await expect(page.locator('.mediafetch-control')).toBeVisible();
    await page.locator('.mediafetch-control').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts/youtube-live-control.png')});
    const layout = await page.locator('.mediafetch-control').evaluate(e => ({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,belowActions:e.getBoundingClientRect().top >= e.previousElementSibling.getBoundingClientRect().bottom,videoId:e.closest('ytd-watch-flexy').getAttribute('video-id')}));
    assert.ok(layout.height <= 34 && layout.width < 200 && layout.belowActions && layout.videoId === 'MkycQONC3SE', JSON.stringify(layout));
    await page.locator('.mediafetch-control').click();
    await expect.poll(() => worker.evaluate(() => globalThis.observedRequests.at(-1)?.url)).toBe('https://www.youtube.com/watch?v=MkycQONC3SE');
    checks.push('The owner-selected live YouTube page renders one compact button and sends its canonical identity (isolated helper unavailable)');
  }
  await writeFile(path.join(root,'artifacts/youtube-content.json'), JSON.stringify({browser:context.browser()?.version(), live:process.argv.includes('--live'), checks},null,2));
  console.log(JSON.stringify({checks},null,2));
} finally { await context.close(); }
