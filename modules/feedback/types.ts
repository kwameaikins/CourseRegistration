import { z } from 'zod';

const rating = z.number().int().min(1).max(5);
const yesPartlyNo = z.enum(['Yes', 'Partly', 'No']);
const yesMaybeNo = z.enum(['Yes', 'Maybe', 'No']);
const testimonialChoice = z.enum(['Named', 'Anonymous', 'No']);

// Redesigned 2026-07-27 (founder-supplied question list, organized into 5
// groups — see the public/portal forms). Ratings and the three categorical
// questions are required; the two short-text questions stay optional to
// keep drop-off low, same posture as the original improvement_text.
export const feedbackSubmissionSchema = z.object({
  overallRating: rating,
  relevanceRating: rating,
  facilitatorRating: rating,
  confidenceRating: rating,
  materialsClarity: yesPartlyNo,
  mostValuableText: z.string().trim().max(1000).optional().default(''),
  improvementText: z.string().trim().max(2000).optional().default(''),
  recommendation: yesMaybeNo,
  otherCourseSuggestion: z.string().trim().max(300).optional().default(''),
  testimonialChoice: testimonialChoice.default('No'),
});

export type FeedbackSubmissionInput = z.infer<typeof feedbackSubmissionSchema>;

// What the public form is allowed to know about the Registration behind the
// token — deliberately minimal (no email, no phone, no payment detail).
export interface PublicFeedbackContext {
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  alreadySubmitted: boolean;
}

export interface FeedbackRow {
  registrationId: string;
  participantName: string | null;
  overallRating: number;
  relevanceRating: number;
  facilitatorRating: number;
  confidenceRating: number;
  materialsClarity: 'Yes' | 'Partly' | 'No';
  mostValuableText: string | null;
  improvementText: string | null;
  recommendation: 'Yes' | 'Maybe' | 'No';
  otherCourseSuggestion: string | null;
  testimonialChoice: 'Named' | 'Anonymous' | 'No';
  submittedAt: string;
}

export interface BatchFeedbackSummary {
  responses: number;
  paidRegistrations: number;
  averageOverall: number | null;
  averageRelevance: number | null;
  averageFacilitator: number | null;
  averageConfidence: number | null;
  recommendationBreakdown: { yes: number; maybe: number; no: number };
  rows: FeedbackRow[];
}

export interface FeedbackDispatchSummary {
  date: string;
  batchesEvaluated: number;
  emailsSent: number;
  skipped: number;
  errors: string[];
}

// submitFeedback's result — lets both the public page and the portal show a
// certificate download immediately, without a second round trip.
export interface FeedbackSubmissionResult {
  certificateIssued: boolean;
  certificateDownloadUrl: string | null;
}
