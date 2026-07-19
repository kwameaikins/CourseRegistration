'use client';

// Public post-course feedback form (founder-approved 2026-07-19). Reached via
// the personal link in the post-course email; no login. Kept under 2 minutes:
// three ratings, one text box, two checkboxes, course interests.
import { use, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface FormContext {
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  alreadySubmitted: boolean;
  courseOptions: string[];
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
                ? 'h-10 w-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground'
                : 'h-10 w-10 rounded-md border text-sm hover:bg-accent'
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

export default function FeedbackPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { registrationId } = use(params);
  const [context, setContext] = useState<FormContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [overallRating, setOverallRating] = useState(0);
  const [facilitatorRating, setFacilitatorRating] = useState(0);
  const [recommendRating, setRecommendRating] = useState(0);
  const [improvementText, setImprovementText] = useState('');
  const [testimonialConsent, setTestimonialConsent] = useState(false);
  const [commentsAnonymous, setCommentsAnonymous] = useState(false);
  const [interestedCourses, setInterestedCourses] = useState<string[]>([]);

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
    if (!overallRating || !facilitatorRating || !recommendRating) {
      setErrorMessage('Please answer all three rating questions.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/feedback/${registrationId}`, {
        method: 'POST',
        body: JSON.stringify({
          overallRating,
          facilitatorRating,
          recommendRating,
          improvementText,
          testimonialConsent,
          commentsAnonymous,
          interestedCourses,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCourse(courseName: string) {
    setInterestedCourses((current) =>
      current.includes(courseName)
        ? current.filter((name) => name !== courseName)
        : [...current, courseName],
    );
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
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">Course Feedback</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {context.participantFirstName ? `${context.participantFirstName}, thank` : 'Thank'}{' '}
        you for completing <strong>{context.courseName}</strong> ({context.cohortLabel}).
        This takes under two minutes.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <RatingInput
          id="overall"
          label="How satisfied were you with the course overall? (1 = poor, 5 = excellent)"
          value={overallRating}
          onChange={setOverallRating}
        />
        <RatingInput
          id="facilitator"
          label="How would you rate the facilitator?"
          value={facilitatorRating}
          onChange={setFacilitatorRating}
        />
        <RatingInput
          id="recommend"
          label="How likely are you to recommend this course to a colleague?"
          value={recommendRating}
          onChange={setRecommendRating}
        />

        <div className="space-y-2">
          <Label htmlFor="improvement">What should we improve? (optional)</Label>
          <textarea
            id="improvement"
            className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
            maxLength={2000}
            value={improvementText}
            onChange={(event) => setImprovementText(event.target.value)}
          />
        </div>

        {context.courseOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Which other courses interest you? (optional)</Label>
            <div className="space-y-2">
              {context.courseOptions.map((courseName) => (
                <label key={courseName} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={interestedCourses.includes(courseName)}
                    onChange={() => toggleCourse(courseName)}
                  />
                  {courseName}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={testimonialConsent}
              onChange={(event) => setTestimonialConsent(event.target.checked)}
            />
            You may use my comments as a public testimonial.
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={commentsAnonymous}
              onChange={(event) => setCommentsAnonymous(event.target.checked)}
            />
            Keep my written comments anonymous to the facilitator.
          </label>
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Submitting…' : 'Submit feedback'}
        </Button>
      </form>
    </main>
  );
}
