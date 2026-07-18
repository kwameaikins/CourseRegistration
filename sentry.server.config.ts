import * as Sentry from '@sentry/nextjs';

import { scrubPiiBeforeSend } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  beforeSend: scrubPiiBeforeSend,
});
