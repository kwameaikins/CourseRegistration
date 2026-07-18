'use client';

import { Button } from '@/components/ui/button';

// Prints the participant list as a clean attendance sheet — navigation
// chrome carries the print-hidden class (Document 8, Section 7).
export function PrintButton() {
  return (
    <Button variant="outline" className="print-hidden" onClick={() => window.print()}>
      🖨 Print attendance sheet
    </Button>
  );
}
