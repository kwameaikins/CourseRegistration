'use client';

// "Add to LinkedIn Profile" for an issued certificate (founder-approved
// 2026-07-22) — sits next to the existing certificate download link in the
// student portal.
import { buildLinkedInAddToProfileUrl } from '@/lib/linkedin';

export function AddToLinkedInButton(props: {
  certificateName: string;
  issuedDate: string;
  certificateNumber: string;
}) {
  function handleClick() {
    const certUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/verify/${encodeURIComponent(props.certificateNumber)}`
        : '';
    const url = buildLinkedInAddToProfileUrl({
      certificateName: props.certificateName,
      issuedDateIso: props.issuedDate,
      certUrl,
      certificateNumber: props.certificateNumber,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-primary underline-offset-2 hover:underline"
    >
      Add to LinkedIn
    </button>
  );
}
