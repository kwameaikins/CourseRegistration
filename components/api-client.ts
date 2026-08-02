'use client';

// Thin client-side wrapper for the { data, error } response envelope
// (Document 5, Section 1). Throws Error(message) on the error branch so
// screens can show the server's exact user-facing message. The server's
// error `code` is attached to the thrown Error so a screen can branch on a
// specific failure (e.g. DUPLICATE_REGISTRATION) without string-matching
// the message.
export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // A FormData body (e.g. a file upload) must let the browser set its own
  // multipart/form-data boundary header — forcing application/json here
  // would break the server's request.formData() parsing.
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as {
    data: T | null;
    error: { code: string; message: string } | null;
  };
  if (!response.ok || body.error) {
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN_ERROR',
      body.error?.message ?? 'Something went wrong.',
    );
  }
  return body.data as T;
}
