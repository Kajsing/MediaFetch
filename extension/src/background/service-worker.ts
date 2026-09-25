import { DEFAULT_SETTINGS, PROTOCOL, isRecord, parseSettings, parseSnapshot, quality, jobId, type AppState, type Candidate, type Snapshot } from '../shared/contracts.ts';
import { PAGE_PATTERNS, canonical, providerFor, requireCandidate } from '../shared/providers.ts';
import { NativeHost } from './native-host.ts';
import { removeAllHistory } from './history.ts';

const state: AppState = { settings: DEFAULT_SETTINGS, snapshot: null, helper: 'missing', helperError: '', notice: '', candidate: null };
const loaded = chrome.storage.local.get(['settings', 'snapshot', 'notice']).then(data => {
  try { if (data.settings) state.settings = parseSettings(data.settings); } catch { /* Defaults repair invalid stored settings. */ }
  try { if (data.snapshot) state.snapshot = parseSnapshot(data.snapshot); } catch { /* Discard invalid cached state. */ }
  if (typeof data.notice === 'string') state.notice = data.notice;
});
let sessionRevision = -1;
let handshake: Promise<void> | null = null;
let connected = false;
let retryAfter = 0;
let writes = Promise.resolve();
let clearingHistory: ReturnType<typeof removeAllHistory> | null = null;
const native = new NativeHost(snapshot => {
  if (snapshot.revision < sessionRevision) return;
  sessionRevision = snapshot.revision; state.snapshot = snapshot;
  writes = writes.then(() => chrome.storage.local.set({ snapshot })).catch(() => undefined);
}, message => { connected = false; handshake = null; sessionRevision = -1; state.helper = 'missing'; state.helperError = message; retryAfter = Date.now() + 30000; });
async function ensureHost(force = false) {
  if (connected) return;
  if (!force && Date.now() < retryAfter) throw new Error(state.helperError);
  if (!handshake) handshake = native.request('hello').then(data => {
    if (!isRecord(data) || data.protocolVersion !== PROTOCOL) throw new Error('Update the extension and helper together: protocol mismatch.');
    state.snapshot = parseSnapshot(data.snapshot); sessionRevision = state.snapshot.revision;
    state.helper = 'ready'; state.helperError = ''; connected = true;
  }).catch(error => { handshake = null; state.helper = 'missing'; state.helperError = error.message; retryAfter = Date.now() + 30000; throw error; });
  await handshake;
}
function trustedUI(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && ['popup.html', 'downloads.html', 'options.html'].some(page => sender.url?.split('?')[0] === chrome.runtime.getURL(page));
}
function trustedContent(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && sender.frameId === 0 && typeof sender.tab?.id === 'number' && !!sender.url && !!providerFor(sender.url);
}
async function start(candidate: Candidate, selectedQuality = state.settings.quality) {
  await ensureHost(true);
  if (candidate.provider === 'youtube' && !state.snapshot?.providers?.includes('youtube')) throw new Error('Update the local helper to install YouTube support, then reconnect.');
  return native.request('enqueue', { url: candidate.url, quality: selectedQuality, mediaIndex: candidate.mediaIndex ?? null });
}
async function detectCurrent(): Promise<Candidate | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !providerFor(tab.url)) return null;
  return canonical(tab.url);
}
async function handle(message: unknown, sender: chrome.runtime.MessageSender) {
  await loaded;
  if (!isRecord(message) || typeof message.type !== 'string' || JSON.stringify(message).length > 8192) throw new Error('Invalid request.');
  const ui = trustedUI(sender), content = trustedContent(sender);
  if (!ui && !content) throw new Error('This page cannot control MediaFetch.');
  if (message.type === 'getSettings') return state.settings;
  if (message.type === 'enqueue' && content) {
    const candidate = requireCandidate(message.url);
    if (candidate.provider !== providerFor(sender.url!)) throw new Error('The post does not belong to this provider.');
    return start(candidate);
  }
  if (!ui) throw new Error('Open MediaFetch to manage downloads.');
  switch (message.type) {
    case 'reconnect':
      await ensureHost(true); return null;
    case 'getState':
      await ensureHost().catch(() => undefined);
      state.candidate = await detectCurrent();
      return state;
    case 'enqueue': {
      const candidate = requireCandidate(message.url);
      if (message.mediaIndex !== undefined && message.mediaIndex !== null) {
        if (!Number.isInteger(message.mediaIndex) || Number(message.mediaIndex) < 1 || Number(message.mediaIndex) > 16) throw new Error('Choose a valid video number.');
        candidate.mediaIndex = Number(message.mediaIndex);
      }
      return start(candidate, quality(message.quality));
    }
    case 'jobAction': {
      if (!['stop', 'delete', 'retry', 'resume', 'forget'].includes(String(message.action))) throw new Error('Unsupported download action.');
      await ensureHost();
      return native.request(String(message.action), { jobId: jobId(message.jobId), ...(message.mediaIndex ? { mediaIndex: message.mediaIndex } : {}) });
    }
    case 'removeAll':
      await ensureHost();
      clearingHistory ??= removeAllHistory((action, fields) => native.request(action, fields)).finally(() => { clearingHistory = null; });
      return clearingHistory;
    case 'saveSettings':
      state.settings = parseSettings(message.settings);
      await chrome.storage.local.set({ settings: state.settings });
      return state.settings;
    case 'setDestination':
      if (typeof message.path !== 'string' || message.path.length > 240) throw new Error('Enter a local folder path.');
      await ensureHost(); return native.request('configure', { destination: message.path });
    case 'clearNotice':
      state.notice = ''; await chrome.storage.local.set({ notice: '' }); return null;
    default: throw new Error('Unsupported request.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender).then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error instanceof Error ? error.message : 'The request failed.' }));
  return true;
});
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: 'mediafetch-download', title: 'Download video with MediaFetch', contexts: ['video', 'link', 'page'], documentUrlPatterns: PAGE_PATTERNS });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'mediafetch-download' || !tab?.id) return;
  try {
    await loaded;
    let candidate = info.linkUrl ? canonical(info.linkUrl) : null;
    if (!candidate && info.mediaType === 'video') {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: 'contextCandidate' }, { frameId: 0 });
      if (isRecord(reply) && typeof reply.url === 'string') candidate = canonical(reply.url);
    }
    if (!candidate && !info.mediaType && !info.linkUrl) candidate = canonical(info.pageUrl);
    if (!candidate) throw new Error('Choose a video post or open its permalink first.');
    await start(candidate); state.notice = 'Download added.';
  } catch (error) { state.notice = error instanceof Error ? error.message : 'Could not start the download.'; }
  await chrome.storage.local.set({ notice: state.notice });
  await chrome.action.setBadgeText({ text: state.notice === 'Download added.' ? '↓' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6555a8' });
});
