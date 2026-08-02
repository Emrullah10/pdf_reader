const rowToSession = (row) => ({
  id: row.id,
  userId: row.user_id,
  refreshTokenHash: row.refresh_token_hash,
  userAgent: row.user_agent,
  ip: row.ip,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
});

export const makeSessionRepository = ({ pool }) => ({
  async create({ userId, refreshTokenHash, userAgent, ip, expiresAt }) {
    const { rows } = await pool.query(
      `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, refreshTokenHash, userAgent ?? null, ip ?? null, expiresAt],
    );
    return rowToSession(rows[0]);
  },

  async findByRefreshTokenHash(hash) {
    const { rows } = await pool.query('SELECT * FROM sessions WHERE refresh_token_hash = $1', [hash]);
    return rows[0] ? rowToSession(rows[0]) : null;
  },

  async revoke(sessionId) {
    await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId]);
  },
});
