import { handleRouteError } from '@/lib/errors';
import * as corporateService from '@/modules/corporate/service';
import { generateCorporateInvoicePdf } from '@/lib/corporate/invoice-pdf';

// GET /api/corporate/allocations/[id]/invoice — staff-facing, generated on
// demand from the allocation's live data (no stored invoice record).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const allocation = await corporateService.getAllocationById(id);
    const company = await corporateService.getCompanyById(allocation.companyId);

    const bytes = await generateCorporateInvoicePdf({
      companyName: allocation.companyName,
      billingContactName: company.billingContactName,
      billingEmail: company.billingEmail,
      billingAddress: company.billingAddress,
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
