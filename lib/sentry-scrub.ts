import type { ErrorEvent as SentryErrorEvent } from '@sentry/nextjs';

// Ghana DPA data minimisation (Document 7, Section 5.3): participant PII is
// scrubbed from every event before it leaves the application.
const SCRUBBED_FIELDS = ['email', 'phone', 'fullName', 'full_name'] as const;

export function scrubPiiBeforeSend(event: SentryErrorEvent): SentryErrorEvent {
  const requestData = event.request?.data;
  if (requestData && typeof requestData === 'object') {
    for (const field of SCRUBBED_FIELDS) {
      if (field in (requestData as Record<string, unknown>)) {
        (requestData as Record<string, unknown>)[field] = '[SCRUBBED]';
      }
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }
  return event;
}
