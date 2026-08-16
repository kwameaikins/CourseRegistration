// Resolves a course's public copy: the staff-edited row in course_content
// first, then the hard-coded map in public-content.ts as fallback.
//
// Deliberately its own module rather than a function on service.ts. The public
// catalogue needs this on every programme-page render, and service.ts pulls in
// waitlist, live-sessions, communications, users and the Zoom client — none of
// which a public marketing page should have to load or a test of it have to
// mock. This file imports the repository, the schema and the fallback map, and
// nothing else.
import * as coursesRepository from '@/modules/courses/repository';
import type { CoursePublicContent } from '@/modules/courses/public-content';
import { courseContentBodySchema } from '@/modules/courses/types';

export interface ResolvedCourseContent {
  body: CoursePublicContent;
  displayOrder: number | null;
  source: 'database' | 'code';
}

// Keyed by course id, which is what course_content stores and what the
// catalogue read already has to hand. One query for the whole catalogue —
// per-course resolution would turn one page render into N round trips.
export async function getResolvedCourseContentByCourseIdSystem(): Promise<
  Map<string, ResolvedCourseContent>
> {
  let rows: Awaited<ReturnType<typeof coursesRepository.selectAllCourseContentSystem>>;
  try {
    rows = await coursesRepository.selectAllCourseContentSystem();
  } catch (err) {
    // The copy layer must never take the catalogue down — same rule the
    // programmes page already applies to testimonials. This also makes the
    // deploy order forgiving: if the code ships before migration
    // 202608160062 is applied, every course simply renders from the code map
    // instead of the catalogue 500ing on a missing table.
    console.error('[course content resolve]', err);
    return new Map();
  }

  const resolved = new Map<string, ResolvedCourseContent>();
  for (const row of rows) {
    const parsed = courseContentBodySchema.safeParse(row.body);
    // A row that fails validation is skipped rather than thrown on: the public
    // catalogue must not 500 because one course's saved copy predates a shape
    // change. It falls back to the code map, exactly like an absent row.
    if (!parsed.success) continue;
    resolved.set(row.course_id, {
      body: parsed.data,
      displayOrder: row.display_order,
      source: 'database',
    });
  }
  return resolved;
}
