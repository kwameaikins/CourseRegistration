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

// PREVIEW ONLY — NOT A PUBLIC PAGE.
//
// This renders the proposed knowsia.com home page with the real design system
// and live cohort data, so the founder can see the actual thing before it is
// rebuilt in WordPress, and so the WordPress build has an exact target.
//
// It is deliberately `noindex, nofollow` and linked from nowhere. The marketing
// home page belongs on knowsia.com: founder decision 2026-08-05 recorded in
// Coding Docs/course-catalog-integration-plan.md ("knowsia.com becomes the
// canonical catalogue"), and next.config.ts states this app "keeps only the
// transactional surface (/register and onward)". A second indexable home page
// here would split the brand's SEO signal and re-create the duplicate-content
// problem that plan calls out by name.
//
// WHY IT EXISTS AT ALL: knowsia.com's current home page sells the exam-prep
// platform and a tutor marketplace — a product that has not launched — while
// the live business taking real money (expert-led cohorts, real dates, real
// fees) appears nowhere on it. This page is what the alternative looks like.
//
// Every "See all programmes" link below points at /programmes for the preview.
// On knowsia.com they point at knowsia.com/programmes, which is what the
// already-written wordpress/knowsia-programmes plugin serves.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Home page preview | Knowsia',
  robots: { index: false, follow: false },
};

const WHATSAPP_CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL ?? 'https://wa.me/233530531328';

const TRUST_POINTS = [
  { icon: 'm-live', label: 'Live expert-led training' },
  { icon: 'm-hands', label: 'Practical exercises' },
  { icon: 'm-award', label: 'Professional certificate' },
  { icon: 'm-shield', label: 'Verifiable credentials' },
];

// Home-page audience segments. Deliberately three, not the full audience list
// from every programme — a home page sorts visitors, the programme page
// qualifies them.
const AUDIENCE = [
  {
    icon: 'm-users',
    title: 'Accountants and finance professionals',
    body: 'Controllers, finance officers, FP&A analysts and finance managers who prepare, review or present financial information.',
  },
  {
    icon: 'm-shield',
    title: 'Auditors, risk and tax practitioners',
    body: 'Internal and external auditors, risk officers, compliance professionals and tax practitioners advising organisations.',
  },
  {
    icon: 'm-hands',
    title: 'Business owners and management',
    body: 'Owners, directors and management teams accountable for governance, tax position and the numbers their organisation reports.',
  },
];

export default async function HomePreviewPage() {
  // Same read the catalogue uses, so a fee or a date can never differ between
  // the home page and the programme page. Testimonials fail soft — a visitor
  // came for the training, not the quotes.
  const [allCourses, testimonials] = await Promise.all([
    getPublicCourseCatalog(),
    feedbackService.getPublishableTestimonials(3).catch((err) => {
      console.error('[home-preview testimonials]', err);
      return [];
    }),
  ]);

  // Never advertise a programme with no cohort open (founder rule 2026-08-04),
  // and keep the home page to the first four so it stays scannable — the
  // catalogue page is where the full list lives.
  const courses = allCourses.filter((course) => course.sessions.length > 0);
  const featured = courses.slice(0, 4);

  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#cohorts" className="skip">
        Skip to open programmes
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

          <p className="eyebrow">Professional training · Ghana</p>
          <h1>Advance your career with practical, future-ready skills</h1>
          <p className="lede">
            Live, expert-led training in financial reporting, ESG, risk, audit and tax —
            taught by practising chartered accountants, with a verifiable certificate at
            the end.
          </p>

          <div className="hero-cta">
            <a href="#cohorts" className="btn btn-primary">
              See open programmes
              <svg className="icon" aria-hidden>
                <use href="#m-arrow" />
              </svg>
            </a>
            <a
              href={WHATSAPP_CONTACT_URL}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost-light"
            >
              Talk to us on WhatsApp
            </a>
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

      <main>
        {/* The section the live home page does not have: what you can actually
            book, with real dates and real prices. */}
        <section className="band" id="cohorts">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Open for registration</p>
              <h2>Programmes you can join now</h2>
              <p>
                Every programme below has a cohort open today. Dates, fees and remaining
                places are live — nothing here is a brochure figure.
              </p>
            </div>

            {featured.length === 0 ? (
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
              <>
                <div className="cards">
                  {featured.map((course) => (
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

                {courses.length > featured.length && (
                  <div style={{ marginTop: 28, textAlign: 'center' }}>
                    <Link href="/programmes" className="btn btn-outline">
                      See all {courses.length} programmes
                      <svg className="icon" aria-hidden>
                        <use href="#m-arrow" />
                      </svg>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Who it is for</p>
              <h2>Built for people who own the numbers</h2>
            </div>
            <div className="grid-3">
              {AUDIENCE.map((segment) => (
                <div key={segment.title} className="feature">
                  <span className="icon-badge">
                    <svg className="icon" aria-hidden>
                      <use href={`#${segment.icon}`} />
                    </svg>
                  </span>
                  <h3>{segment.title}</h3>
                  <p>{segment.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band">
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

        <section className="band band-tint">
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

        {/* Real participant quotes only. The section is hidden entirely when
            there are none, rather than filled with placeholder praise on a page
            selling professional certification. */}
        {testimonials.length > 0 && (
          <section className="band">
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

        {/* Corporate seats are sold today and the live home page never mentions
            them, which leaves the highest-value enquiry with nowhere to land. */}
        <section className="band band-tint">
          <div className="wrap">
            <div className="callout">
              <h2 style={{ fontSize: '1.5rem' }}>Training a team?</h2>
              <p style={{ marginTop: 10, color: 'var(--ink-muted)' }}>
                Buy seats for your organisation and add colleagues as you go. You get a
                corporate portal to track attendance, download certificates and manage
                everyone from one account — and a discount on group registrations.
              </p>
              <div style={{ marginTop: 18 }}>
                <a
                  href={WHATSAPP_CONTACT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Talk to us about team training
                </a>
              </div>
            </div>
          </div>
        </section>

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
                Choose a programme and take the next step towards becoming a more capable,
                confident and future-ready professional.
              </p>
              <div className="hero-cta">
                <a href="#cohorts" className="btn btn-primary">
                  See open programmes
                </a>
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
            Questions before registering? Call 053 053 1328 or 020 370 1923, or email{' '}
            <a href="mailto:info@knowsia.com">info@knowsia.com</a>
          </p>
          <p style={{ marginTop: 10 }}>
            <Link href="/verify">Verify a certificate</Link>
            {' · '}
            <Link href="/portal/login">Student portal</Link>
            {' · '}
            <Link href="/programmes">All programmes</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
