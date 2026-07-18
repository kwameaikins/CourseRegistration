import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

// Sentry wraps the config only to enable source-map upload and automatic
// instrumentation; with no SENTRY_DSN set (local dev) it is inert.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
