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

// Participant-scoped message history (student portal, 2026-07-26) — ungated
// helper, same posture as paymentsService.applyPaymentUpdate: the caller
// (modules/portal/service.ts) has already verified the registration ids
// belong to the requesting participant before calling this.
export async function getMessageLogForRegistrations(registrationIds: string[]) {
  return communicationsRepository.selectMessageLogForRegistrationIds(registrationIds);
}
