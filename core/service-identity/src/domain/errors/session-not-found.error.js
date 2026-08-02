export class SessionNotFoundError extends Error {
  constructor() {
    super('Session not found or already revoked');
    this.name = 'SessionNotFoundError';
  }
}
