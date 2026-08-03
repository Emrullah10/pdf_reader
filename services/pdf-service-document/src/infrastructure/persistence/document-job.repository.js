const rowToJob = (row) => ({
  id: row.id,
  documentId: row.document_id,
  status: row.status,
  attempts: row.attempts,
  pagesDone: row.pages_done,
  pageCount: row.page_count,
  errorMessage: row.error_message,
  lockedAt: row.locked_at,
});

// Jobs older than this in 'running' are assumed to belong to a worker that crashed or was
// restarted mid-job (PM2's max_memory_restart, a deploy, etc.) and are reclaimed rather than left
// stuck — otherwise a document would sit in 'processing' forever with nothing retrying it.
const STALE_LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export const makeDocumentJobRepository = ({ pool }) => ({
  async enqueue(documentId, { client } = {}) {
    const runner = client ?? pool;
    const { rows } = await runner.query(
      `INSERT INTO document_jobs (document_id) VALUES ($1) RETURNING *`,
      [documentId],
    );
    return rowToJob(rows[0]);
  },

  // Atomically claims the oldest available job — queued, or running-but-stale — and marks it
  // running. FOR UPDATE SKIP LOCKED lets multiple worker instances poll the same table safely
  // without claiming the same row twice or blocking on each other.
  async claimNext() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM document_jobs
         WHERE status = 'queued'
            OR (status = 'running' AND locked_at < now() - interval '${STALE_LOCK_MS} milliseconds')
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      );
      if (rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      const job = rows[0];
      const { rows: updated } = await client.query(
        `UPDATE document_jobs
         SET status = 'running', attempts = attempts + 1, locked_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [job.id],
      );
      await client.query('COMMIT');
      return rowToJob(updated[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async recordProgress(jobId, { pagesDone }) {
    await pool.query(
      `UPDATE document_jobs SET pages_done = $2, updated_at = now() WHERE id = $1`,
      [jobId, pagesDone],
    );
  },

  async markDone(jobId, { pageCount }) {
    const { rows } = await pool.query(
      `UPDATE document_jobs SET status = 'done', page_count = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [jobId, pageCount],
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  },

  // A job that has already been retried MAX_ATTEMPTS times is marked permanently 'failed' instead
  // of going back to 'queued', so a document that can never succeed (e.g. corrupt PDF) doesn't
  // loop forever between workers.
  async markFailed(jobId, { errorMessage, attempts }) {
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
    const { rows } = await pool.query(
      `UPDATE document_jobs
       SET status = $2, error_message = $3, locked_at = NULL, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [jobId, status, errorMessage],
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  },

  async findByDocumentId(documentId) {
    const { rows } = await pool.query('SELECT * FROM document_jobs WHERE document_id = $1', [documentId]);
    return rows[0] ? rowToJob(rows[0]) : null;
  },
});
