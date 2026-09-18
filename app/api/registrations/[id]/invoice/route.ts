import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';

// Invoice for one Registration (founder request 2026-09-18 — one-to-one
// tuition, "I have to send him an invoice"). Admin and finance; the role check
// lives in the service, as everywhere else. Rendered on demand from the live
// payment row, never stored — the corporate invoice's posture.
//
// GET  …/invoice?dueDate=YYYY-MM-DD   → the PDF, to preview or download
// POST …/invoice { dueDate?, message? } → emails it to the registrant as an
//                                         attachment
const invoiceOptionsSchema = z.object({
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  message: z.string().max(1500).nullable().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dueDate = new URL(request.url).searchParams.get('dueDate');
    const { filename, pdf } = await registrationsService.getInvoicePdf(id, { dueDate });
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = invoiceOptionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request.', 400);
    }
    const result = await registrationsService.sendInvoice(id, parsed.data);
    return successResponse({ registrationId: id, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
