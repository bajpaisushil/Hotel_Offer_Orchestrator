export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, 'UPSTREAM_FAILURE', details);
  }
}

export class OrchestrationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, 'ORCHESTRATION_FAILURE', details);
  }
}
