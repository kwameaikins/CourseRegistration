import { z } from 'zod';

import { handleRouteError } from '@/lib/errors';
import { rejectUnlessKnowsiaApp } from '@/lib/integration/service-key';
import { generateStatementPdf } from '@/lib/portal/statement-pdf';
import * as portalService from '@/modules/portal/service';

// GET /api/integration/participants/[id]/statement — the portal's account
// statement PDF for KnowsiaApp's signed-in student (2026-10-15).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectUnlessKnowsiaApp(request);
  if (rejected) return rejected;
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const data = await portalService.getStatementDataForParticipantSystem(id);
    const bytes = await generateStatementPdf({ ...data, issuedDate: new Date().toISOString().slice(0, 10) });
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
