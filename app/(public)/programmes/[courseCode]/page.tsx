import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import * as feedbackService from '@/modules/feedback/service';
import { getPublicCourseByCode } from '@/modules/courses/public-catalog';
import { CATALOG_FAQ } from '@/modules/courses/public-content';

export const dynamic = 'force-dynamic';

const WHATSAPP_CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL ?? 'https://wa.me/233530531328';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}): Promise<Metadata> {
  const { courseCode } = await params;
  const course = await getPublicCourseByCode(courseCode);
  if (!course) return { title: 'Programme not found | Knowsia' };

  return {
    title: `${course.courseName} | Knowsia`,
    // The tagline is written as a one-sentence promise, which is exactly the
    // shape a search result and a shared link preview want.
    description: course.content?.tagline ?? `Professional training: ${course.courseName}.`,
  };
}

// Programme detail page — the destination for "View course details" and the
// natural landing page for a course-specific referral link. Prose comes from
// the founder's briefs in Coding Docs (via public-content.ts); every
// commercial fact — dates, fee, seats, free-vs-paid — is read live from the
// Batch, so this page can never advertise terms the registration form will
// then contradict.
export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}) {
  const { courseCode } = await params;
  const course = await getPublicCourseByCode(courseCode);
  if (!course) notFound();

  const testimonials = await feedbackService.getPublishableTestimonials(6).catch((err) => {
    console.error('[programme detail testimonials]', err);
    return [];
  });
  // Only this programme's testimonials — a quote about a different course on
  // this page would be misleading, not merely off-topic.
  const courseTestimonials = testimonials.filter(
    (testimonial) => testimonial.courseName === course.courseName,
  );

  const content = course.content;
  const registerHref = course.nextSession
    ? `/register?batchId=${course.nextSession.batchId}`
    : '/register';
  const registerLabel = course.isFreeProgramme
    ? 'Register for the free webinar'
    : 'Register now';
  // A programme with its own FAQ answers the specific questions people ask
  // about it; the generic catalogue FAQ is the fallback, not an addition.
  const faq = content && content.faq.length > 0 ? content.faq : CATALOG_FAQ;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <KnowsiaHeader />

      <p className="mt-6 text-sm">
        <Link href="/programmes" className="text-muted-foreground underline">
          All programmes
        </Link>
      </p>

      <header className="mt-4">
        {course.isFreeProgramme && (
          <p className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Free webinar — no payment required
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight">{course.courseName}</h1>
        {content && <p className="mt-4 text-lg text-muted-foreground">{content.tagline}</p>}
      </header>

      <CourseSessionSummary course={course} className="mt-6" showAll />

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={registerHref}
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
        >
          {registerLabel}
        </Link>
        <a
          href={WHATSAPP_CONTACT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center rounded-md border px-6 font-medium hover:bg-muted"
        >
          Ask a question on WhatsApp
        </a>
      </div>

      {!content ? (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">About this programme</h2>
          <p className="mt-3 text-muted-foreground">
            Full programme details are being finalised. Upcoming dates are shown above and
            registration is open — or{' '}
            <a href={WHATSAPP_CONTACT_URL} className="underline">
              message us on WhatsApp
            </a>{' '}
            for the outline.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-12">
            <h2 className="text-xl font-semibold">About this programme</h2>
            {content.overview.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Who should attend</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              {content.primaryAudience.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {content.alsoSuitableFor.length > 0 && (
              <>
                <p className="mt-5 font-medium">Also suitable for</p>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
                  {content.alsoSuitableFor.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">{content.outcomesLabel}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              {content.outcomes.map((outcome) => (
                <li key={outcome}>{outcome}</li>
              ))}
            </ul>
          </section>

          {content.curriculum.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Programme curriculum</h2>
              <div className="mt-4 space-y-4">
                {content.curriculum.map((session) => (
                  <div key={session.heading} className="rounded-lg border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {session.heading}
                    </p>
                    <h3 className="mt-1 font-medium">{session.title}</h3>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {session.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    {session.practical && (
                      <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
                        {session.practical}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {content.format.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Course format</h2>
              <dl className="mt-4 divide-y rounded-lg border">
                {/* Course code is shown so a caller quoting it to staff and the
                    catalogue are talking about the same programme. */}
                <div className="flex flex-wrap gap-x-4 px-4 py-3 text-sm">
                  <dt className="w-40 shrink-0 font-medium">Course code</dt>
                  <dd className="text-muted-foreground">{course.courseCode}</dd>
                </div>
                {content.format.map((row) => (
                  <div key={row.label} className="flex flex-wrap gap-x-4 px-4 py-3 text-sm">
                    <dt className="w-40 shrink-0 font-medium">{row.label}</dt>
                    <dd className="text-muted-foreground">{row.value}</dd>
                  </div>
                ))}
                {content.facilitator.name && (
                  <div className="flex flex-wrap gap-x-4 px-4 py-3 text-sm">
                    <dt className="w-40 shrink-0 font-medium">Facilitator</dt>
                    <dd className="text-muted-foreground">
                      {content.facilitator.name}
                      {content.facilitator.credentials && `, ${content.facilitator.credentials}`}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {content.prerequisites.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-semibold">Prerequisites</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
                {content.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-xl font-semibold">What your registration includes</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
              {content.includes.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>
                A credential anyone can confirm through our{' '}
                <Link href="/verify" className="underline">
                  public certificate verification
                </Link>{' '}
                page.
              </li>
            </ul>
          </section>

          {content.corporateNote && (
            <section className="mt-10 rounded-lg border p-5">
              <h2 className="text-xl font-semibold">Corporate enrolment</h2>
              <p className="mt-3 text-muted-foreground">{content.corporateNote}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                To arrange a corporate booking,{' '}
                <a href={WHATSAPP_CONTACT_URL} className="underline">
                  message us on WhatsApp
                </a>
                .
              </p>
            </section>
          )}
        </>
      )}

      {courseTestimonials.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">What participants say</h2>
          <div className="mt-4 space-y-4">
            {courseTestimonials.map((testimonial, index) => (
              <figure key={index} className="rounded-lg border p-4">
                <blockquote className="text-sm italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-sm font-medium">
                  — {testimonial.attributedName ?? 'Anonymous Participant'}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Frequently asked questions</h2>
        <div className="mt-4 space-y-3">
          {faq.map((item) => (
            <details key={item.question} className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">{item.question}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">Ready to join?</h2>
        <p className="mt-2 text-muted-foreground">
          {course.nextSession
            ? course.nextSession.isFull
              ? 'This cohort is fully booked — register to join the waiting list and we will contact you the moment a place opens up.'
              : 'Secure your place on the next cohort.'
            : 'Register your interest and we will let you know as soon as dates are confirmed.'}
        </p>
        <div className="mt-5">
          <Link
            href={registerHref}
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
          >
            {registerLabel}
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Questions before registering? Call 053 053 1328 or 020 370 1923, or email{' '}
          <a href="mailto:info@knowsia.com" className="underline">
            info@knowsia.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
