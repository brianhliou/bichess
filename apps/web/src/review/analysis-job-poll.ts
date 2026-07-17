// Client side of the async analysis queue (#208). The server no longer computes
// a whole-game sweep inside the POST request (the edge killed the held request
// on long games): a cached game still answers 200 with the result (fast path
// unchanged), but a miss answers 202 + {jobId} and the compute runs on a server
// job queue. This helper hides that from callers: POST, and if accepted, poll
// GET <url>/jobs/:jobId until the job reports done (resolve with the result
// envelope) or failed (reject). Callers keep their old promise-shaped contract,
// so the review UI needed no changes.

export type AnalysisJobPollOptions = {
  /** Poll interval in ms (default 2000). Injectable so tests run instantly. */
  pollIntervalMs?: number;
  /** Overall deadline in ms (default 20 minutes — a long decisions pass is legit). */
  timeoutMs?: number;
  /** Error-code prefix, e.g. 'decisions_request_failed' (default 'analysis_request_failed'). */
  errorPrefix?: string;
};

type JobStatusBody =
  | { status: 'pending' }
  | { status: 'failed'; error?: string }
  | { status: 'done'; result: unknown };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST an analysis/decisions compute request and resolve with the result body:
 * immediately on 200 (cached), or after polling the job endpoint on 202.
 */
export async function postAnalysisJob<T>(
  url: string,
  opts: AnalysisJobPollOptions = {},
): Promise<T> {
  const errorPrefix = opts.errorPrefix ?? 'analysis_request_failed';
  const response = await fetch(url, { method: 'POST' });
  if (response.status === 200) return (await response.json()) as T;
  if (response.status !== 202) throw new Error(`${errorPrefix}_${response.status}`);

  const accepted = (await response.json()) as { jobId?: string };
  if (!accepted.jobId) throw new Error(`${errorPrefix}_missing_job`);
  const jobUrl = `${url}/jobs/${encodeURIComponent(accepted.jobId)}`;
  const intervalMs = opts.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 20 * 60 * 1_000);

  for (;;) {
    await sleep(intervalMs);
    if (Date.now() > deadline) throw new Error(`${errorPrefix}_timeout`);
    const poll = await fetch(jobUrl, { method: 'GET' });
    if (!poll.ok) throw new Error(`${errorPrefix}_${poll.status}`);
    const body = (await poll.json()) as JobStatusBody;
    if (body.status === 'done') return body.result as T;
    if (body.status === 'failed') {
      throw new Error(`${errorPrefix}_${body.error ?? 'analysis_failed'}`);
    }
  }
}
