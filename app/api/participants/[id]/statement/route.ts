import { z } from 'zod';

import { handleRouteError } from '@/lib/errors';
import { generateStatementPdf } from '@/lib/portal/statement-pdf';
import * as registrationsService from '@/modules/registrations/service';

// GET /api/participants/[id]/statement — staff (admin + finance) download of
// one participant's account statement. Role check lives in the service
// (getParticipantStatementForStaff); same rendered-on-demand posture as the
// portal's own /api/portal/statement.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }

    const data = await registrationsService.getParticipantStatementForStaff(id);
    const bytes = await generateStatementPdf({
      ...data,
      issuedDate: new Date().toISOString().slice(0, 10),
    });

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="statement-${id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
