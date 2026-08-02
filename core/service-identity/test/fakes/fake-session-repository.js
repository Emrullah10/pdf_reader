export const makeFakeSessionRepository = (initialSessions = []) => {
  const sessions = [...initialSessions];
  let nextId = sessions.length + 1;

  return {
    async create({ userId, refreshTokenHash, userAgent, ip, expiresAt }) {
      const session = {
        id: `session-${nextId++}`,
        userId,
        refreshTokenHash,
        userAgent,
        ip,
        expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      sessions.push(session);
      return session;
    },
    async findByRefreshTokenHash(hash) {
      return sessions.find((s) => s.refreshTokenHash === hash) ?? null;
    },
    async revoke(sessionId) {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) session.revokedAt = new Date();
    },
    _all: sessions,
  };
};
