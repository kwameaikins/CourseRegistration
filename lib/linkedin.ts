// LinkedIn "Add to Profile" certification URL builder (founder-approved
// 2026-07-22). NEXT_PUBLIC_LINKEDIN_ORG_ID is optional — when unset (no
// LinkedIn Company Page id looked up yet), the button still works, it just
// won't auto-link Knowsia's company page. See
// https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/add-to-profile
// for the query-param scheme.
export function buildLinkedInAddToProfileUrl(input: {
  certificateName: string;
  issuedDateIso: string; // YYYY-MM-DD
  certUrl: string;
  certificateNumber: string;
}): string {
  const [year, month] = input.issuedDateIso.split('-');
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: input.certificateName,
    issueYear: year,
    issueMonth: String(Number(month)),
    certUrl: input.certUrl,
    certId: input.certificateNumber,
  });
  const orgId = process.env.NEXT_PUBLIC_LINKEDIN_ORG_ID;
  if (orgId) params.set('organizationId', orgId);
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
