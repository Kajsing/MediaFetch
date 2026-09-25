import { actionsFor, parseSnapshot } from '../shared/contracts.ts';

type Request = (action: string, fields?: Record<string, unknown>) => Promise<unknown>;

export async function removeAllHistory(request: Request) {
  // Capture the eligible set once. Jobs started later are outside this operation.
  const before = parseSnapshot(await request('snapshot'));
  const eligible = before.jobs.filter(job => actionsFor(job).includes('forget'));
  let removed = 0;
  let failed = 0;
  for (const job of eligible) {
    try {
      // The helper rechecks current state and real partial files before forgetting.
      // Never use delete here: this operation only removes history entries.
      await request('forget', { jobId: job.id });
      removed++;
    } catch { failed++; }
  }
  return { removed, failed, kept: before.jobs.length - removed };
}
