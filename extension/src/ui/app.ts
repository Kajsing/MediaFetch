import { actionsFor, ACTIVE, type AppState, type Job, type JobAction, type Quality } from '../shared/contracts.ts';
import { canonical } from '../shared/providers.ts';

const page = document.body.dataset.page ?? 'popup';
const root = document.querySelector<HTMLElement>('#app')!;
const labels: Record<JobAction, string> = { stop: 'Stop', delete: 'Stop and delete', resume: 'Continue', retry: 'Retry', forget: 'Remove from list' };
let latest: AppState | null = null;
let refreshing = false;
let initialized = false;
let pendingAction = false;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
async function request(type: string, fields: Record<string, unknown> = {}): Promise<any> {
  const reply = await chrome.runtime.sendMessage({ type, ...fields });
  if (!reply?.ok) throw new Error(reply?.error ?? 'MediaFetch could not respond. Try reopening the extension.');
  return reply.data;
}
function status(message: string, error = false) {
  const node = document.querySelector<HTMLElement>('#message')!;
  node.textContent = message; node.classList.toggle('error', error); node.hidden = !message;
}
function nav(href: string, text: string) { const a = el('a', '', text); a.href = href; a.target = '_blank'; return a; }
function init() {
  const header = el('header', 'header');
  const brand = el('a', 'brand'); brand.href = 'downloads.html'; brand.target = '_blank';
  const logo = el('img'); logo.src = 'logo.svg'; logo.alt = ''; brand.append(logo, el('span', '', 'MediaFetch'));
  header.append(brand, nav(page === 'options' ? 'downloads.html' : 'options.html', page === 'options' ? 'Downloads ↗' : 'Settings ↗'));
  root.append(header);
  const heading = el('section', 'intro');
  heading.append(el('p', 'eyebrow', 'YOUR VIDEOS. ON YOUR COMPUTER.'), el('h1', '', page === 'options' ? 'Make it yours.' : page === 'downloads' ? 'Your download shelf.' : 'Save the moment.'), el('p', 'muted', page === 'options' ? 'A few defaults. Everything stays local.' : 'From your feed to your files.'));
  root.append(heading);
  const message = el('p', 'message'); message.id = 'message'; message.role = 'status'; message.hidden = true; root.append(message);
  const helper = el('div', 'engine'); helper.id = 'engine'; root.append(helper);
  if (page === 'options') buildOptions(); else buildDownloadForm();
  const setup = el('details', 'setup card'); setup.id = 'setup';
  setup.append(el('summary', '', 'Helper setup & troubleshooting'));
  setup.append(el('p', '', 'Install the local helper once, then keep this extension loaded. From the MediaFetch project folder, run:'));
  setup.append(el('code', 'command', 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\installer\\install.ps1'));
  setup.append(el('p', 'muted', 'Requires Python 3.12 or newer and ffmpeg. Installation uses your Windows account and does not require administrator rights.'));
  setup.append(el('p', 'muted', 'If a website requires authentication, MediaFetch will report it. Browser passwords and cookies are not imported.'));
  root.append(setup);
  if (page !== 'options') {
    const shelf = el('section', 'shelf');
    const shelfHeader = el('div', 'section-heading'); shelfHeader.append(el('h2', '', page === 'popup' ? 'Recent downloads' : 'Downloads'));
    if (page === 'popup') shelfHeader.append(nav('downloads.html', 'View all ↗'));
    else {
      const clear = el('button', 'text-button', 'Remove all'); clear.id = 'remove-all'; clear.type = 'button'; clear.disabled = true;
      clear.title = 'Remove inactive entries without partial files. Saved videos are kept.';
      clear.setAttribute('aria-describedby', 'remove-all-hint');
      clear.addEventListener('click', async () => {
        if (pendingAction) return;
        pendingAction = true; clear.disabled = true; clear.textContent = 'Removing…';
        try {
          const result = await request('removeAll') as { removed: number; failed: number; kept: number };
          const message = `Removed ${result.removed} ${result.removed === 1 ? 'entry' : 'entries'}. Saved videos were kept.`;
          status(result.failed ? `${message} Some entries could not be removed; try again.` : result.kept ? `${message} Active downloads and retained partial files stay in the list.` : message, result.failed > 0);
        } catch (error) { status((error as Error).message, true); }
        finally { pendingAction = false; clear.textContent = 'Remove all'; await refresh(); }
      });
      shelfHeader.append(clear);
    }
    shelf.append(shelfHeader);
    if (page === 'downloads') {
      const hint = el('p', 'hint', 'Saved videos are kept. Active downloads and retained partial files stay in the list.'); hint.id = 'remove-all-hint'; shelf.append(hint);
    }
    const jobs = el('div'); jobs.id = 'jobs'; shelf.append(jobs); root.append(shelf);
  }
  const footer = el('footer', 'footer'); footer.append(el('span', '', 'LOCAL BY DESIGN'), el('span', '', `MediaFetch ${chrome.runtime.getManifest().version}`)); root.append(footer);
}
function qualitySelect(id: string) {
  const select = el('select'); select.id = id; select.name = 'quality';
  for (const [value, text] of [['1080', 'Up to 1080p'], ['720', 'Up to 720p'], ['best', 'Best available']]) { const option = el('option', '', text); option.value = value!; select.append(option); }
  return select;
}
function buildDownloadForm() {
  const form = el('form', 'card download-form'); form.id = 'download-form';
  const label = el('label', '', 'POST LINK'); label.htmlFor = 'url';
  const input = el('input'); input.id = 'url'; input.type = 'url'; input.required = true; input.placeholder = 'Paste a Reddit or X post link'; input.autocomplete = 'off';
  const row = el('div', 'form-row'); const select = qualitySelect('quality'); select.setAttribute('aria-label', 'Video quality');
  const submit = el('button', 'primary', '↓ Download video'); submit.type = 'submit'; row.append(select, submit);
  form.append(label, input, row, el('p', 'hint', 'One post at a time · Two downloads in parallel'));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pendingAction) return;
    if (!canonical(input.value)) { status('Enter the permalink of a supported Reddit or X post.', true); return; }
    pendingAction = true; submit.disabled = true;
    try { await request('enqueue', { url: input.value, quality: select.value }); status('Added to your downloads.'); await refresh(); }
    catch (error) { status((error as Error).message, true); }
    finally { pendingAction = false; submit.disabled = false; }
  }); root.append(form);
}
function buildOptions() {
  const form = el('form', 'card options-form');
  const qLabel = el('label', '', 'DEFAULT QUALITY'); qLabel.htmlFor = 'quality'; const q = qualitySelect('quality'); form.append(qLabel, q);
  for (const [id, text] of [['inlineReddit', 'Show Save video buttons on Reddit'], ['inlineX', 'Show Save video buttons on X']]) {
    const label = el('label', 'toggle', text); const input = el('input'); input.type = 'checkbox'; input.id = id!; label.prepend(input); form.append(label);
  }
  const save = el('button', 'primary', 'Save preferences'); save.type = 'submit'; form.append(save);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request('saveSettings', { settings: { quality: q.value, inlineReddit: (document.querySelector('#inlineReddit') as HTMLInputElement).checked, inlineX: (document.querySelector('#inlineX') as HTMLInputElement).checked } });
      status('Preferences saved.');
    } catch (error) { status((error as Error).message, true); }
  }); root.append(form);
  const destination = el('form', 'card options-form');
  const label = el('label', '', 'DOWNLOAD FOLDER'); label.htmlFor = 'destination';
  const input = el('input'); input.id = 'destination'; input.placeholder = 'Leave empty for Downloads\\VideoDownload';
  destination.append(label, input, el('p', 'hint', 'Existing downloads keep their original folder. Leave empty to restore the default.'));
  const savePath = el('button', 'secondary', 'Set download folder'); savePath.type = 'submit'; destination.append(savePath);
  destination.addEventListener('submit', async event => {
    event.preventDefault(); savePath.disabled = true;
    try { await request('setDestination', { path: input.value }); status('Download folder updated.'); await refresh(); }
    catch (error) { status((error as Error).message, true); }
    finally { savePath.disabled = false; }
  }); root.append(destination);
}
function renderJob(job: Job) {
  const card = el('article', 'job');
  card.dataset.jobId = job.id;
  const top = el('div', 'job-top');
  top.append(el('span', `provider ${job.provider}`, job.provider === 'reddit' ? 'r/' : '𝕏'), el('span', 'job-state', job.state.charAt(0).toUpperCase() + job.state.slice(1)));
  const title = el('a', 'job-title', job.title || 'Video post'); title.href = job.url; title.target = '_blank'; title.rel = 'noreferrer';
  card.append(top, title);
  const detail = el('p', 'job-detail', `${job.quality === 'best' ? 'Best available' : `≤ ${job.quality}p`} · ${job.bytes ? `${(job.bytes / 1048576).toFixed(1)} MB` : 'Local download'}`); card.append(detail);
  if (ACTIVE.has(job.state)) {
    const track = el('progress'); track.max = 100; track.setAttribute('aria-label', 'Download progress');
    if (typeof job.progress === 'number') track.value = job.progress; card.append(track);
  }
  if (job.error) card.append(el('p', 'job-error', job.error));
  if (job.resumeRestarted) card.append(el('p', 'job-detail', 'The source restarted the transfer.'));
  else if (job.resumedBytes) card.append(el('p', 'job-detail', `Resumed a transfer at ${(job.resumedBytes / 1048576).toFixed(1)} MB`));
  if (job.path) { const path = el('p', 'file-path', job.path); path.title = job.path; card.append(path); }
  const actions = el('div', 'job-actions');
  let mediaSelect: HTMLSelectElement | undefined;
  if (job.mediaCount && job.mediaCount > 1 && job.state === 'failed') {
    mediaSelect = el('select'); mediaSelect.setAttribute('aria-label', 'Choose video in this post');
    for (let i = 1; i <= job.mediaCount; i++) { const option = el('option', '', `Video ${i}`); option.value = String(i); mediaSelect.append(option); }
    actions.append(mediaSelect);
  }
  for (const action of actionsFor(job)) {
    const label = action === 'delete' && !ACTIVE.has(job.state) ? 'Delete partial files' : labels[action];
    const button = el('button', action === 'delete' ? 'text-button danger' : 'text-button', label);
    button.dataset.action = action;
    button.disabled = latest?.helper !== 'ready';
    button.addEventListener('click', async () => {
      if (pendingAction) return;
      pendingAction = true; button.disabled = true;
      try {
        await request('jobAction', { action, jobId: job.id, ...(mediaSelect ? { mediaIndex: Number(mediaSelect.value) } : {}) });
        status(({ stop: 'Stopping download…', delete: 'Removing partial files…', retry: 'New attempt queued.', resume: 'Continuing download…', forget: 'Removed from the list.' })[action]);
      }
      catch (error) { status((error as Error).message, true); }
      finally { pendingAction = false; await refresh(); }
    }); actions.append(button);
  }
  card.append(actions); return card;
}
let lastJobSignature = '';
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    latest = await request('getState') as AppState;
    const engine = document.querySelector('#engine')!; engine.replaceChildren();
    engine.append(el('span', latest.helper === 'ready' ? 'dot ready' : 'dot'), el('span', '', latest.helper === 'ready' ? 'Local helper connected' : 'Local helper not connected'));
    const detail = el('span', 'engine-detail', latest.helper === 'ready' ? (latest.snapshot?.destination ?? '') : latest.helperError); engine.append(detail);
    if (latest.helper !== 'ready') {
      const reconnect = el('button', 'text-button', 'Reconnect');
      reconnect.addEventListener('click', async () => {
        reconnect.disabled = true;
        try { await request('reconnect'); await refresh(); } catch (error) { status((error as Error).message, true); }
      });
      engine.append(reconnect);
    }
    if (!initialized) {
      const q = document.querySelector<HTMLSelectElement>('#quality'); if (q) q.value = latest.settings.quality;
      const input = document.querySelector<HTMLInputElement>('#url'); if (input && latest.candidate) input.value = latest.candidate.url;
      if (page === 'options') {
        (document.querySelector('#inlineReddit') as HTMLInputElement).checked = latest.settings.inlineReddit;
        (document.querySelector('#inlineX') as HTMLInputElement).checked = latest.settings.inlineX;
        (document.querySelector('#destination') as HTMLInputElement).value = latest.snapshot?.destination ?? '';
      }
      if (latest.notice) status(latest.notice);
      initialized = true;
    }
    const jobs = document.querySelector('#jobs');
    const list = latest.snapshot?.jobs ?? [];
    const clear = document.querySelector<HTMLButtonElement>('#remove-all');
    if (clear) clear.disabled = pendingAction || latest.helper !== 'ready' || !list.some(job => actionsFor(job).includes('forget'));
    const signature = JSON.stringify([list, latest.helper]);
    const active = document.activeElement as HTMLElement | null;
    const editingMedia = active?.tagName === 'SELECT' && jobs?.contains(active);
    if (jobs && signature !== lastJobSignature && !editingMedia) {
      const focusedJob = active?.closest<HTMLElement>('[data-job-id]')?.dataset.jobId;
      const focusedAction = active?.dataset.action;
      lastJobSignature = signature; jobs.replaceChildren();
      if (!list.length) {
        const empty = el('div', 'empty card'); empty.append(el('div', 'empty-icon', '↓'), el('h3', '', 'A little space for good videos.'), el('p', 'muted', 'Paste a post link above, or use Save video in your feed.')); jobs.append(empty);
      } else for (const job of page === 'popup' ? list.slice(0, 3) : list) jobs.append(renderJob(job));
      if (focusedJob && focusedAction) {
        const card = jobs.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(focusedJob)}"]`);
        const focus = card?.querySelector<HTMLElement>(`[data-action="${CSS.escape(focusedAction)}"]`) ?? card?.querySelector<HTMLElement>('button, a');
        focus?.focus({ preventScroll: true });
      }
    }
  } catch (error) { status((error as Error).message, true); }
  finally { refreshing = false; }
}
init(); void refresh();
setInterval(() => { if (!document.hidden && !pendingAction) void refresh(); }, 1500);
