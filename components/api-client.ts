'use client';

// Thin client-side wrapper for the { data, error } response envelope
// (Document 5, Section 1). Throws Error(message) on the error branch so
// screens can show the server's exact user-facing message.
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json()) as {
    data: T | null;
    error: { code: string; message: string } | null;
  };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? 'Something went wrong.');
  }
  return body.data as T;
}
