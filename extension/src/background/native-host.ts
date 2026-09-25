import { HOST, PROTOCOL, isRecord, parseSnapshot, type Snapshot } from '../shared/contracts.ts';

export class NativeHost {
  private port: chrome.runtime.Port | null = null;
  private disconnectReason: string | null = null;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private onSnapshot: (snapshot: Snapshot) => void, private onDisconnect: (message: string) => void) {}
  async request(action: string, fields: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.port) this.connect();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The local helper did not respond. Reopen MediaFetch to reconnect.')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.port!.postMessage({ v: PROTOCOL, id, action, ...fields }); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('The local helper connection was lost.')); }
    });
  }
  private connect() {
    this.disconnectReason = null;
    const port = chrome.runtime.connectNative(HOST);
    this.port = port;
    port.onMessage.addListener((value: unknown) => {
      try {
        if (!isRecord(value)) throw new Error('Invalid helper message.');
        if (value.kind === 'snapshot') { this.onSnapshot(parseSnapshot(value.data)); return; }
        if (value.kind !== 'reply' || typeof value.id !== 'string') throw new Error('Invalid helper response.');
        const pending = this.pending.get(value.id);
        if (!pending) return;
        this.pending.delete(value.id); clearTimeout(pending.timer);
        if (value.ok === true) pending.resolve(value.data);
        else {
          const message = typeof value.error === 'string' ? value.error : 'The request could not be completed.';
          if (value.code === 'HELPER_BUSY' || value.code === 'STATE_INVALID') this.disconnectReason = message;
          pending.reject(new Error(message));
        }
      } catch (error) { this.onDisconnect(error instanceof Error ? error.message : 'Invalid helper status.'); }
    });
    port.onDisconnect.addListener(() => {
      const details = chrome.runtime.lastError?.message ?? '';
      this.port = null;
      const message = this.disconnectReason ?? (/not found|not registered|forbidden|Specified native messaging host/i.test(details)
        ? 'Install the MediaFetch helper to enable downloads.' : 'The local helper disconnected. Unfinished downloads can be retried after reconnecting.');
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
      this.pending.clear(); this.onDisconnect(message);
    });
  }
}
