import { z } from 'zod';

import { handleRouteError } from '@/lib/errors';
import * as certificatesService from '@/modules/certificates/service';

// GET /api/certificates/download/[id] — public PDF download; the unguessable
// certificate row UUID is the access token. Regenerated on demand, so the
// participant's link works forever (unless revoked).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return new Response('Not found', { status: 404 });
    }
    const { fileName, bytes } = await certificatesService.getCertificatePdf(id);
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
