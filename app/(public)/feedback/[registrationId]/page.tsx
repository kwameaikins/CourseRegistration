'use client';

// Public post-course feedback form (redesigned 2026-07-27 — 5 question
// groups; see lib/feedback-questions.ts for the shared copy). Reached via
// the personal link in the post-course email; no login. Submitting
// immediately issues the participant's certificate if they're Paid
// (founder-approved auto-issue) — the thank-you screen offers a download
// right away, no login needed (same unguessable-id-as-token posture as the
// rest of this app's public surfaces).
import { use, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import {
  FEEDBACK_IMPROVEMENT_LABEL,
  FEEDBACK_MATERIALS_LABEL,
  FEEDBACK_MATERIALS_OPTIONS,
  FEEDBACK_MOST_VALUABLE_LABEL,
  FEEDBACK_OTHER_COURSE_LABEL,
  FEEDBACK_RATING_QUESTIONS,
  FEEDBACK_RECOMMEND_LABEL,
  FEEDBACK_RECOMMEND_OPTIONS,
  FEEDBACK_TESTIMONIAL_LABEL,
  FEEDBACK_TESTIMONIAL_OPTIONS,
} from '@/lib/feedback-questions';

interface FormContext {
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  alreadySubmitted: boolean;
}

interface SubmitResult {
  submitted: true;
  certificateIssued: boolean;
  certificateDownloadUrl: string | null;
}

function RatingInput(props: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="flex gap-2" role="radiogroup" aria-labelledby={props.id}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={props.value === score}
            className={
              props.value === score
                ? 'h-11 w-11 rounded-md bg-primary text-sm font-semibold text-primary-foreground'
                : 'h-11 w-11 rounded-md border text-sm hover:bg-accent'
            }
            onClick={() => props.onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceInput<T extends string>(props: {
  id: string;
  label: string;
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={props.id}>
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={props.value === option.value}
            className={
              props.value === option.value
                ? 'h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground'
                : 'h-11 rounded-md border px-4 text-sm hover:bg-accent'
            }
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { registrationId } = use(params);
  const [context, setContext] = useState<FormContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [certificateIssued, setCertificateIssued] = useState(false);
  const [certificateDownloadUrl, setCertificateDownloadUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [overallRating, setOverallRating] = useState(0);
  const [relevanceRating, setRelevanceRating] = useState(0);
  const [facilitatorRating, setFacilitatorRating] = useState(0);
  const [confidenceRating, setConfidenceRating] = useState(0);
  const [materialsClarity, setMaterialsClarity] = useState<(typeof FEEDBACK_MATERIALS_OPTIONS)[number] | ''>('');
  const [mostValuableText, setMostValuableText] = useState('');
  const [improvementText, setImprovementText] = useState('');
  const [recommendation, setRecommendation] = useState<(typeof FEEDBACK_RECOMMEND_OPTIONS)[number] | ''>('');
  const [otherCourseSuggestion, setOtherCourseSuggestion] = useState('');
  const [testimonialChoice, setTestimonialChoice] = useState<'Named' | 'Anonymous' | 'No'>('No');

  const ratingValues: Record<string, [number, (v: number) => void]> = {
    overallRating: [overallRating, setOverallRating],
    relevanceRating: [relevanceRating, setRelevanceRating],
    facilitatorRating: [facilitatorRating, setFacilitatorRating],
    confidenceRating: [confidenceRating, setConfidenceRating],
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<FormContext>(`/api/feedback/${registrationId}`);
        setContext(data);
        if (data.alreadySubmitted) setSubmitted(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'This link is not valid.');
      }
    })();
  }, [registrationId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!overallRating || !relevanceRating || !facilitatorRating || !confidenceRating) {
      setErrorMessage('Please answer all four rating questions.');
      return;
    }
    if (!materialsClarity) {
      setErrorMessage('Please let us know about the course materials.');
      return;
    }
    if (!recommendation) {
      setErrorMessage('Please let us know if you would recommend this course.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await apiFetch<SubmitResult>(`/api/feedback/${registrationId}`, {
        method: 'POST',
        body: JSON.stringify({
          overallRating,
          relevanceRating,
          facilitatorRating,
          confidenceRating,
          materialsClarity,
          mostValuableText,
          improvementText,
          recommendation,
          otherCourseSuggestion,
          testimonialChoice,
        }),
      });
      setCertificateIssued(result.certificateIssued);
      setCertificateDownloadUrl(result.certificateDownloadUrl);
      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Feedback</h1>
        <p className="mt-4 text-sm text-muted-foreground">{loadError}</p>
      </main>
    );
  }

  if (!context) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Thank you{context.participantFirstName ? `, ${context.participantFirstName}` : ''}!</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your feedback on {context.courseName} has been received. We appreciate you helping
          us improve.
        </p>
        {certificateIssued && certificateDownloadUrl && (
          <div className="mt-6 rounded-lg border bg-accent/40 p-6">
            <p className="text-sm font-medium">Your certificate is ready 🎉</p>
            <a className="mt-3 inline-block" href={certificateDownloadUrl} target="_blank" rel="noreferrer">
              <Button type="button">Download your certificate</Button>
            </a>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-bold">Course Feedback</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {context.participantFirstName ? `${context.participantFirstName}, thank` : 'Thank'}{' '}
        you for completing <strong>{context.courseName}</strong> ({context.cohortLabel}).
        This takes under two minutes — and if you&apos;re paid up, your certificate is issued
        the moment you submit.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Rate your experience
          </h2>
          {FEEDBACK_RATING_QUESTIONS.map((question) => (
            <RatingInput
              key={question.key}
              id={question.key}
              label={question.label}
              value={ratingValues[question.key][0]}
              onChange={ratingValues[question.key][1]}
            />
          ))}
        </div>

        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Course materials
          </h2>
          <ChoiceInput
            id="materialsClarity"
            label={FEEDBACK_MATERIALS_LABEL}
            value={materialsClarity}
            options={FEEDBACK_MATERIALS_OPTIONS.map((o) => ({ value: o, label: o }))}
            onChange={setMaterialsClarity}
          />
        </div>

        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            In your own words
          </h2>
          <div className="space-y-2">
            <Label htmlFor="mostValuable">{FEEDBACK_MOST_VALUABLE_LABEL} (optional)</Label>
            <textarea
              id="mostValuable"
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={1000}
              value={mostValuableText}
              onChange={(event) => setMostValuableText(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="improvement">{FEEDBACK_IMPROVEMENT_LABEL} (optional)</Label>
            <textarea
              id="improvement"
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={2000}
              value={improvementText}
              onChange={(event) => setImprovementText(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Looking ahead
          </h2>
          <ChoiceInput
            id="recommendation"
            label={FEEDBACK_RECOMMEND_LABEL}
            value={recommendation}
            options={FEEDBACK_RECOMMEND_OPTIONS.map((o) => ({ value: o, label: o }))}
            onChange={setRecommendation}
          />
          <div className="space-y-2">
            <Label htmlFor="otherCourse">{FEEDBACK_OTHER_COURSE_LABEL} (optional)</Label>
            <input
              id="otherCourse"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              maxLength={300}
              value={otherCourseSuggestion}
              onChange={(event) => setOtherCourseSuggestion(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Testimonial permission
          </h2>
          <ChoiceInput
            id="testimonialChoice"
            label={FEEDBACK_TESTIMONIAL_LABEL}
            value={testimonialChoice}
            options={FEEDBACK_TESTIMONIAL_OPTIONS}
            onChange={setTestimonialChoice}
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="h-11 w-full">
          {submitting ? 'Submitting…' : 'Submit feedback'}
        </Button>
      </form>
    </main>
  );
}
