import { actionsFor, ACTIVE, type AppState, type Job, type JobAction } from '../shared/contracts.ts';
import { canonical } from '../shared/providers.ts';
import { icon } from './icons.ts';

const page = document.body.dataset.page ?? 'popup';
const root = document.querySelector<HTMLElement>('#app')!;
const main = el('main', 'main-content');
const labels: Record<JobAction, string> = { stop: 'Stop', delete: 'Stop and delete', resume: 'Continue', retry: 'Retry', forget: 'Remove from list' };
let latest: AppState | null = null;
let refreshing = false;
let initialized = false;
let pendingAction = false;
const selectedMedia = new Map<string, number>();
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
function nav(href: string, text: string) {
  const a = el('a', '', text); a.href = href;
  if (page === 'popup') a.target = '_blank';
  return a;
}
function init() {
  const header = el('header', 'header');
  const brand = nav('downloads.html', ''); brand.className = 'brand';
  const logo = el('img'); logo.src = 'logo.svg'; logo.alt = ''; brand.append(logo, el('span', '', 'MediaFetch'));
  header.append(brand);
  const helper = el('div', 'engine'); helper.id = 'engine';
  if (page === 'popup') {
    const settings = nav('options.html', 'Settings'); settings.className = 'settings-link'; settings.prepend(icon('settings'));
    header.append(settings);
  } else header.append(helper);
  root.append(header);
  const workspace = el('div', 'workspace');
  if (page !== 'popup') {
    const sidebar = el('nav', 'sidebar'); sidebar.setAttribute('aria-label', 'Main navigation');
    sidebar.append(el('span', 'sidebar-label', 'WORKSPACE'));
    for (const [href, label, name, current] of [
      ['downloads.html', 'Downloads', 'download', 'downloads'], ['options.html', 'Settings', 'settings', 'options'],
    ] as const) {
      const link = nav(href, label); link.prepend(icon(name));
      if (page === current) link.setAttribute('aria-current', 'page');
      sidebar.append(link);
    }
    sidebar.append(el('small', 'sidebar-note', `MediaFetch ${chrome.runtime.getManifest().version}\nOn your computer.`));
    workspace.append(sidebar);
  }
  workspace.append(main); root.append(workspace);
  const heading = el('div', 'title-row');
  const titles = el('div'); titles.append(el('h1', '', page === 'options' ? 'Settings' : page === 'downloads' ? 'Downloads' : 'Save a video'));
  const subtitle = el('p', 'muted', page === 'options' ? 'Quality, page controls and your download folder.' : 'Your videos. On your computer.');
  if (page === 'downloads') subtitle.id = 'list-summary';
  if (page !== 'popup') titles.append(subtitle);
  heading.append(titles); main.append(heading);
  if (page === 'popup') main.append(helper);
  const message = el('p', 'message'); message.id = 'message'; message.role = 'status'; message.hidden = true; main.append(message);
  const helperDetail = el('div', 'helper-detail'); helperDetail.id = 'helper-detail'; helperDetail.hidden = true; main.append(helperDetail);
  if (page === 'options') buildOptions(); else buildDownloadForm();
  const setup = el('details', 'setup card'); setup.id = 'setup';
  setup.append(el('summary', '', 'Helper setup & troubleshooting'));
  setup.append(el('p', '', 'Install the local helper once, then keep this extension loaded. From the MediaFetch project folder, run:'));
  setup.append(el('code', 'command', 'powershell -NoProfile -ExecutionPolicy Bypass -File .\\installer\\install.ps1'));
  setup.append(el('p', 'muted', 'Requires Python 3.12 or newer and ffmpeg. Installation uses your Windows account and does not require administrator rights.'));
  setup.append(el('p', 'muted', 'If a website requires authentication, MediaFetch will report it. Browser passwords and cookies are not imported.'));
  if (page !== 'options') {
    const shelf = el('section', 'shelf');
    if (page === 'popup') {
      const shelfHeader = el('div', 'section-heading'); shelfHeader.append(el('h2', '', 'Recent downloads'));
      const count = el('span'); count.id = 'recent-count'; shelfHeader.append(count); shelf.append(shelfHeader);
    }
    else {
      const clear = el('button', 'text-button remove-all', 'Remove all'); clear.prepend(icon('clear')); clear.id = 'remove-all'; clear.type = 'button'; clear.disabled = true;
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
        finally { pendingAction = false; clear.textContent = 'Remove all'; clear.prepend(icon('clear')); await refresh(); }
      });
      heading.append(clear);
      const hint = el('p', 'hint', 'Remove all clears inactive entries without partial files. Saved videos are kept.'); hint.id = 'remove-all-hint'; shelf.append(hint);
    }
    const jobs = el('div'); jobs.id = 'jobs'; shelf.append(jobs); main.append(shelf);
  }
  main.append(setup);
  const footer = el('footer', 'footer');
  if (page === 'popup') {
    const summary = el('span', '', 'No downloads yet'); summary.id = 'popup-summary';
    footer.append(summary, nav('downloads.html', 'View all downloads →')); root.append(footer);
  } else {
    const destination = el('span', 'destination'); destination.append(icon('folder'));
    const path = el('span'); path.id = 'destination-display'; destination.append(path);
    footer.append(destination, el('span', '', 'Saved videos stay on your computer')); main.append(footer);
  }
}
function qualitySelect(id: string) {
  const select = el('select'); select.id = id; select.name = 'quality';
  for (const [value, text] of [['1080', 'Up to 1080p'], ['720', 'Up to 720p'], ['best', 'Best available']]) { const option = el('option', '', text); option.value = value!; select.append(option); }
  return select;
}
function buildDownloadForm() {
  const form = el('form', 'card download-form'); form.id = 'download-form';
  const label = el('label', 'sr-only', 'Post link'); label.htmlFor = 'url';
  const input = el('input'); input.id = 'url'; input.type = 'url'; input.required = true; input.placeholder = 'Paste a Reddit, X or YouTube link'; input.autocomplete = 'off';
  const field = el('div', 'url-field'); field.append(icon('link'), label, input);
  const row = el('div', 'form-row'); const select = qualitySelect('quality'); select.setAttribute('aria-label', 'Video quality');
  const submit = el('button', 'primary', 'Download video'); submit.prepend(icon('download')); submit.type = 'submit'; row.append(select, submit);
  form.append(field, row);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (pendingAction) return;
    if (!canonical(input.value)) { status('Enter a supported Reddit, X or YouTube video link.', true); return; }
    pendingAction = true; submit.disabled = true;
    try { await request('enqueue', { url: input.value, quality: select.value }); status('Added to your downloads.'); await refresh(); }
    catch (error) { status((error as Error).message, true); }
    finally { pendingAction = false; submit.disabled = false; }
  }); main.append(form);
}
function buildOptions() {
  const form = el('form', 'card options-form');
  form.append(el('h2', '', 'Download preferences'), el('p', 'muted', 'Choose a quality limit and where Save video appears.'));
  const qLabel = el('label', '', 'Default quality'); qLabel.htmlFor = 'quality'; const q = qualitySelect('quality'); form.append(qLabel, q);
  for (const [id, text] of [['inlineReddit', 'Show Save video buttons on Reddit'], ['inlineX', 'Show Save video buttons on X'], ['inlineYouTube', 'Show Save video buttons on YouTube']]) {
    const label = el('label', 'toggle', text); const input = el('input'); input.type = 'checkbox'; input.id = id!; label.prepend(input); form.append(label);
  }
  const save = el('button', 'primary', 'Save preferences'); save.type = 'submit'; form.append(save);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await request('saveSettings', { settings: { quality: q.value, inlineReddit: (document.querySelector('#inlineReddit') as HTMLInputElement).checked, inlineX: (document.querySelector('#inlineX') as HTMLInputElement).checked, inlineYouTube: (document.querySelector('#inlineYouTube') as HTMLInputElement).checked } });
      status('Preferences saved.');
    } catch (error) { status((error as Error).message, true); }
  }); main.append(form);
  const destination = el('form', 'card options-form');
  destination.append(el('h2', '', 'Storage'));
  const label = el('label', '', 'Download folder'); label.htmlFor = 'destination';
  const input = el('input'); input.id = 'destination'; input.placeholder = 'Leave empty for Downloads\\VideoDownload';
  destination.append(label, input, el('p', 'hint', 'Existing downloads keep their original folder. Leave empty to restore the default.'));
  const savePath = el('button', 'secondary', 'Set download folder'); savePath.type = 'submit'; destination.append(savePath);
  destination.addEventListener('submit', async event => {
    event.preventDefault(); savePath.disabled = true;
    try { await request('setDestination', { path: input.value }); status('Download folder updated.'); await refresh(); }
    catch (error) { status((error as Error).message, true); }
    finally { savePath.disabled = false; }
  }); main.append(destination);
}
function renderJob(job: Job) {
  const card = el('article', 'job');
  card.dataset.jobId = job.id; card.dataset.state = job.state;
  const mark = el('span', 'job-mark'); mark.append(icon(ACTIVE.has(job.state) ? 'download' : job.state === 'completed' ? 'file' : 'alert'));
  const body = el('div', 'job-body'); card.append(mark, body);
  const top = el('div', 'job-top');
  const title = el('a', 'job-title', job.title || 'Video post'); title.href = job.url; title.target = '_blank'; title.rel = 'noreferrer';
  title.title = job.title || 'Video post';
  const progress = typeof job.progress === 'number' && Number.isFinite(job.progress) ? Math.max(0, Math.min(100, job.progress)) : null;
  const stateLabel = job.state.charAt(0).toUpperCase() + job.state.slice(1);
  const state = el('span', 'job-state', job.state === 'downloading' && progress !== null ? `${stateLabel} · ${Math.round(progress)}%` : stateLabel);
  if (job.state === 'completed') state.prepend(icon('check'));
  top.append(title, state); body.append(top);
  const detail = el('p', 'job-detail'); detail.append(el('span', 'provider', { reddit: 'Reddit', x: 'X', youtube: 'YouTube' }[job.provider]), document.createTextNode(` · ${job.quality === 'best' ? 'Best available' : `Up to ${job.quality}p`} · ${job.bytes ? `${(job.bytes / 1048576).toFixed(1)} MB` : 'Local download'}`)); body.append(detail);
  if (ACTIVE.has(job.state) && job.state !== 'queued') {
    const track = el('progress'); track.max = 100; track.setAttribute('aria-label', 'Download progress');
    if (job.state === 'downloading' && progress !== null) track.value = progress; body.append(track);
  }
  if (job.error) body.append(el('p', 'job-error', job.error));
  if (job.resumeRestarted) body.append(el('p', 'job-detail', 'The source restarted the transfer.'));
  else if (job.resumedBytes) body.append(el('p', 'job-detail', `Resumed a transfer at ${(job.resumedBytes / 1048576).toFixed(1)} MB`));
  if (job.path) {
    const file = el('details', 'saved-file'); file.append(el('summary', '', 'Saved file'), el('p', 'file-path', job.path)); body.append(file);
  }
  const actions = el('div', 'job-actions');
  let mediaSelect: HTMLSelectElement | undefined;
  if (job.mediaCount && job.mediaCount > 1 && job.state === 'failed') {
    mediaSelect = el('select'); mediaSelect.setAttribute('aria-label', 'Choose video in this post');
    for (let i = 1; i <= job.mediaCount; i++) { const option = el('option', '', `Video ${i}`); option.value = String(i); mediaSelect.append(option); }
    const selected = selectedMedia.get(job.id) ?? job.mediaIndex ?? 1;
    mediaSelect.value = String(selected >= 1 && selected <= job.mediaCount ? selected : 1);
    mediaSelect.addEventListener('change', () => selectedMedia.set(job.id, Number(mediaSelect!.value)));
    actions.append(mediaSelect);
  }
  for (const action of actionsFor(job)) {
    const label = action === 'delete' && !ACTIVE.has(job.state) ? 'Delete partial files' : labels[action];
    const button = el('button', action === 'delete' ? 'text-button danger' : 'text-button', label);
    button.dataset.action = action;
    button.disabled = latest?.helper !== 'ready';
    button.addEventListener('click', async () => {
      if (pendingAction) return;
      const hadFocus = document.activeElement === button;
      pendingAction = true; button.disabled = true;
      try {
        await request('jobAction', { action, jobId: job.id, ...(mediaSelect ? { mediaIndex: Number(mediaSelect.value) } : {}) });
        status(({ stop: 'Stopping download…', delete: 'Removing partial files…', retry: 'New attempt queued.', resume: 'Continuing download…', forget: 'Removed from the list.' })[action]);
      }
      catch (error) { status((error as Error).message, true); }
      finally {
        pendingAction = false; await refresh();
        // Disabling a focused button can move focus to the body before refresh.
        // Restore it only if the user has not moved to another control meanwhile.
        if (hadFocus && (document.activeElement === document.body || document.activeElement === button)) {
          const row = document.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(job.id)}"]`);
          const next = row?.querySelector<HTMLElement>(`button[data-action="${action}"]:enabled`) ?? row?.querySelector<HTMLElement>('button:enabled, a') ?? document.querySelector<HTMLElement>('#remove-all:enabled, #url');
          next?.focus();
        }
      }
    }); actions.append(button);
  }
  body.append(actions); return card;
}
function needsAttention(job: Job) { return !ACTIVE.has(job.state) && (job.hasPartials || !['completed', 'cancelled'].includes(job.state)); }
function renderList(jobs: HTMLElement, list: Job[]) {
  if (!list.length) {
    const empty = el('div', 'empty'); empty.append(icon('download'), el('h2', '', 'Your list is clear'), el('p', 'muted', 'Paste a post link above, or use Save video in your feed.')); jobs.append(empty);
  } else if (page === 'popup') {
    for (const job of list.slice(0, 2)) jobs.append(renderJob(job));
  } else {
    const groups = [
      { title: 'In progress', list: list.filter(job => ACTIVE.has(job.state)) },
      { title: 'Needs attention', list: list.filter(needsAttention) },
      { title: 'Finished', list: list.filter(job => !ACTIVE.has(job.state) && !needsAttention(job)) },
    ];
    for (const [index, group] of groups.entries()) {
      if (!group.list.length) continue;
      const section = el('section', 'job-group');
      const heading = el('div', 'section-heading'); const title = el('h2', '', group.title); title.id = `group-${index}`;
      section.setAttribute('aria-labelledby', title.id);
      heading.append(title, el('span', '', String(group.list.length))); section.append(heading);
      for (const job of group.list) section.append(renderJob(job));
      jobs.append(section);
    }
  }
}
let lastJobSignature = '';
let lastHelperSignature = '';
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    latest = await request('getState') as AppState;
    const helperSignature = JSON.stringify([latest.helper, latest.helperError, latest.snapshot?.destination]);
    if (helperSignature !== lastHelperSignature) {
      lastHelperSignature = helperSignature;
      const engine = document.querySelector('#engine')!; engine.replaceChildren();
      engine.append(el('span', latest.helper === 'ready' ? 'dot ready' : 'dot'), el('span', '', latest.helper === 'ready' ? 'Local helper connected' : 'Local helper not connected'));
      const detail = document.querySelector<HTMLElement>('#helper-detail')!; detail.replaceChildren(); detail.hidden = latest.helper === 'ready';
      const destination = document.querySelector('#destination-display');
      if (destination) destination.textContent = latest.snapshot?.destination || 'Download folder available when the helper connects';
      if (latest.helper !== 'ready') {
        detail.append(el('p', '', latest.helperError || 'Install the local helper, then reconnect. See setup guidance below.'));
        const reconnect = el('button', 'text-button', 'Reconnect');
        reconnect.addEventListener('click', async () => {
          reconnect.disabled = true;
          try { await request('reconnect'); await refresh(); } catch (error) { status((error as Error).message, true); }
          finally { reconnect.disabled = false; }
        });
        detail.append(reconnect);
      }
    }
    if (!initialized) {
      const q = document.querySelector<HTMLSelectElement>('#quality'); if (q) q.value = latest.settings.quality;
      const input = document.querySelector<HTMLInputElement>('#url'); if (input && latest.candidate) input.value = latest.candidate.url;
      if (page === 'options') {
        (document.querySelector('#inlineReddit') as HTMLInputElement).checked = latest.settings.inlineReddit;
        (document.querySelector('#inlineX') as HTMLInputElement).checked = latest.settings.inlineX;
        (document.querySelector('#inlineYouTube') as HTMLInputElement).checked = latest.settings.inlineYouTube;
        (document.querySelector('#destination') as HTMLInputElement).value = latest.snapshot?.destination ?? '';
      }
      if (latest.notice) status(latest.notice);
      initialized = true;
    }
    const jobs = document.querySelector<HTMLElement>('#jobs');
    const list = latest.snapshot?.jobs ?? [];
    for (const id of selectedMedia.keys()) if (!list.some(job => job.id === id)) selectedMedia.delete(id);
    const activeCount = list.filter(job => ACTIVE.has(job.state)).length;
    const attentionCount = list.filter(needsAttention).length;
    const summary = document.querySelector('#list-summary'); if (summary) summary.textContent = list.length ? `${activeCount} active · ${attentionCount} needs attention` : 'Your videos. On your computer.';
    const popupSummary = document.querySelector('#popup-summary'); if (popupSummary) popupSummary.textContent = attentionCount ? `${attentionCount} needs attention` : `${list.length} ${list.length === 1 ? 'download' : 'downloads'}`;
    const recentCount = document.querySelector('#recent-count'); if (recentCount) recentCount.textContent = list.length > 2 ? `2 of ${list.length}` : String(list.length);
    const clear = document.querySelector<HTMLButtonElement>('#remove-all');
    if (clear) clear.disabled = pendingAction || latest.helper !== 'ready' || !list.some(job => actionsFor(job).includes('forget'));
    const signature = JSON.stringify([list, latest.helper]);
    const active = document.activeElement as HTMLElement | null;
    const editingMedia = active?.tagName === 'SELECT' && jobs?.contains(active);
    if (jobs && signature !== lastJobSignature && !editingMedia) {
      const focusedJob = active?.closest<HTMLElement>('[data-job-id]')?.dataset.jobId;
      const focusedAction = active?.dataset.action;
      const focusedLink = active?.matches('.job-title') ? '.job-title' : active?.matches('.saved-file summary') ? '.saved-file summary' : null;
      const expandedFiles = [...jobs.querySelectorAll<HTMLDetailsElement>('.saved-file[open]')].map(file => file.closest<HTMLElement>('[data-job-id]')?.dataset.jobId);
      lastJobSignature = signature; jobs.replaceChildren();
      renderList(jobs, list);
      for (const file of jobs.querySelectorAll<HTMLDetailsElement>('.saved-file')) {
        file.open = expandedFiles.includes(file.closest<HTMLElement>('[data-job-id]')?.dataset.jobId);
      }
      if (focusedJob && (focusedAction || focusedLink)) {
        const card = jobs.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(focusedJob)}"]`);
        const selector = focusedAction ? `[data-action="${CSS.escape(focusedAction)}"]` : focusedLink!;
        const focus = card?.querySelector<HTMLElement>(selector) ?? card?.querySelector<HTMLElement>('button, a');
        focus?.focus({ preventScroll: true });
      }
    }
  } catch (error) { status((error as Error).message, true); }
  finally { refreshing = false; }
}
init(); void refresh();
setInterval(() => { if (!document.hidden && !pendingAction) void refresh(); }, 1500);
