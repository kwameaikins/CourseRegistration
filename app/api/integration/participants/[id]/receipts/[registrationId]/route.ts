import { z } from 'zod';

import { handleRouteError } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import { generateReceiptPdf } from '@/lib/portal/receipt-pdf';
import * as portalService from '@/modules/portal/service';

// GET /api/integration/participants/[id]/receipts/[registrationId] — the
// portal's receipt PDF for KnowsiaApp to hand its signed-in student
// (2026-10-15). 404 for a registration that is not this participant's.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; registrationId: string }> },
) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id, registrationId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }
    const data = await portalService.getReceiptDataForParticipant(id, registrationId);
    const bytes = await generateReceiptPdf({ ...data, issuedDate: new Date().toISOString().slice(0, 10) });
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${registrationId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
