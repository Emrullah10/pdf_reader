import pg from 'pg';

const { Pool } = pg;

export const makePool = ({ connectionString }) => new Pool({ connectionString });
