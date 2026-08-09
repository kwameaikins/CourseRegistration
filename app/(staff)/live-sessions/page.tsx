import * as coursesService from '@/modules/courses/service';
import * as liveSessionsService from '@/modules/live-sessions/service';
import * as usersService from '@/modules/users/service';

import { LiveSessionsWorkspace } from './LiveSessionsWorkspace';

export const dynamic = 'force-dynamic';

export default async function LiveSessionsPage() {
  const staffUser = await usersService.requireRole(['admin', 'management']);
  const [liveSessions, batches, courses] = await Promise.all([
    liveSessionsService.getLiveSessions(),
    coursesService.getBatches(),
    coursesService.getCourses(),
  ]);

  // Batches used to be offered as "AUG-2026 (6 August 2026)" with no course
  // anywhere in the label (founder-reported 2026-08-08: "the admin interface
  // has no ability to add resources"). It does — but with two ESG cohorts
  // both labelled AUG-2026 there was no way to tell which entry was which,
  // so the Learning resources card was effectively unusable.
  const courseById = new Map(courses.map((course) => [course.id, course]));

  return (
    <LiveSessionsWorkspace
      initialLiveSessions={liveSessions}
      batches={batches.map((batch) => {
        const course = courseById.get(batch.courseId);
        return {
          id: batch.id,
          cohortLabel: batch.cohortLabel,
          startDate: batch.startDate,
          courseCode: course?.courseCode ?? '',
          // Falls back to the code, then to a marker — never to an empty
          // string, which would silently recreate the ambiguity above.
          courseName: course?.courseName ?? course?.courseCode ?? 'Unknown course',
        };
      })}
      canManage={staffUser.role === 'admin'}
    />
  );
}