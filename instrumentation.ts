// Next.js instrumentation hook — loads the Sentry server/edge configuration
// (Document 7, Section 5). PII scrubbing is applied in both runtimes.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
