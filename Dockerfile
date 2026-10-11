# Knowsia Course Registration on Railway (2026-10-11).
#
# Vercel paused both Knowsia deployments (402 DEPLOYMENT_DISABLED); this is
# the same Next.js app served from Railway beside knowsia-api, knowsia-lms
# and the study frontend. Deploy with
#   railway up --detach --service registration      (from this folder)
#
# The Vercel crons in vercel.json (/api/cron/reminders 07:00 UTC,
# /api/cron/attendance 21:00 UTC) do not come with the image: they are
# Railway cron services that curl those routes with CRON_SECRET.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are baked in at build time, and a Railway Dockerfile
# build sees a service variable only when it is declared as an ARG here.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_LINKEDIN_ORG_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=$NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_LINKEDIN_ORG_ID=$NEXT_PUBLIC_LINKEDIN_ORG_ID
# next.config.ts reads these to decide the host redirects and the /learn
# rules, so they must be present at BUILD time too.
ARG CANONICAL_HOST
ARG KNOWSIA_APP_PUBLIC_URL
ARG KNOWSIA_APP_FRONTEND_URL
ENV CANONICAL_HOST=$CANONICAL_HOST
ENV KNOWSIA_APP_PUBLIC_URL=$KNOWSIA_APP_PUBLIC_URL
ENV KNOWSIA_APP_FRONTEND_URL=$KNOWSIA_APP_FRONTEND_URL
ENV NEXT_OUTPUT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
