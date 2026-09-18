// Knowsia Core, as this app sees it (Coding Docs/22 §3, Phase 2 — identity).
//
// Two directions. INBOUND (through /api/integration/identities/*, service
// key): knowsia-api's linker exports every participant and staff account and
// writes the identity id back. OUTBOUND (`shadowLoginCheck`): after the
// portal has decided a PIN sign-in with its own table, it tells Core the
// verdict and Core records what IT would have said. Fire-and-forget, gated
// by CORE_DUAL_READ here as well as there, and incapable of refusing
// anyone — the student already has their answer before this is called.
import { z } from 'zod';

import { captureToSentry } from '@/lib/errors';
import * as repository from '@/modules/knowsia-core/repository';

export const identityLinkSchema = z.object({
  participants: z.array(z.object({ id: z.string().uuid(), coreIdentityId: z.string().uuid() })).default([]),
  staff: z.array(z.object({ id: z.string().uuid(), coreIdentityId: z.string().uuid() })).default([]),
});
export type IdentityLinkInput = z.infer<typeof identityLinkSchema>;

export async function exportPeopleForIdentityLink() {
  return repository.selectPeopleForIdentityExportSystem();
}

export async function applyIdentityLinks(input: IdentityLinkInput) {
  return repository.updateCoreIdentityLinksSystem(input.participants, input.staff);
}

// ── The dual-read, from this side ────────────────────────────────────────────

export function isDualReadOn(): boolean {
  return (
    process.env.CORE_DUAL_READ === 'true' &&
    Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY)
  );
}

export type ShadowVerdict = 'ok' | 'invalid' | 'locked';

// Never awaited by a sign-in path and never throws: the portal's own table
// has already answered the student. A failure here is a gap in the
// measurement, reported to Sentry, not a refusal.
export function shadowLoginCheck(input: {
  participantId: string | null;
  email: string | null;
  verdict: ShadowVerdict;
}): void {
  if (!isDualReadOn()) return;
  const base = process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
  void fetch(`${base}/api/v1/service/identity/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY!,
    },
    body: JSON.stringify({
      path: 'pin',
      product: 'registration',
      external_id: input.participantId,
      email: input.email,
      app_verdict: input.verdict,
      app_role: 'student',   // a portal PIN only ever signs a participant in
    }),
    signal: AbortSignal.timeout(3000),
  })
    .then((response) => {
      if (!response.ok) {
        captureToSentry(new Error(`core identity check answered ${response.status}`), {
          job: 'core_dual_read',
        });
      }
    })
    .catch((err) => captureToSentry(err, { job: 'core_dual_read' }));
}
