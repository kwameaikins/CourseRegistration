import { z } from 'zod';

const rating = z.number().int().min(1).max(5);

export const feedbackSubmissionSchema = z.object({
  overallRating: rating,
  facilitatorRating: rating,
  recommendRating: rating,
  improvementText: z.string().trim().max(2000).optional().default(''),
  testimonialConsent: z.boolean().default(false),
  commentsAnonymous: z.boolean().default(false),
  interestedCourses: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});

export type FeedbackSubmissionInput = z.infer<typeof feedbackSubmissionSchema>;

// What the public form is allowed to know about the Registration behind the
// token — deliberately minimal (no email, no phone, no payment detail).
export interface PublicFeedbackContext {
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  alreadySubmitted: boolean;
  courseOptions: string[];
}

export interface FeedbackRow {
  registrationId: string;
  participantName: string | null;
  overallRating: number;
  facilitatorRating: number;
  recommendRating: number;
  improvementText: string | null;
  testimonialConsent: boolean;
  commentsAnonymous: boolean;
  interestedCourses: string | null;
  submittedAt: string;
}

export interface BatchFeedbackSummary {
  responses: number;
  paidRegistrations: number;
  averageOverall: number | null;
  averageFacilitator: number | null;
  averageRecommend: number | null;
  rows: FeedbackRow[];
}

export interface FeedbackDispatchSummary {
  date: string;
  batchesEvaluated: number;
  emailsSent: number;
  skipped: number;
  errors: string[];
}
