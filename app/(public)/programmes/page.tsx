import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import {
  MARKETING_STYLES,
  MarketingIcons,
  WHY_ICONS,
} from '@/components/marketing/marketing-design-system';
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

const TRUST_POINTS = [
  { icon: 'm-live', label: 'Live expert-led training' },
  { icon: 'm-hands', label: 'Practical exercises' },
  { icon: 'm-award', label: 'Professional certificate' },
  { icon: 'm-shield', label: 'Verifiable credentials' },
];

// Public programme catalogue. No shared (public) layout in this app — each
// page self-includes its own chrome, same as /register, /verify and /news.
export default async function ProgrammesPage() {
  // Testimonials must never take the catalogue down with them: a visitor who
  // came to register cares about the programme list, not the quotes.
  const [allCourses, testimonials] = await Promise.all([
    getPublicCourseCatalog(),
    feedbackService.getPublishableTestimonials(4).catch((err) => {
      console.error('[programmes catalogue testimonials]', err);
      return [];
    }),
  ]);

  // Founder decision 2026-08-04: never show a programme with no cohort open
  // for registration. A card someone cannot act on is not marketing, it is
  // clutter — and the catalogue previously rendered every course in the
  // database, most of them with no dates and no copy.
  const courses = allCourses.filter((course) => course.sessions.length > 0);

  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#programmes" className="skip">
        Skip to programmes
      </a>

      <header className="hero">
        <div className="wrap">
          <nav className="hero-nav">
            <Image
              src="/knowsia-logo.png"
              alt="Knowsia"
              width={185}
              height={68}
              priority
              className="logo"
            />
            <Link href="/portal/login" className="plain">
              Student login
            </Link>
          </nav>

          <p className="eyebrow">Professional training</p>
          <h1>Advance your career with practical, future-ready skills</h1>
          <p className="lede">
            Gain the practical knowledge, tools and professional confidence you need to
            perform better, make stronger decisions and remain relevant in a rapidly
            changing business environment.
          </p>

          <div className="hero-cta">
            <a href="#programmes" className="btn btn-primary">
              Explore programmes
              <svg className="icon" aria-hidden>
                <use href="#m-arrow" />
              </svg>
            </a>
            <Link href="/register" className="btn btn-ghost-light">
              Register now
            </Link>
          </div>

          <div className="trust">
            {TRUST_POINTS.map((point) => (
              <span key={point.label}>
                <svg className="icon" aria-hidden>
                  <use href={`#${point.icon}`} />
                </svg>
                {point.label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main id="programmes">
        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Choose your programme</p>
              <h2>Open for registration</h2>
              <p>
                Every programme below has a cohort you can join now. Dates, fees and
                remaining places are live.
              </p>
            </div>

            {courses.length === 0 ? (
              <div className="callout">
                <h3>Our next cohorts are being scheduled</h3>
                <p style={{ marginTop: 10, color: 'var(--ink-muted)' }}>
                  Nothing is open for registration at this moment. Message us on WhatsApp
                  and we will let you know as soon as new dates are confirmed.
                </p>
                <div style={{ marginTop: 18 }}>
                  <a
                    href={WHATSAPP_CONTACT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    Chat with us on WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <div className="cards">
                {courses.map((course) => (
                  <article key={course.courseCode} className="card">
                    <div className="card-top">
                      <h3>{course.courseName}</h3>
                      {course.isFreeProgramme ? (
                        <span className="tag tag-free">Free</span>
                      ) : (
                        <span className="tag tag-code">{course.courseCode}</span>
                      )}
                    </div>

                    {course.content ? (
                      <>
                        <p className="promise">{course.content.tagline}</p>
                        <p className="blurb">{course.content.overview[0]}</p>
                      </>
                    ) : (
                      // A course with an open cohort but no copy written yet.
                      // It still gets a card — it is bookable — but a plain one.
                      <p className="blurb">
                        Registration is open for this programme. Full details are being
                        finalised; the upcoming dates are below.
                      </p>
                    )}

                    <CourseSessionSummary course={course} />

                    <div className="cta-row">
                      <Link
                        href={
                          course.nextSession
                            ? `/register?batchId=${course.nextSession.batchId}`
                            : '/register'
                        }
                        className="btn btn-primary btn-sm"
                      >
                        {course.isFreeProgramme ? 'Register free' : 'Register now'}
                      </Link>
                      <Link
                        href={`/programmes/${course.courseCode}`}
                        className="btn btn-outline btn-sm"
                      >
                        View details
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Why Knowsia</p>
              <h2>Training built to be used, not just attended</h2>
            </div>
            <div className="grid-3">
              {WHY_KNOWSIA.map((item, index) => (
                <div key={item.title} className="feature">
                  <span className="icon-badge">
                    <svg className="icon" aria-hidden>
                      <use href={`#${WHY_ICONS[index] ?? 'm-check'}`} />
                    </svg>
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">How registration works</p>
              <h2>Four steps, a few minutes</h2>
            </div>
            <ol className="steps">
              {HOW_REGISTRATION_WORKS.map((step, index) => (
                <li key={step.title} className="step">
                  <span className="num">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Hidden entirely until real consented testimonials exist — the
            alternative, placeholder quotes on a page selling professional
            certification, is a credibility problem rather than a cosmetic one. */}
        {testimonials.length > 0 && (
          <section className="band band-tint">
            <div className="wrap">
              <div className="band-head">
                <p className="kicker">In their words</p>
                <h2>What our participants say</h2>
              </div>
              <div className="quotes">
                {testimonials.map((testimonial, index) => (
                  <figure key={index} className="quote">
                    <p className="mark" aria-hidden>
                      &ldquo;
                    </p>
                    <blockquote>{testimonial.quote}</blockquote>
                    <figcaption>
                      {testimonial.attributedName ?? 'Anonymous participant'}
                      {testimonial.courseName && <span>{testimonial.courseName}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Questions</p>
              <h2>Frequently asked</h2>
            </div>
            <div className="faq">
              {CATALOG_FAQ.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p className="answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section style={{ paddingBottom: 24 }}>
          <div className="wrap">
            <div className="closer">
              <h2>Ready to build your next professional skill?</h2>
              <p>
                Choose your programme and take the next step towards becoming a more
                capable, confident and future-ready professional.
              </p>
              <div className="hero-cta">
                <Link href="/register" className="btn btn-primary">
                  Register now
                </Link>
                <a
                  href={WHATSAPP_CONTACT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost-light"
                >
                  Chat with us on WhatsApp
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>
            Need help before registering? Call 053 053 1328 or 020 370 1923, or email{' '}
            <a href="mailto:info@knowsia.com">info@knowsia.com</a>
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/verify">Verify a certificate</Link>
            {' · '}
            <Link href="/portal/login">Student portal</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
