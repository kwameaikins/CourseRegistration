// My Courses (Tutor) — Document 8, Section 7. RLS is the security boundary:
// the session client only returns Confirmed registrations in this Tutor's
// own batches (BR-11). Name, email, phone only — payment columns are not
// present in this component at all.
import * as usersService from '@/modules/users/service';
import * as registrationsService from '@/modules/registrations/service';
import { PrintButton } from '@/app/(staff)/my-courses/PrintButton';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function MyCoursesPage() {
  // Fast-fail role check — a clarity optimisation; RLS remains the boundary.
  await usersService.requireRole(['tutor']);

  const { registrations } = await registrationsService.listRegistrations({
    page: 1,
    limit: 200,
  });

  const byBatch = new Map<
    string,
    { courseName: string; cohortLabel: string; participants: typeof registrations }
  >();
  for (const registration of registrations) {
    const key = registration.batchId;
    if (!byBatch.has(key)) {
      byBatch.set(key, {
        courseName: registration.courseName,
        cohortLabel: registration.cohortLabel,
        participants: [],
      });
    }
    byBatch.get(key)!.participants.push(registration);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Courses</h1>
        <PrintButton />
      </div>

      {byBatch.size === 0 && (
        <p className="text-muted-foreground">
          No confirmed participants yet for your upcoming batches.
        </p>
      )}

      {[...byBatch.entries()].map(([batchId, batch]) => (
        <section key={batchId}>
          <h2 className="mb-3 text-lg font-medium">
            {batch.courseName} — {batch.cohortLabel}
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 font-medium">Confirmed on</th>
              </tr>
            </thead>
            <tbody>
              {batch.participants.map((participant, index) => (
                <tr key={participant.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{index + 1}</td>
                  <td className="py-2 pr-4 font-medium">{participant.fullName}</td>
                  <td className="py-2 pr-4">{participant.email}</td>
                  <td className="py-2 pr-4">{participant.phone}</td>
                  <td className="py-2">{formatDate(participant.registeredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
