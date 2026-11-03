import { defineRailway, preserve, project, service } from "railway/iac";

// Migrated from railway.json (2026-11-03, CLI 5.71.0). Named partial: the
// knowsia-api project is managed from five repositories (the study app's
// four services and this one); the partial boundary keeps this file from
// claiming the study app's variables.
// The CLI's `config migrate` generated this file against a stale link and
// named the service after the repository folder; the corrected names are the
// real ones — service `registration` in project `knowsia-api`.
// Variables are deliberately NOT declared here — they stay Railway-managed.
export const partial = "registration";

export default defineRailway(() => {
  const web = service("registration", {
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    restart: {
      policy: "ON_FAILURE",
      maxRetries: 3,
    },
    env: {
      // Every Railway-set variable, claimed by name with preserve(): the
      // values stay Railway-managed, the file records ownership. A new one
      // must be appended here in the same release that sets it.
      ANTHROPIC_API_KEY: preserve(),
      ARKESEL_API_KEY: preserve(),
      ARKESEL_SENDER_ID: preserve(),
      CANONICAL_HOST: preserve(),
      CATALOG_API_KEY: preserve(),
      CERTIFICATE_ISSUER: preserve(),
      CORE_CHECKOUT: preserve(),
      CORE_DUAL_READ: preserve(),
      CRON_SECRET: preserve(),
      KNOWSIA_APP_API_URL: preserve(),
      KNOWSIA_APP_FRONTEND_URL: preserve(),
      KNOWSIA_APP_PUBLIC_URL: preserve(),
      KNOWSIA_APP_SERVICE_KEY: preserve(),
      KNOWSIA_APP_URL: preserve(),
      KNOWSIA_LMS_API_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_LINKEDIN_ORG_ID: preserve(),
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_URL: preserve(),
      NEXT_TELEMETRY_DISABLED: preserve(),
      PAYSTACK_SECRET_KEY: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM_EMAIL: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      ZOOM_ACCOUNT_ID: preserve(),
      ZOOM_CLIENT_ID: preserve(),
      ZOOM_CLIENT_SECRET: preserve(),
      ZOOM_HOST_EMAIL: preserve(),
    },
    env: {
      // Every Railway-set variable, claimed by name with preserve(): the
      // values stay Railway-managed, the file records ownership. A new one
      // must be appended here in the same release that sets it.
      ANTHROPIC_API_KEY: preserve(),
      ARKESEL_API_KEY: preserve(),
      ARKESEL_SENDER_ID: preserve(),
      CANONICAL_HOST: preserve(),
      CATALOG_API_KEY: preserve(),
      CERTIFICATE_ISSUER: preserve(),
      CORE_CHECKOUT: preserve(),
      CORE_DUAL_READ: preserve(),
      CRON_SECRET: preserve(),
      KNOWSIA_APP_API_URL: preserve(),
      KNOWSIA_APP_FRONTEND_URL: preserve(),
      KNOWSIA_APP_PUBLIC_URL: preserve(),
      KNOWSIA_APP_SERVICE_KEY: preserve(),
      KNOWSIA_APP_URL: preserve(),
      KNOWSIA_LMS_API_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_LINKEDIN_ORG_ID: preserve(),
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: preserve(),
      NEXT_PUBLIC_SUPABASE_URL: preserve(),
      NEXT_TELEMETRY_DISABLED: preserve(),
      PAYSTACK_SECRET_KEY: preserve(),
      RESEND_API_KEY: preserve(),
      RESEND_FROM_EMAIL: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      ZOOM_ACCOUNT_ID: preserve(),
      ZOOM_CLIENT_ID: preserve(),
      ZOOM_CLIENT_SECRET: preserve(),
      ZOOM_HOST_EMAIL: preserve(),
    },
  });

  return project("knowsia-api", {
    resources: [web],
  });
});
