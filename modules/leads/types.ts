import { z } from 'zod';

export interface Lead {
  id: string;
  registrationId: string | null;
  participantId: string | null;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  leadSource: string;
  status: string;
  score: number;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createLeadInputSchema = z.object({
  registrationId: z.string().uuid().nullable().optional(),
  participantId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
  jobTitle: z.string().trim().max(150).nullable().optional(),
  company: z.string().trim().max(150).nullable().optional(),
  leadSource: z.string().trim().min(1).max(50),
  status: z.string().trim().max(50).default('New'),
  score: z.coerce.number().int().min(0).max(100).default(0),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;
