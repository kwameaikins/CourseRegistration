// Types for config/host-redirects.mjs (plain ESM so next.config.ts can import it).

export interface HostRedirect {
  source: string;
  has: { type: 'host'; value: string }[];
  destination: string;
  permanent: boolean;
}

export interface LegacyRedirectEntry {
  source: string;
  destination: string;
  rule?: string;
}

export function sanitizeHost(value: unknown): string | null;

export function buildHostRedirects(opts: {
  canonicalHost: string | null;
  extraLegacyHosts?: string[];
}): HostRedirect[];

export function toNextRedirects(
  entries: unknown[],
): { source: string; destination: string; permanent: true }[];
