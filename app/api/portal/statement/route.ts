import { cookies } from 'next/headers';

import { handleRouteError } from '@/lib/errors';
import { generateStatementPdf } from '@/lib/portal/statement-pdf';
import * as portalService from '@/modules/portal/service';
import { PORTAL_SESSION_COOKIE } from '@/modules/portal/types';

// GET /api/portal/statement — session-gated account-statement PDF download,
// same shape as /api/portal/receipt/[registrationId]. Rendered on demand,
// never stored (lib/portal/statement-pdf.ts).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const data = await portalService.getStatementData(sessionId);
    const bytes = await generateStatementPdf({
      ...data,
      issuedDate: new Date().toISOString().slice(0, 10),
    });

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="statement-${data.participantId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
