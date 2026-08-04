import Link from 'next/link';

import * as coursesService from '@/modules/courses/service';
import { RegistrationForm } from '@/app/(public)/register/RegistrationForm';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export const dynamic = 'force-dynamic';

// F1.01 — Public Registration Form. The Batch dropdown lists only Active,
// future batches (BR-19), resolved server-side.
export default async function RegisterPage() {
  const batchOptions = await coursesService.getActiveBatchesForPublicForm();

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Course Registration</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Register for an upcoming course intake or free webinar. Where there is a fee,
        payment instructions are emailed to you after registration.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Not sure which to choose?{' '}
        <Link href="/programmes" className="underline">
          Browse our programmes
        </Link>{' '}
        for full details.
      </p>
      <div className="mt-8">
        <RegistrationForm batchOptions={batchOptions} />
      </div>
    </main>
  );
}
