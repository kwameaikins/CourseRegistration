import { z } from 'zod';

export const CERT_PREFIX = 'KNS';

export const manualIssueSchema = z.object({
  recipientName: z.string().trim().min(2).max(200),
  courseCode: z.string().trim().min(2).max(10),
  courseTitle: z.string().trim().min(2).max(200),
  description: z.string().trim().max(600).default(''),
  hours: z.number().int().min(0).max(1000),
  cpdCredit: z.string().trim().max(50).default('TBD'),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipientEmail: z.string().email().optional(),
  // For backfilling the legacy registry — must match the KNS/KNW shape.
  customNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}-[A-Z0-9]{2,10}-\d{4}-\d{4}$/)
    .optional(),
  sendEmail: z.boolean().default(false),
});

export type ManualIssueInput = z.infer<typeof manualIssueSchema>;

export const batchIssueSchema = z.object({
  batchId: z.uuid(),
  registrationIds: z.array(z.uuid()).min(1).max(500),
  hours: z.number().int().min(0).max(1000),
  description: z.string().trim().max(600).default(''),
  cpdCredit: z.string().trim().max(50).default('TBD'),
  sendEmail: z.boolean().default(true),
});

export type BatchIssueInput = z.infer<typeof batchIssueSchema>;

export interface CertificateView {
  id: string;
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  hours: number;
  cpdCredit: string;
  issuedDate: string;
  revoked: boolean;
  revokedReason: string | null;
  registrationId: string | null;
  recipientEmail: string | null;
  createdAt: string;
}

export interface BatchIssueCandidate {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  paid: boolean;
  feedbackSubmitted: boolean;
  attendancePercent: number | null;
  alreadyIssued: boolean;
  eligible: boolean;
}

export interface VerificationResult {
  status: 'valid' | 'revoked' | 'not_found';
  recipientName?: string;
  courseTitle?: string;
  issuedDate?: string;
  certificateNumber?: string;
}

export interface BatchIssueResult {
  issued: number;
  skipped: number;
  emailed: number;
  errors: string[];
}
