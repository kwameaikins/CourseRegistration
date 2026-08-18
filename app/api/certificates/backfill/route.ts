import { z } from 'zod';

import { handleRouteError, successResponse } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// POST /api/certificates/backfill — issues certificates for courses that
// finished before completion issuance existed (2026-08-18). Admin only; the
// service layer's requireRole is the boundary, since these writes run on the
// service-role client and are not backstopped by RLS.
//
// DRY RUN BY DEFAULT: `{}` reports what a real run would issue and writes
// nothing. Pass `{"dryRun": false}` to actually write, optionally with
// `{"batchId": "<uuid>"}` to do one cohort at a time — which is the sane way
// to start, since the unscoped form issues the entire historical backlog in
// one pass.
//
// Emails nobody. The certificate simply becomes downloadable in the student
// portal, matching the daily completion run (BR-46).
const bodySchema = z.object({
  dryRun: z.boolean().optional(),
  batchId: z.uuid().optional(),
});

export async function POST(request: Request) {
  try {
    // An absent or unparseable body is a dry run, not an error — the least
    // destructive reading of an ambiguous request.
    const raw = await request.json().catch(() => ({}));
    const input = bodySchema.parse(raw);
    const summary = await certificatesService.runCertificateBackfill(input);
    return successResponse(summary);
  } catch (err) {
    return handleRouteError(err);
  }
}
