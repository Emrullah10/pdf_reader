import pg from 'pg';

const { Pool } = pg;

export const makePool = ({ connectionString }) => new Pool({ connectionString });

// Runs `run` against a single client wrapped in a transaction, committing on success and rolling
// back on any error. Callers get a client with the pool's normal `.query` interface.
export const withTransaction = async (pool, run) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
