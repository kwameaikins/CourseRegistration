import { cookies } from 'next/headers';

import { handleRouteError } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { COMPANY_PORTAL_SESSION_COOKIE } from '@/modules/corporate/types';
import { generateCorporateInvoicePdf } from '@/lib/corporate/invoice-pdf';

// GET /api/company-portal/allocations/[id]/invoice — the company's own
// self-service invoice download, scoped to its own session.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(COMPANY_PORTAL_SESSION_COOKIE)?.value;

    const [allocation, dashboard] = await Promise.all([
      corporateService.getOwnAllocationDetail(sessionId, id),
      corporateService.getCompanyPortalDashboard(sessionId),
    ]);

    const bytes = await generateCorporateInvoicePdf({
      companyName: allocation.companyName,
      billingContactName: dashboard.billingContactName,
      billingEmail: dashboard.billingEmail,
      billingAddress: null,
      courseName: allocation.courseName,
      cohortLabel: allocation.batchCohortLabel,
      batchStartDate: allocation.batchStartDate,
      seatsPurchased: allocation.seatsPurchased,
      pricePerSeat: allocation.pricePerSeat,
      allocationId: allocation.id,
      issuedDate: new Date().toISOString().slice(0, 10),
    });

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${allocation.id.slice(0, 8)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
