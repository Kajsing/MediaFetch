import { providerFor } from '../shared/providers.ts';
import { DEFAULT_SETTINGS, type Candidate, type Settings } from '../shared/contracts.ts';
import { REDDIT_POSTS, redditCandidate } from '../providers/reddit/adapter.ts';
import { X_POSTS, xCandidate, xControlAnchor } from '../providers/x/adapter.ts';

let settings: Settings = DEFAULT_SETTINGS;
let contextTarget: Element | null = null;
let contextTime = 0;
const hosts = new Map<Element, { host: HTMLElement; identity: string }>();
function candidate(target: Element): Candidate | null {
  return providerFor(location.href) === 'reddit' ? redditCandidate(target, location.href) : xCandidate(target, location.href);
}
document.addEventListener('contextmenu', event => {
  contextTarget = event.target instanceof Element ? event.target : null;
  contextTime = Date.now();
}, true);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'contextCandidate') return;
  const found = contextTarget?.isConnected && Date.now() - contextTime < 60000 ? candidate(contextTarget) : null;
  reply(found ? { url: found.url + (found.mediaIndex ? `/video/${found.mediaIndex}` : '') } : null);
});
async function refreshSettings() {
  try { const result = await chrome.runtime.sendMessage({ type: 'getSettings' }); if (result.ok) settings = result.data; } catch { /* Extension may have been reloaded. */ }
}
chrome.storage.onChanged.addListener(changes => { if (changes.settings) { void refreshSettings().then(() => scan(document)); } });
function scan(scope: ParentNode) {
  const provider = providerFor(location.href);
  const enabled = provider === 'reddit' ? settings.inlineReddit : settings.inlineX;
  for (const [post, entry] of hosts) {
    if (!post.isConnected || !enabled) { entry.host.remove(); hosts.delete(post); }
  }
  if (!enabled || !provider) return;
  const selector = provider === 'reddit' ? REDDIT_POSTS : X_POSTS;
  const posts = [...scope.querySelectorAll(selector)];
  if (scope instanceof Element && scope.matches(selector)) posts.unshift(scope);
  for (const post of posts) {
    const found = candidate(post);
    const old = hosts.get(post);
    const anchor = provider === 'x' ? xControlAnchor(post) : null;
    if (provider === 'x' && !anchor) {
      if (old) { old.host.remove(); hosts.delete(post); }
      continue; // Wait for a recognized action row rather than changing X's layout.
    }
    if (old && (old.identity !== found?.url || !old.host.isConnected)) { old.host.remove(); hosts.delete(post); }
    if (!found) continue;
    const existing = hosts.get(post);
    if (existing) {
      if (anchor && anchor.nextElementSibling !== existing.host) anchor.after(existing.host);
      continue;
    }
    if (!post.querySelector('video, shreddit-player, [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-click-id="media"]') && post.getAttribute('post-type') !== 'video') continue;
    const host = document.createElement('span');
    host.className = 'mediafetch-control';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `:host{display:inline-flex;flex:0 0 auto;align-self:flex-start;align-items:center;width:max-content;max-width:100%;height:auto;margin:${provider === 'x' ? '8px 0 4px' : '6px 10px'}}button{box-sizing:border-box;height:32px;white-space:nowrap;line-height:18px;font:600 12px system-ui;color:#d3fff2;background:#173c36;border:1px solid #47887b;border-radius:20px;padding:6px 12px;cursor:pointer}button:hover{background:#24574c}button:focus-visible{outline:2px solid #51e3b0;outline-offset:2px}button:disabled{opacity:.7;cursor:wait}`;
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = '↓ Save video'; button.title = 'Download this post with MediaFetch';
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      const current = candidate(post);
      if (!current || current.url !== hosts.get(post)?.identity) { button.textContent = 'Open post first'; return; }
      button.disabled = true; button.textContent = 'Adding…';
      try {
        const result = await chrome.runtime.sendMessage({ type: 'enqueue', url: current.url });
        button.textContent = result.ok ? '✓ Added to downloads' : 'Open MediaFetch';
        button.title = result.ok ? 'Manage progress in MediaFetch' : String(result.error);
      } catch { button.textContent = 'Reload this page'; }
      finally { button.disabled = false; }
    });
    shadow.append(style, button); hosts.set(post, { host, identity: found.url });
    if (anchor) anchor.after(host);
    else post.append(host);
  }
}
const pending = new Set<Element>();
let timer: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(records => {
  for (const record of records) {
    if (record.target instanceof Element && !record.target.closest('.mediafetch-control')) {
      const post = record.target.closest(REDDIT_POSTS + ',' + X_POSTS);
      if (post) pending.add(post);
    }
    for (const node of record.addedNodes) if (node instanceof Element && !node.matches('.mediafetch-control')) pending.add(node);
  }
  if (!timer && pending.size) timer = setTimeout(() => {
    timer = null; const nodes = [...pending]; pending.clear();
    for (const node of nodes) if (node.isConnected) scan(node);
  }, 250);
});
void refreshSettings().then(() => { scan(document); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'permalink', 'data-permalink', 'post-type'] }); });
