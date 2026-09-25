// Controlled fixtures exercise real Chrome content scripts, not live provider markup.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
await mkdir(path.join(root, '.local'), { recursive: true });
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const fixtureRoot = await mkdtemp(path.join(root, '.local/content-'));
const extension = path.join(fixtureRoot, 'extension');
await cp(path.join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
delete manifest.key; // Isolated identity cannot connect to the registered production helper.
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
const context = await chromium.launchPersistentContext(path.join(fixtureRoot, 'profile'), {
  ...(process.env.MEDIAFETCH_TEST_CHROME ? { executablePath: process.env.MEDIAFETCH_TEST_CHROME } : { channel: 'chromium' }),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const checks = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.observedRequests = [];
    chrome.runtime.onMessage.addListener(message => { if (message.type === 'enqueue') globalThis.observedRequests.push(message); });
  });
  const page = await context.newPage();
  const style = '<style>article,shreddit-post{display:block;padding:15px;border:1px solid #ccc;margin:10px}video{display:block;width:100px;height:40px}</style>';
  const reddit = `${style}<shreddit-post permalink="/comments/abc123/a/"><video id="first"></video></shreddit-post><shreddit-post permalink="/comments/def456/b/"><video id="second"></video></shreddit-post>`;
  const actions = '<div role="group" class="actions"><button data-testid="reply">Reply</button><button data-testid="retweet">Repost</button><button data-testid="like">Like</button></div>';
  const x = `${style}<style>body{background:#000;color:#eee;font:14px system-ui;margin:0}article{display:flex;flex-direction:row;align-items:stretch;width:540px;max-width:calc(100vw - 24px);box-sizing:border-box;margin:12px;padding:12px;gap:12px}.content{display:flex;flex-direction:column;flex:1;min-width:0}.avatar{flex:0 0 32px;background:#25423d;border-radius:50%;height:32px}video{width:100%;height:150px;background:#112b24;margin:12px 0}.actions{display:flex;justify-content:space-between;border-top:1px solid #333;padding:10px 0}</style><article><div class="avatar"></div><div class="content"><a href="/author/status/111"><time>Today</time></a><p>Public video fixture</p><video id="outer"></video><div data-testid="quoteTweet"><a href="/quoted/status/222"><time>Yesterday</time></a><video id="inner"></video></div>${actions}</div></article><article><div class="avatar"></div><div class="content"><a href="/neighbor/status/333"><time>Today</time></a><video id="neighbor"></video>${actions}</div></article>`;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (route.request().resourceType() === 'document' && ['www.reddit.com', 'x.com'].includes(url.hostname)) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Controlled MediaFetch fixture</title>' + (url.hostname === 'x.com' ? x : reddit) });
    return route.abort();
  });
  async function waitControls(count) { await page.waitForFunction(count => document.querySelectorAll('.mediafetch-control').length === count, count); }
  async function selected(selector) {
    await page.locator(selector).dispatchEvent('contextmenu');
    return worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find(tab => /^https:\/\/(www.reddit.com|x.com)\//.test(tab.url ?? ''));
      return chrome.tabs.sendMessage(tab.id, { type: 'contextCandidate' });
    });
  }
  await page.goto('https://www.reddit.com/');
  await waitControls(2);
  assert.match((await selected('#second')).url, /def456/);
  await page.locator('.mediafetch-control').nth(1).click();
  await page.waitForTimeout(100);
  assert.match((await worker.evaluate(() => globalThis.observedRequests.at(-1))).url, /def456/);
  checks.push('Reddit inline click and video context resolve the selected feed post');
  await page.evaluate(() => document.querySelector('shreddit-post').setAttribute('permalink', '/comments/xyz789/recycled/'));
  await page.waitForTimeout(400);
  await waitControls(2);
  assert.match((await selected('#first')).url, /xyz789/);
  await page.locator('.mediafetch-control').first().click();
  await page.waitForTimeout(100);
  assert.match((await worker.evaluate(() => globalThis.observedRequests.at(-1))).url, /xyz789/);
  checks.push('Recycled Reddit nodes replace their identity without duplicate controls');
  await page.goto('https://x.com/home');
  await waitControls(2);
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const layout = await page.locator('article').first().evaluate(post => {
      const host = post.querySelector('.mediafetch-control');
      const actions = post.querySelector('.actions');
      const bounds = host.getBoundingClientRect();
      return { height: bounds.height, width: bounds.width, belowActions: bounds.top >= actions.getBoundingClientRect().bottom, inContent: host.parentElement.classList.contains('content'), fits: post.scrollWidth <= post.clientWidth };
    });
    assert.ok(layout.height <= 34 && layout.width < 200 && layout.belowActions && layout.inContent && layout.fits, JSON.stringify(layout));
  }
  await page.setViewportSize({ width: 640, height: 800 });
  await page.screenshot({ path: path.join(root, 'artifacts/x-control-fixture.png'), fullPage: true });
  checks.push('X control stays compact below the action row at 320px and 640px widths');
  assert.match((await selected('#outer')).url, /\/111$/);
  assert.match((await selected('#inner')).url, /\/222$/);
  assert.match((await selected('#neighbor')).url, /\/333$/);
  checks.push('X quoted video context is distinct from the outer and neighboring post');
  await page.evaluate(() => { history.pushState({}, '', '/author/status/111'); document.querySelector('article').append(document.createElement('span')); });
  await page.waitForTimeout(400);
  await waitControls(2);
  checks.push('SPA navigation and DOM mutation preserve one control per post');
  const options = await context.newPage();
  await options.goto(`chrome-extension://${worker.url().split('/')[2]}/options.html`);
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'saveSettings', settings: { quality: '1080', inlineReddit: true, inlineX: false } }));
  await waitControls(0);
  await options.evaluate(() => chrome.runtime.sendMessage({ type: 'saveSettings', settings: { quality: '1080', inlineReddit: true, inlineX: true } }));
  await waitControls(2);
  checks.push('Inline settings remove and restore controls without reloading');
  const evidence = { date: new Date().toISOString(), browser: context.browser()?.version(), fixtureOnly: true, checks };
  await writeFile(path.join(root, 'artifacts/content-smoke.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await context.close(); }
