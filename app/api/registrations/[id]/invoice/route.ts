import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as registrationsService from '@/modules/registrations/service';
import { invoiceBillToSchema, invoiceOptionsSchema } from '@/modules/registrations/types';

// Invoice for one Registration (founder request 2026-09-18 — one-to-one
// tuition, "I have to send him an invoice"). Admin and finance; the role check
// lives in the service, as everywhere else. Rendered on demand from the live
// payment row, never stored — the corporate invoice's posture.
//
// GET   …/invoice?dueDate=YYYY-MM-DD        → the PDF, to preview or download
// PATCH …/invoice { billTo | null }         → save who it is addressed to
//                                             (an employer wanting it in the
//                                             company name), without sending
// POST  …/invoice { dueDate?, message?, billTo? } → email it as an attachment
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = invoiceBillToSchema.nullable().safeParse((await readJson(request) as { billTo?: unknown })?.billTo ?? null);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid bill-to.', 400);
    }
    const billTo = await registrationsService.setInvoiceBillTo(id, parsed.data);
    return successResponse({ registrationId: id, billTo });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = invoiceOptionsSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request.', 400);
    }
    const result = await registrationsService.sendInvoice(id, parsed.data);
    return successResponse({ registrationId: id, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
