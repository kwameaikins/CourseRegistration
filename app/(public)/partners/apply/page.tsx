import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { PartnerApplicationForm } from '@/app/(public)/partners/apply/PartnerApplicationForm';

export const dynamic = 'force-dynamic';

// Public application form (Knowsia Growth Partner Programme, doc §5) —
// Ambassador and Institutional Partner categories only; Tutor/Strategic
// partners are always staff-created (see modules/partners/types.ts).
export default function PartnerApplyPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Become a Knowsia Growth Partner</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Earn a commission for every student you refer to a Knowsia course. Tell us a bit about
        yourself and how you plan to promote us — we review every application personally.
      </p>
      <div className="mt-8">
        <PartnerApplicationForm />
      </div>
    </main>
  );
}
