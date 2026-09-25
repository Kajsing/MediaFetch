export const HOST = 'dk.kajsing.mediafetch';
export const PROTOCOL = 1;
export const QUALITIES = ['best', '1080', '720'] as const;
export type Quality = typeof QUALITIES[number];
export type Provider = 'reddit' | 'x';
export const STATES = ['queued', 'resolving', 'downloading', 'merging', 'stopping', 'deleting', 'stopped', 'interrupted', 'failed', 'completed', 'cancelled'] as const;
export type JobState = typeof STATES[number];
export type JobAction = 'stop' | 'delete' | 'retry' | 'resume' | 'forget';
export interface Candidate { provider: Provider; url: string; contentId: string; title?: string; mediaIndex?: number }
export interface Job {
  id: string; attemptId: string; revision: number; provider: Provider; url: string;
  title: string; quality: Quality; state: JobState; progress: number | null;
  createdAt: string; updatedAt: string; bytes: number; error?: string;
  errorCode?: string; path?: string; resumable: boolean; hasPartials: boolean;
  mediaCount?: number; mediaIndex?: number;
  resumedBytes?: number;
  resumeRestarted?: boolean;
}
export interface Settings { quality: Quality; inlineReddit: boolean; inlineX: boolean }
export interface Snapshot { revision: number; jobs: Job[]; destination: string; ytDlpVersion?: string; ffmpeg: boolean; helperVersion: string }
export interface AppState {
  settings: Settings; snapshot: Snapshot | null; helper: 'ready' | 'missing' | 'error';
  helperError: string; notice: string; candidate: Candidate | null;
}
export const DEFAULT_SETTINGS: Settings = { quality: '1080', inlineReddit: true, inlineX: true };
export const ACTIVE = new Set<JobState>(['queued', 'resolving', 'downloading', 'merging', 'stopping', 'deleting']);
export function actionsFor(job: Job): JobAction[] {
  if (job.state === 'stopping' || job.state === 'deleting') return [];
  if (ACTIVE.has(job.state)) return ['stop', 'delete'];
  if (job.state === 'completed') return job.hasPartials ? ['delete'] : ['forget'];
  const actions: JobAction[] = job.resumable ? ['resume', 'retry'] : ['retry'];
  actions.push(job.hasPartials ? 'delete' : 'forget');
  return actions;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function quality(value: unknown): Quality {
  if (!QUALITIES.includes(value as Quality)) throw new Error('Choose a supported quality.');
  return value as Quality;
}
export function parseSettings(value: unknown): Settings {
  if (!isRecord(value) || typeof value.inlineReddit !== 'boolean' || typeof value.inlineX !== 'boolean') throw new Error('Invalid settings.');
  return { quality: quality(value.quality), inlineReddit: value.inlineReddit, inlineX: value.inlineX };
}
export function jobId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error('Invalid download ID.');
  return value;
}
export function parseSnapshot(value: unknown): Snapshot {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || !Array.isArray(value.jobs) || value.jobs.length > 250 || typeof value.destination !== 'string' || typeof value.ffmpeg !== 'boolean' || typeof value.helperVersion !== 'string') throw new Error('The helper returned an invalid status.');
  for (const job of value.jobs) {
    if (!isRecord(job) || !STATES.includes(job.state as JobState) || !['x', 'reddit'].includes(String(job.provider)) || typeof job.url !== 'string' || typeof job.title !== 'string' || !Number.isSafeInteger(job.revision) || typeof job.resumable !== 'boolean' || typeof job.hasPartials !== 'boolean') throw new Error('The helper returned an invalid download.');
    jobId(job.id); jobId(job.attemptId); quality(job.quality);
  }
  return value as unknown as Snapshot;
}
