import pg from 'pg';

const { Pool } = pg;

export const makeTestPool = () =>
  new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://pdf_reader:pdf_reader@localhost:5435/pdf_reader' });

export const truncateAll = async (pool) => {
  await pool.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
};
