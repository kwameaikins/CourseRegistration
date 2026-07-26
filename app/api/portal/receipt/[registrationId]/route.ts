import { cookies } from 'next/headers';
import { z } from 'zod';

import { handleRouteError } from '@/lib/errors';
import { generateReceiptPdf } from '@/lib/portal/receipt-pdf';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/receipt/[registrationId] — session-gated PDF download,
// same shape as /api/certificates/download/[id]. Rendered on demand, never
// stored (lib/portal/receipt-pdf.ts).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ registrationId: string }> },
) {
  try {
    const { registrationId } = await params;
    if (!z.uuid().safeParse(registrationId).success) {
      return new Response('Not found', { status: 404 });
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const data = await portalService.getReceiptData(sessionId, registrationId);
    const bytes = await generateReceiptPdf({
      ...data,
      issuedDate: new Date().toISOString().slice(0, 10),
    });

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
