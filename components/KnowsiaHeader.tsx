import Image from 'next/image';

// Real brand lockup for public-facing pages (register, feedback, verify).
// The staff app keeps a plain-text sidebar wordmark; this is for pages
// external people see.
export function KnowsiaHeader() {
  return (
    <Image
      src="/knowsia-logo.png"
      alt="Knowsia"
      width={185}
      height={68}
      priority
      className="h-10 w-auto"
    />
  );
}
