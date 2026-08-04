export class AppError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

export function toErrorResponse(err: unknown): { body: { error: string }; status: number } {
  if (err instanceof AppError) {
    return { body: { error: err.message }, status: err.statusCode };
  }
  console.error('Unhandled error:', err);
  return { body: { error: 'Something went wrong' }, status: 500 };
}
