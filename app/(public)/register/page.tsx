import * as coursesService from '@/modules/courses/service';
import { RegistrationForm } from '@/app/(public)/register/RegistrationForm';

export const dynamic = 'force-dynamic';

// F1.01 — Public Registration Form. The Batch dropdown lists only Active,
// future batches (BR-19), resolved server-side.
export default async function RegisterPage() {
  const batchOptions = await coursesService.getActiveBatchesForPublicForm();

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold">Course Registration</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Register for an upcoming course intake. Payment instructions will be emailed to
        you after registration.
      </p>
      <div className="mt-8">
        <RegistrationForm batchOptions={batchOptions} />
      </div>
    </main>
  );
}
