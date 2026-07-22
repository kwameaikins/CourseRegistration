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
  // Personal join link when this participant has been individually
  // registered on Zoom (Paid + attendance module ran), else the course's
  // shared classroom link, else null (not set up).
  zoomLink: string | null;
  paymentStatus: string;
  courseFee: number;
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
  email: string;
  phone: string;
  mustChangePin: boolean;
  registrations: PortalDashboardRegistration[];
}
