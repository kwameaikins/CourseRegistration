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
  // Confirmed-registration count — not a payment field, safe to surface
  // (unlike anything from the payments table — see BR-33).
  registeredCount: number;
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

// Attendance Exceptions (Tutor Portal Phase 4, founder-approved 2026-07-31).
export const flagAttendanceExceptionSchema = z
  .object({
    registrationId: z.uuid(),
    batchId: z.uuid(),
    sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    exceptionType: z.enum(['no_show_flag', 'correction_request']),
    reason: z.string().trim().min(3).max(500),
    requestedPresent: z.boolean().optional(),
  })
  .refine(
    (input) => input.exceptionType !== 'correction_request' || input.requestedPresent !== undefined,
    {
      message: 'Say whether the participant should be marked present or absent.',
      path: ['requestedPresent'],
    },
  );
export type FlagAttendanceExceptionInput = z.infer<typeof flagAttendanceExceptionSchema>;

// Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31).
export const addTutorSessionMaterialSchema = z.object({
  batchId: z.uuid(),
  liveSessionId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  link: z.url().max(2000),
});
export type AddTutorSessionMaterialInput = z.infer<typeof addTutorSessionMaterialSchema>;

// Staff-facing tutor activity view.
export interface TutorActivityEntry {
  id: string;
  tutorId: string;
  tutorName: string;
  actionType: string;
  targetBatchId: string | null;
  details: unknown;
  createdAt: string;
}
