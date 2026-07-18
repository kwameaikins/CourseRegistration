// Application error type matching the Error Response Standard
// (Document 5, Section 12). Every API route maps AppError to
// { data: null, error: { code, message } } with the given HTTP status.
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status });
}

export function errorResponse(error: ApiErrorBody, status: number): Response {
  return Response.json({ data: null, error }, { status });
}

// Single catch pattern applied consistently across every API route
// (Document 11, Section 6). Unhandled errors go to Sentry (Document 7,
// Section 5.2); AppErrors are expected business outcomes and do not.
export function handleRouteError(err: unknown): Response {
  if (err instanceof AppError) {
    return errorResponse({ code: err.code, message: err.message }, err.httpStatus);
  }
  console.error('[INTERNAL_ERROR]', err);
  captureToSentry(err);
  return errorResponse(
    { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
    500,
  );
}

export function captureToSentry(err: unknown, tags?: Record<string, string>): void {
  // Dynamic import keeps Sentry out of any client bundle that only needs
  // AppError, and degrades silently when SENTRY_DSN is unset in local dev.
  import('@sentry/nextjs')
    .then((Sentry) => Sentry.captureException(err, tags ? { tags } : undefined))
    .catch(() => undefined);
}
