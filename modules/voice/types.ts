export type VoiceCallType =
  | 'payment_followup'
  | 'bank_transfer_chase'
  | 'no_show_recovery'
  | 'feedback_voice'
  | 'upsell'
  | 'inbound';

export interface VoiceDispatchSummary {
  date: string;
  callsScheduled: number;
  skippedDuplicates: number;
  skippedBadPhone: number;
  errors: string[];
}

export interface CallLogView {
  id: string;
  registrationId: string | null;
  participantName: string | null;
  callType: VoiceCallType;
  phone: string;
  status: string;
  summary: string | null;
  transcript: string | null;
  needsHumanFollowup: boolean;
  promisedPaymentDate: string | null;
  bankReference: string | null;
  createdAt: string;
  endedAt: string | null;
}
