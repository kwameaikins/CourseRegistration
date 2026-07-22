// Admin sent-message review screen (system review, 2026-07-22): a merged,
// reverse-chronological feed across email_log/whatsapp_log/sms_log. Role
// enforcement lives in the API route (admin only), matching the templates
// editor's convention.
import * as communicationsRepository from '@/modules/communications/repository';
import type { MessageLogFilters, MessageLogRow } from '@/modules/communications/types';

export async function getMessageLog(filters: MessageLogFilters): Promise<{
  rows: MessageLogRow[];
  pagination: { page: number; limit: number; total: number };
}> {
  const { rows, total } = await communicationsRepository.selectMessageLog(filters);
  return { rows, pagination: { page: filters.page, limit: filters.limit, total } };
}
