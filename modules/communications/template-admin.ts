// Admin messaging editor (founder-approved 2026-07-19): read and upsert the
// per-Course email templates that every engine send renders from. Role
// enforcement lives in the API route (admin only); RLS on email_templates is
// the real security boundary.
import { parseEmailType } from '@/lib/domain/parsers';
import * as communicationsRepository from '@/modules/communications/repository';
import type {
  EmailTemplateView,
  TemplateUpsertInput,
} from '@/modules/communications/types';
import type { Database } from '@/lib/supabase/database.types';

function toView(
  row: Database['public']['Tables']['email_templates']['Row'],
): EmailTemplateView {
  return {
    id: row.id,
    courseId: row.course_id,
    emailType: parseEmailType(row.email_type),
    subject: row.subject,
    body: row.body,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

export async function getTemplatesForCourse(
  courseId: string,
): Promise<EmailTemplateView[]> {
  const rows = await communicationsRepository.selectTemplatesForCourse(courseId);
  return rows.map(toView);
}

export async function saveTemplate(input: TemplateUpsertInput): Promise<EmailTemplateView> {
  const row = await communicationsRepository.upsertTemplate({
    course_id: input.courseId,
    email_type: input.emailType,
    subject: input.subject,
    body: input.body,
    is_active: input.isActive,
  });
  return toView(row);
}
