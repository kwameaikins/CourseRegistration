import { z } from 'zod';

// Tutors are external parties, not Knowsia staff (founder-approved
// 2026-07-27) — see the tutors table migration header and
// Coding Docs/16_Tutor_Operations.md.
export interface Tutor {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export const createTutorInputSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
});
export type CreateTutorInput = z.infer<typeof createTutorInputSchema>;

export const updateTutorInputSchema = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  email: z.email().transform((value) => value.toLowerCase()).optional(),
  phone: z.string().trim().min(10).optional(),
});
export type UpdateTutorInput = z.infer<typeof updateTutorInputSchema>;

// Tutor portal auth (mirrors modules/corporate/types.ts's company portal
// shapes exactly, scoped to a tutor instead).
export const TUTOR_PORTAL_SESSION_COOKIE = 'tutor_portal_session';

export const tutorPortalLoginSchema = z.object({
  email: z.string().trim().min(3).max(200),
  pin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type TutorPortalLoginInput = z.infer<typeof tutorPortalLoginSchema>;

export const tutorPortalChangePinSchema = z
  .object({
    currentPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
    newPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
  })
  .refine((input) => input.currentPin !== input.newPin, {
    message: 'Choose a different PIN than your current one.',
    path: ['newPin'],
  });
export type TutorPortalChangePinInput = z.infer<typeof tutorPortalChangePinSchema>;

export type TutorPortalLoginResult =
  | { status: 'ok'; sessionId: string; expiresAt: string; mustChangePin: boolean }
  | { status: 'invalid' }
  | { status: 'locked' };

export const updateTutorContactSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(10),
});
export type UpdateTutorContactInput = z.infer<typeof updateTutorContactSchema>;

export interface TutorPortalBatch {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  endDate: string;
  zoomLink: string | null;
}

export interface TutorPortalLiveSession {
  id: string;
  batchId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export interface TutorPortalDashboard {
  fullName: string;
  email: string;
  phone: string;
  mustChangePin: boolean;
  batches: TutorPortalBatch[];
  liveSessions: TutorPortalLiveSession[];
}

export interface TutorPortalRosterEntry {
  registrationId: string;
  fullName: string;
  email: string;
  phone: string;
  registrationStatus: string;
  registeredAt: string;
}

export interface TutorPortalAttendanceEntry {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  sessionDate: string;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number;
}

export interface TutorPortalCertificateCandidate {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  paid: boolean;
  feedbackSubmitted: boolean;
  attendancePercent: number | null;
  alreadyIssued: boolean;
  eligible: boolean;
}
