import { z } from 'zod';

import type { StaffRole } from '@/lib/domain/types';

export interface StaffUser {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}

export const staffUserInputSchema = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2),
  role: z.enum(['admin', 'finance', 'marketing', 'tutor', 'management']),
});

export const staffUserUpdateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  role: z.enum(['admin', 'finance', 'marketing', 'tutor', 'management']).optional(),
  isActive: z.boolean().optional(),
});

export type StaffUserInput = z.infer<typeof staffUserInputSchema>;
export type StaffUserUpdate = z.infer<typeof staffUserUpdateSchema>;
