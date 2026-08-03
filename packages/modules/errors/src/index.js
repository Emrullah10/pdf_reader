export class AppError extends Error {
  constructor(message, { status = 500, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message, details) {
    super(message, { status: 404, details });
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 400, details });
  }
}

export class ConflictError extends AppError {
  constructor(message, details) {
    super(message, { status: 409, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message, details) {
    super(message, { status: 401, details });
  }
}

export const handleErrors = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details ?? null } });
    return;
  }
  // An unexpected error is the only kind we cannot explain from the response alone, so it is the
  // one that must reach the logs — otherwise a 500 leaves no trace anywhere to debug from.
  console.error('[handleErrors] Unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error', details: null } });
};
