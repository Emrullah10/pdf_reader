import pg from 'pg';

const { Pool } = pg;

export const makeTestPool = () =>
  new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader' });

export const truncateAll = async (pool) => {
  await pool.query('TRUNCATE page_words, document_pages, documents, sessions, users RESTART IDENTITY CASCADE');
};

export const seedUser = async (pool, { email = `doc-test-${Date.now()}@test.com`, name = 'Doc Test User' } = {}) => {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, locale) VALUES ($1, 'hash', $2, 'tr') RETURNING id`,
    [email, name],
  );
  return rows[0].id;
};
