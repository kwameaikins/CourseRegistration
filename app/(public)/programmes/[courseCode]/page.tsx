import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CourseRating } from '@/app/(public)/programmes/CourseRating';
import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import { formatDate, formatGhs } from '@/lib/utils';
import * as feedbackService from '@/modules/feedback/service';
import { getPublicCourseByCode } from '@/modules/courses/public-catalog';
import { CATALOG_FAQ } from '@/modules/courses/public-content';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

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

// Programme detail page — the destination for "View details" and the natural
// landing page for a course-specific referral link. Prose comes from the
// founder's briefs (via public-content.ts); every commercial fact — dates,
// fee, seats, free-vs-paid — is read live from the Batch, so this page can
// never advertise terms the registration form will then contradict.
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
  const next = course.nextSession;
  const registerHref = next ? `/register?batchId=${next.batchId}` : '/register';
  const registerLabel = course.isFreeProgramme ? 'Register free' : 'Register now';
  // A programme with its own FAQ answers the specific questions people ask
  // about it; the generic catalogue FAQ is the fallback, not an addition.
  const faq = content && content.faq.length > 0 ? content.faq : CATALOG_FAQ;

  // Course structured data, so Google can show this programme — and its star
  // rating — as a rich result rather than a plain blue link.
  //
  // aggregateRating is attached ONLY when a rating is actually rendered on the
  // page above. Marking up a rating a visitor cannot see is a structured-data
  // policy violation and risks a manual action, not just a lost rich result.
  // Because `course.rating` is null below the response threshold, the markup
  // and the visible rating are driven by the same value and cannot drift.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.courseName,
    description: content?.tagline ?? `${course.courseName} — live professional training.`,
    provider: {
      '@type': 'Organization',
      name: 'Knowsia',
      url: APP_URL,
    },
    ...(course.rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: course.rating.average,
            // ratingCount, NOT reviewCount — these are scores from the
            // post-course feedback form, not written reviews. Declaring 31
            // reviews when 31 people moved a star slider overstates what we
            // hold, which is the exact claim this feature exists to avoid.
            ratingCount: course.rating.responses,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <script
        type="application/ld+json"
        // Serialised rather than interpolated so a quote or an angle bracket in
        // a course name cannot break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a href="#detail" className="skip">
        Skip to programme details
      </a>

      <header className="hero" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <nav className="hero-nav">
            <Link href="/programmes">
              <Image
                src="/knowsia-logo.png"
                alt="Knowsia"
                width={185}
                height={68}
                priority
                className="logo"
              />
            </Link>
            <Link href="/programmes" className="plain">
              All programmes
            </Link>
          </nav>

          <p className="eyebrow">
            {course.isFreeProgramme ? 'Free webinar' : `Programme · ${course.courseCode}`}
          </p>
          <h1 style={{ maxWidth: '22ch' }}>{course.courseName}</h1>
          {content && <p className="lede">{content.tagline}</p>}

          {course.rating && (
            <div style={{ marginTop: 18 }}>
              <CourseRating rating={course.rating} size="lg" />
            </div>
          )}

          <div className="trust">
            {next && (
              <span>
                <svg className="icon" aria-hidden>
                  <use href="#m-calendar" />
                </svg>
                Next cohort {formatDate(next.startDate)}
              </span>
            )}
            <span>
              <svg className="icon" aria-hidden>
                <use href="#m-live" />
              </svg>
              Live and interactive via Zoom
            </span>
            <span>
              <svg className="icon" aria-hidden>
                <use href="#m-shield" />
              </svg>
              Verifiable certificate
            </span>
          </div>
        </div>
      </header>

      <main id="detail" className="band">
        <div className="wrap">
          <p className="crumb">
            <Link href="/programmes">Programmes</Link> · {course.courseName}
          </p>

          <div className="detail-grid" style={{ marginTop: 26 }}>
            <div className="article">
              {!content ? (
                <section>
                  <h2>About this programme</h2>
                  <p style={{ marginTop: 14, color: 'var(--ink-muted)' }}>
                    Full programme details are being finalised. The upcoming dates are
                    shown alongside and registration is open — or{' '}
                    <a href={WHATSAPP_CONTACT_URL} style={{ color: 'var(--accent)' }}>
                      message us on WhatsApp
                    </a>{' '}
                    for the outline.
                  </p>
                </section>
              ) : (
                <>
                  <section>
                    <h2>About this programme</h2>
                    <div className="prose" style={{ marginTop: 14, color: 'var(--ink-muted)' }}>
                      {content.overview.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h2>{content.outcomesLabel}</h2>
                    <ul className="list">
                      {content.outcomes.map((outcome) => (
                        <li key={outcome}>
                          <svg className="icon" aria-hidden>
                            <use href="#m-check" />
                          </svg>
                          <span>{outcome}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h2>Who should attend</h2>
                    <ul className="list">
                      {content.primaryAudience.map((item) => (
                        <li key={item}>
                          <svg className="icon" aria-hidden>
                            <use href="#m-users" />
                          </svg>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    {content.alsoSuitableFor.length > 0 && (
                      <>
                        <h3 style={{ marginTop: 26, fontSize: '1.05rem' }}>Also suitable for</h3>
                        <ul className="list">
                          {content.alsoSuitableFor.map((item) => (
                            <li key={item}>
                              <svg className="icon" aria-hidden>
                                <use href="#m-check" />
                              </svg>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {content.curriculum.length > 0 && (
                    <section>
                      <h2>Programme curriculum</h2>
                      <div style={{ marginTop: 16 }}>
                        {content.curriculum.map((session) => (
                          <div key={session.heading} className="module">
                            <p className="step-label">{session.heading}</p>
                            <h3>{session.title}</h3>
                            <ul>
                              {session.points.map((point) => (
                                <li key={point}>{point}</li>
                              ))}
                            </ul>
                            {session.practical && (
                              <p className="practical">{session.practical}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {content.format.length > 0 && (
                    <section>
                      <h2>Course format</h2>
                      <dl className="spec">
                        {/* Shown so a caller quoting the code and the catalogue
                            are talking about the same programme. */}
                        <div>
                          <dt>Course code</dt>
                          <dd>{course.courseCode}</dd>
                        </div>
                        {content.format.map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                        {content.facilitator.name && (
                          <div>
                            <dt>Facilitator</dt>
                            <dd>
                              {content.facilitator.name}
                              {content.facilitator.credentials &&
                                `, ${content.facilitator.credentials}`}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </section>
                  )}

                  {content.prerequisites.length > 0 && (
                    <section>
                      <h2>Prerequisites</h2>
                      <ul className="list">
                        {content.prerequisites.map((item) => (
                          <li key={item}>
                            <svg className="icon" aria-hidden>
                              <use href="#m-check" />
                            </svg>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section>
                    <h2>What your registration includes</h2>
                    <ul className="list">
                      {content.includes.map((item) => (
                        <li key={item}>
                          <svg className="icon" aria-hidden>
                            <use href="#m-check" />
                          </svg>
                          <span>{item}</span>
                        </li>
                      ))}
                      <li>
                        <svg className="icon" aria-hidden>
                          <use href="#m-shield" />
                        </svg>
                        <span>
                          A credential anyone can confirm through our{' '}
                          <Link href="/verify" style={{ color: 'var(--accent)' }}>
                            public certificate verification
                          </Link>{' '}
                          page.
                        </span>
                      </li>
                    </ul>
                  </section>

                  {content.corporateNote && (
                    <section>
                      <div className="callout">
                        <h2 style={{ fontSize: '1.2rem' }}>Training a team?</h2>
                        <p style={{ marginTop: 10, color: 'var(--ink-muted)' }}>
                          {content.corporateNote}
                        </p>
                        <div style={{ marginTop: 16 }}>
                          <a
                            href={WHATSAPP_CONTACT_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline btn-sm"
                          >
                            Arrange a corporate booking
                          </a>
                        </div>
                      </div>
                    </section>
                  )}
                </>
              )}

              {courseTestimonials.length > 0 && (
                <section>
                  <h2>What participants say</h2>
                  <div className="quotes" style={{ marginTop: 16 }}>
                    {courseTestimonials.map((testimonial, index) => (
                      <figure key={index} className="quote">
                        <p className="mark" aria-hidden>
                          &ldquo;
                        </p>
                        <blockquote>{testimonial.quote}</blockquote>
                        <figcaption>
                          {testimonial.attributedName ?? 'Anonymous participant'}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2>Frequently asked questions</h2>
                <div className="faq" style={{ marginTop: 16 }}>
                  {faq.map((item) => (
                    <details key={item.question}>
                      <summary>{item.question}</summary>
                      <p className="answer">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            </div>

            {/* The buy box travels with the reader on desktop: a long detail
                page otherwise leaves the price and the CTA far above wherever
                the decision actually gets made. */}
            <aside className="sticky">
              <div className="buybox">
                {next ? (
                  <>
                    <p className="kicker">
                      {course.isFreeProgramme ? 'No payment required' : 'Next cohort'}
                    </p>
                    <p style={{ marginTop: 10 }}>
                      {course.isFreeProgramme ? (
                        <span className="price-now" style={{ color: 'var(--success)' }}>
                          Free
                        </span>
                      ) : (
                        <>
                          {next.earlyBirdEndsOn && (
                            <span className="price-was">{formatGhs(next.listFee)} </span>
                          )}
                          <span className="price-now">{formatGhs(next.effectiveFee)}</span>
                        </>
                      )}
                    </p>
                    {next.earlyBirdEndsOn && (
                      <p style={{ marginTop: 8, fontSize: 14, color: 'var(--success)' }}>
                        Early-bird price until {formatDate(next.earlyBirdEndsOn)}
                      </p>
                    )}
                    <p style={{ marginTop: 14, fontSize: 15, color: 'var(--ink-muted)' }}>
                      Starts {formatDate(next.startDate)} at {next.startTime.slice(0, 5)}
                    </p>
                    {next.isFull && (
                      <p style={{ marginTop: 10 }}>
                        <span className="tag tag-full">Fully booked</span>
                      </p>
                    )}
                    <div style={{ marginTop: 18 }}>
                      <Link href={registerHref} className="btn btn-primary btn-block">
                        {next.isFull ? 'Join the waiting list' : registerLabel}
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="kicker">Dates to be announced</p>
                    <p style={{ marginTop: 12, fontSize: 15, color: 'var(--ink-muted)' }}>
                      No cohort is open for registration on this programme right now.
                    </p>
                  </>
                )}

                <div style={{ marginTop: 12 }}>
                  <a
                    href={WHATSAPP_CONTACT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm btn-block"
                  >
                    Ask a question
                  </a>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <CourseSessionSummary course={course} showAll />
              </div>
            </aside>
          </div>
        </div>
      </main>

      <section style={{ paddingBottom: 24 }}>
        <div className="wrap">
          <div className="closer">
            <h2>{next?.isFull ? 'This cohort is full' : 'Ready to join?'}</h2>
            <p>
              {next
                ? next.isFull
                  ? 'Register to join the waiting list and we will contact you the moment a place opens up.'
                  : 'Secure your place on the next cohort.'
                : 'Register your interest and we will let you know as soon as dates are confirmed.'}
            </p>
            <div className="hero-cta">
              <Link href={registerHref} className="btn btn-primary">
                {next?.isFull ? 'Join the waiting list' : registerLabel}
              </Link>
              <Link href="/programmes" className="btn btn-ghost-light">
                Browse all programmes
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          <p>
            Questions before registering? Call 053 053 1328 or 020 370 1923, or email{' '}
            <a href="mailto:info@knowsia.com">info@knowsia.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
