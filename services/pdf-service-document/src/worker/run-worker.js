import { normalize } from '@pdf-reader/core-service-document/src/domain/text/normalize.js';
import { buildCoreServices, makeProcessDocument } from '../container.js';

// No job in the queue right now: wait before polling again rather than hammering Postgres in a
// tight loop. Short enough that a freshly uploaded document starts processing within a second or
// two of being enqueued.
const POLL_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const processOneJob = async ({ job, documentRepo, pageRepo, wordRepo, jobRepo, extractor, runInTransaction }) => {
  const document = await documentRepo.findById(job.documentId);
  if (!document) {
    // The document was deleted (cascades document_jobs too, but a job already claimed before the
    // delete can still reach here) — nothing left to process.
    await jobRepo.markDone(job.id, { pageCount: 0 });
    return;
  }

  const processDocument = makeProcessDocument({
    documentRepo,
    pageRepo,
    wordRepo,
    extractor,
    normalize,
    runInTransaction,
    onProgress: ({ pagesDone }) => jobRepo.recordProgress(job.id, { pagesDone }),
  });

  const result = await processDocument({ documentId: job.documentId, storagePath: document.storagePath });

  if (result?.status === 'ready') {
    await jobRepo.markDone(job.id, { pageCount: result.pageCount });
  } else {
    await jobRepo.markFailed(job.id, {
      errorMessage: result?.errorMessage ?? 'extraction failed',
      attempts: job.attempts,
    });
  }
};

// Polls document_jobs for work and runs extraction one job at a time. Runs in its own PM2
// process, isolated from the API's memory/CPU budget — a large PDF parsing here can no longer
// slow down or crash the process answering HTTP requests, and a worker restart (PM2's
// max_memory_restart) just leaves the in-flight job's row to be reclaimed by claimNext's stale
// lock check instead of losing it.
// `shouldStop` and `pollIntervalMs` are overridable so tests can run this loop against a real
// Postgres with a short interval and a bounded lifetime, instead of only exercising it via a
// separate long-lived process.
export const runWorker = async (config, { shouldStop, pollIntervalMs = POLL_INTERVAL_MS, closePoolOnExit = true } = {}) => {
  const services = buildCoreServices(config);
  const { pool, jobRepo } = services;

  console.log('[document-worker] started, polling for jobs');
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  while (!stopped && !(shouldStop?.())) {
    let job;
    try {
      job = await jobRepo.claimNext();
    } catch (err) {
      console.error('[document-worker] failed to claim next job:', err);
      await sleep(pollIntervalMs);
      continue;
    }

    if (!job) {
      await sleep(pollIntervalMs);
      continue;
    }

    console.log(`[document-worker] processing document ${job.documentId} (attempt ${job.attempts})`);
    try {
      await processOneJob({ job, ...services });
    } catch (err) {
      console.error(`[document-worker] job ${job.id} failed unexpectedly:`, err);
      await jobRepo.markFailed(job.id, { errorMessage: err.message, attempts: job.attempts }).catch(() => {});
    }
  }

  if (closePoolOnExit) await pool.end();
};
