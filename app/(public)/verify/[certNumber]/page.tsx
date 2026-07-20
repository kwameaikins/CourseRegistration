// Public certificate verification (founder-approved 2026-07-19). Reached via
// the QR code / link printed on every certificate. Server-rendered; shows
// only what the certificate itself already displays.
import * as certificatesService from '@/modules/certificates/service';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ certNumber: string }>;
}) {
  const { certNumber } = await params;
  const result = await certificatesService.verifyCertificate(
    decodeURIComponent(certNumber),
  );

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border-4 border-[#4B21A8] p-8 text-center">
        <p className="text-2xl font-bold">
          knowsia<span className="text-[#F49E20]">.</span>
        </p>
        <h1 className="mt-2 text-lg font-semibold uppercase tracking-wide">
          Certificate Verification
        </h1>

        {result.status === 'valid' && (
          <div className="mt-6 space-y-3">
            <p className="text-3xl">✅</p>
            <p className="text-sm text-muted-foreground">This certificate is authentic.</p>
            <p className="text-xl font-bold text-[#F49E20]">{result.recipientName}</p>
            <p className="text-sm">successfully completed</p>
            <p className="text-lg font-semibold text-[#4B21A8]">{result.courseTitle}</p>
            <p className="text-sm text-muted-foreground">
              Certificate {result.certificateNumber} · Issued{' '}
              {new Date(`${result.issuedDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </p>
          </div>
        )}

        {result.status === 'revoked' && (
          <div className="mt-6 space-y-3">
            <p className="text-3xl">⚠️</p>
            <p className="text-sm">
              Certificate {result.certificateNumber} has been <strong>revoked</strong> and is
            no longer valid.
            </p>
          </div>
        )}

        {result.status === 'not_found' && (
          <div className="mt-6 space-y-3">
            <p className="text-3xl">❌</p>
            <p className="text-sm">
              No certificate with this number was found. Check the number and try again, or
              contact Knowsia.
            </p>
          </div>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Knowsia — practical professional training ·{' '}
        <a href="/register" className="font-medium text-[#4B21A8] underline">
          View our courses → reg.knowsia.com/register
        </a>
      </p>
    </main>
  );
}
