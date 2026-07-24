import { z } from 'zod';

export const PORTAL_SESSION_COOKIE = 'portal_session';

export const portalLoginSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
  pin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

export const portalChangePinSchema = z
  .object({
    currentPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
    newPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
  })
  .refine((input) => input.currentPin !== input.newPin, {
    message: 'Choose a different PIN than your current one.',
    path: ['newPin'],
  });
export type PortalChangePinInput = z.infer<typeof portalChangePinSchema>;

export type PortalLoginResult =
  | { status: 'ok'; sessionId: string; expiresAt: string; mustChangePin: boolean }
  | { status: 'invalid' }
  | { status: 'locked' };

export const exchangeLoginTokenSchema = z.object({
  reference: z.string().trim().min(1).max(200),
});
export type ExchangeLoginTokenInput = z.infer<typeof exchangeLoginTokenSchema>;

// Deliberately 200/"ok state" rather than AppError for pending/invalid —
// these are normal, expected outcomes while a webhook is still in flight,
// not error conditions the client needs to distinguish by HTTP status.
export type PortalExchangeLoginTokenResult =
  | { status: 'ok'; sessionId: string; expiresAt: string }
  | { status: 'pending' }
  | { status: 'invalid' };

export interface PortalDashboardRegistration {
  registrationId: string;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  registrationStatus: string;
  startDate: string;
  startTime: string;
  endDate: string;
  facilitatorName: string;
  // Null until payment_status is Paid (system review, 2026-07-22) — an
  // unpaid registrant must never see the classroom link. Once Paid: the
  // personal join link when this participant has been individually
  // registered on Zoom, else the course's shared classroom link, else null
  // (Zoom not set up yet).
  zoomLink: string | null;
  paymentStatus: string;
  courseFee: number;
  // Equal to courseFee when no staff discount has ever been granted;
  // otherwise the pre-discount fee, shown struck-through in the UI.
  originalFee: number;
  amountPaid: number;
  balance: number;
  attendance: Array<{
    sessionDate: string;
    joinTime: string | null;
    leaveTime: string | null;
    durationMinutes: number;
  }>;
  certificates: Array<{
    id: string;
    certificateNumber: string;
    issuedDate: string;
    revoked: boolean;
  }>;
}

export interface PortalDashboard {
  fullName: string;
  firstName: string;
  middleName: string | null;
  surname: string;
  email: string;
  phone: string;
  mustChangePin: boolean;
  registrations: PortalDashboardRegistration[];
}

// Self-service name correction (founder request, 2026-07-24) — participants
// confirm/fix their own name before a certificate is issued off it. Same
// shape as the registration form's name fields.
export const portalUpdateNameSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  middleName: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((value) => (value ? value : null)),
  surname: z.string().trim().min(1).max(100),
});
export type PortalUpdateNameInput = z.infer<typeof portalUpdateNameSchema>;
