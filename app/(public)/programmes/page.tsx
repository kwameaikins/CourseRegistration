import type { Metadata } from 'next';
import Link from 'next/link';

import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import * as feedbackService from '@/modules/feedback/service';
import { getPublicCourseCatalog } from '@/modules/courses/public-catalog';
import {
  CATALOG_FAQ,
  HOW_REGISTRATION_WORKS,
  WHY_KNOWSIA,
} from '@/modules/courses/public-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Professional Training Programmes | Knowsia',
  description:
    'Live, expert-led professional training in AI-powered financial reporting, ESG and sustainability reporting, and enterprise risk management. Practical exercises, professional certificate, verifiable credentials.',
};

const WHATSAPP_CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL ?? 'https://wa.me/233530531328';

// Public course catalogue (founder copy 2026-08-03). No shared (public)
// layout in this app — each page self-includes KnowsiaHeader, same as
// /register, /verify and /news.
export default async function CoursesPage() {
  // Testimonials must never take the catalogue down with them: a visitor who
  // came to register cares about the programme list, not the quotes.
  const [courses, testimonials] = await Promise.all([
    getPublicCourseCatalog(),
    feedbackService.getPublishableTestimonials(4).catch((err) => {
      console.error('[courses catalogue testimonials]', err);
      return [];
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <KnowsiaHeader />

      <section className="mt-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Advance Your Career with Practical, Future-Ready Skills
        </h1>
        <p className="mt-4 text-muted-foreground">
          Gain the practical knowledge, tools and professional confidence you need to perform
          better, make stronger decisions and remain relevant in a rapidly changing business
          environment.
        </p>
        <p className="mt-3 text-muted-foreground">
          Explore our upcoming professional training programmes and register for the course
          that best supports your career goals.
        </p>

        <div className="mt-6">
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Register now
          </Link>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Live expert-led training • Practical exercises • Professional certificate •
          Verifiable credentials
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Choose Your Programme</h2>

        {courses.length === 0 && (
          <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
            Our next programmes are being scheduled. Please check back shortly, or{' '}
            <a href={WHATSAPP_CONTACT_URL} className="underline">
              message us on WhatsApp
            </a>{' '}
            to be notified.
          </p>
        )}

        <div className="mt-6 space-y-8">
          {courses.map((course) => (
            <article key={course.courseCode} className="rounded-lg border p-5">
              <h3 className="text-xl font-semibold">{course.courseName}</h3>

              {course.content ? (
                <>
                  {/* The card stays scannable: the promise plus the opening
                      paragraph. The full overview lives on the detail page. */}
                  <p className="mt-2 text-sm font-medium">{course.content.tagline}</p>
                  {course.content.overview.slice(0, 1).map((paragraph) => (
                    <p key={paragraph} className="mt-3 text-sm text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}

                  <p className="mt-4 text-sm">
                    <span className="font-medium">Ideal for:</span>{' '}
                    <span className="text-muted-foreground">{course.content.idealFor}</span>
                  </p>

                  <p className="mt-4 text-sm font-medium">
                    {course.content.outcomesLabel}:
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {course.content.outcomes.map((outcome) => (
                      <li key={outcome}>{outcome}</li>
                    ))}
                  </ul>
                </>
              ) : (
                // No copy written for this course code yet — still list it with
                // its real dates rather than dropping a live programme from the
                // public site. See public-content.ts on why this is the chosen
                // failure mode.
                <p className="mt-3 text-sm text-muted-foreground">
                  Full programme details are being finalised. Upcoming dates are shown below
                  and registration is open.
                </p>
              )}

              <CourseSessionSummary course={course} className="mt-5" />

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={
                    course.nextSession
                      ? `/register?batchId=${course.nextSession.batchId}`
                      : '/register'
                  }
                  className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {course.isFreeProgramme ? 'Register for the free webinar' : 'Register now'}
                </Link>
                <Link
                  href={`/programmes/${course.courseCode}`}
                  className="inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium hover:bg-muted"
                >
                  {course.isFreeProgramme ? 'View webinar details' : 'View course details'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Why Learn with Knowsia?</h2>
        <div className="mt-6 space-y-5">
          {WHY_KNOWSIA.map((item) => (
            <div key={item.title}>
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">How Registration Works</h2>
        <ol className="mt-6 space-y-5">
          {HOW_REGISTRATION_WORKS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-medium">
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Register now
          </Link>
        </div>
      </section>

      {/* Hidden entirely until real consented testimonials exist — see
          getPublishableTestimonials on why there are no placeholder quotes. */}
      {testimonials.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl font-semibold">What Our Participants Say</h2>
          <div className="mt-6 space-y-5">
            {testimonials.map((testimonial, index) => (
              <figure key={index} className="rounded-lg border p-4">
                <blockquote className="text-sm italic">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-sm font-medium">
                  — {testimonial.attributedName ?? 'Anonymous Participant'}
                  {testimonial.courseName && (
                    <span className="font-normal text-muted-foreground">
                      , {testimonial.courseName}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mt-14">
        <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
        <div className="mt-6 space-y-4">
          {CATALOG_FAQ.map((item) => (
            <details key={item.question} className="rounded-lg border p-4">
              <summary className="cursor-pointer font-medium">{item.question}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-lg border p-6">
        <h2 className="text-2xl font-semibold">
          Ready to Build Your Next Professional Skill?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Choose your programme and take the next step towards becoming a more capable,
          confident and future-ready professional.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Register now
          </Link>
          <a
            href={WHATSAPP_CONTACT_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-md border px-6 font-medium hover:bg-muted"
          >
            Chat with us on WhatsApp
          </a>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Need assistance before registering?
        </p>
      </section>
    </main>
  );
}
