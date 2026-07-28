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
  // Same Paid-only visibility gate as zoomLink (founder-approved 2026-07-28
  // — course materials, same posture as the join link).
  resourcesLink: string | null;
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
  // Payment plan (founder-approved 2026-07-24) — empty when no plan has
  // been set up for this registration.
  installments: Array<{
    installmentNumber: number;
    amountDue: number;
    amountPaid: number;
    dueDate: string;
    paymentStatus: 'Pending' | 'Paid';
  }>;
  // In-portal feedback (2026-07-27) — lets the dashboard show a "give
  // feedback" prompt without a separate round trip; submitting is what
  // triggers certificate auto-issue when Paid.
  feedbackSubmitted: boolean;
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

// Simple fixed-split payment plan (founder-approved 2026-07-24) — the
// participant picks which of their own registrations to split into two
// installments. registrationId is validated against the caller's own
// session-scoped registrations in portalService.setUpInstallmentPlan, never
// trusted as an arbitrary id.
export const portalSetUpInstallmentPlanSchema = z.object({
  registrationId: z.uuid(),
});
export type PortalSetUpInstallmentPlanInput = z.infer<typeof portalSetUpInstallmentPlanSchema>;

// Receipt (student portal, 2026-07-26) — rendered on demand from the
// registration's live payment data, same posture as the certificate/invoice
// PDF generators; never a stored record.
export interface PortalReceiptData {
  participantName: string;
  participantEmail: string;
  courseName: string;
  cohortLabel: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  paymentMethod: string | null;
  transactionId: string | null;
  paymentDate: string | null;
  registrationId: string;
}

// Message history (student portal, 2026-07-26) — a participant's own
// communications, scoped to one registration they own.
export interface PortalMessageHistoryEntry {
  channel: 'email' | 'whatsapp' | 'sms';
  messageType: string;
  sentAt: string;
  success: boolean;
}

// Forgot-PIN (student portal, 2026-07-26) — identical email-or-phone
// identifier shape as portalLoginSchema.
export const portalForgotPinSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
});
export type PortalForgotPinInput = z.infer<typeof portalForgotPinSchema>;

export const portalResetPinSchema = z.object({
  token: z.string().trim().min(1),
  newPin: z.string().trim().regex(/^\d{4}$/, 'PIN must be 4 digits'),
});
export type PortalResetPinInput = z.infer<typeof portalResetPinSchema>;

// Staff-facing student lookup (Admin Assistant tools, 2026-07-27) — a
// richer, structured equivalent of the voice-only lookup_customer tool,
// reusing the exact same dashboard data the student portal itself shows.
export interface StudentStatusRegistration {
  registrationId: string;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  registrationStatus: string;
  paymentStatus: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  certificates: Array<{ certificateNumber: string; issuedDate: string; revoked: boolean }>;
}

export interface StudentStatusSummary {
  fullName: string;
  email: string;
  phone: string;
  registrations: StudentStatusRegistration[];
}
