const rowToUser = (row) => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  name: row.name,
  locale: row.locale,
  createdAt: row.created_at,
});

export const makeUserRepository = ({ pool }) => ({
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async create({ email, passwordHash, name, locale }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, locale)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, passwordHash, name, locale],
    );
    return rowToUser(rows[0]);
  },
});
