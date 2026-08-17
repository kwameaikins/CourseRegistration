import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import {
  MARKETING_STYLES,
  MarketingIcons,
  WHY_ICONS,
} from '@/components/marketing/marketing-design-system';
import { getRootDestination } from '@/lib/auth/root-destination';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicCourseCatalog } from '@/modules/courses/public-catalog';
import * as feedbackService from '@/modules/feedback/service';
import {
  CATALOG_FAQ,
  HOW_REGISTRATION_WORKS,
  WHY_KNOWSIA,
} from '@/modules/courses/public-content';
import * as usersService from '@/modules/users/service';

// The public home page of reg.knowsia.com.
//
// FOUNDER DECISION 2026-08-17: this app gets its own home page. That amends the
// decision of 2026-08-05 (Coding Docs/course-catalog-integration-plan.md), which
// made knowsia.com the canonical marketing surface and left this app "only the
// transactional surface". knowsia.com is deferred until the question bank and AI
// tutor are finished; until then the live business needs a front door, and this
// is it. See the "Amendment" section in that document for the consequences —
// most importantly that RETIRE_PROGRAMMES_REDIRECT must stay OFF, because
// /programmes is now this page's primary destination.
//
// Staff behaviour is unchanged: a signed-in staff member is redirected to their
// role's default screen (Document 8, Section 9), so nobody's daily entry point
// moved.

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

export const metadata: Metadata = {
  title: 'Knowsia — Live Professional Training for Finance Professionals in Ghana',
  description:
    'Live, expert-led training in financial reporting, ESG, risk, audit and tax. Taught by practising chartered accountants, with a verifiable certificate. See open cohorts, dates and fees.',
  alternates: { canonical: APP_URL },
  openGraph: {
    title: 'Knowsia — Live Professional Training',
    description:
      'Live, expert-led training in financial reporting, ESG, risk, audit and tax, with a verifiable certificate.',
    url: APP_URL,
    siteName: 'Knowsia',
    type: 'website',
  },
};

const WHATSAPP_CONTACT_URL =
  process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL ?? 'https://wa.me/233530531328';

const TRUST_POINTS = [
  { icon: 'm-live', label: 'Live expert-led training' },
  { icon: 'm-hands', label: 'Practical exercises' },
  { icon: 'm-award', label: 'Professional certificate' },
  { icon: 'm-shield', label: 'Verifiable credentials' },
];

// Three segments, not the full audience list from every programme — a home page
// sorts visitors, the programme page qualifies them.
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

// Where an existing participant goes. Kept low on the page because the hero
// already carries a Student login link — this is for people who scroll looking
// for it rather than the primary path.
const RETURNING = [
  {
    href: '/portal/login',
    title: 'Student portal',
    body: 'Your class link, payments, receipts and certificates.',
  },
  {
    href: '/verify',
    title: 'Verify a certificate',
    body: 'Check that a Knowsia certificate is genuine.',
  },
  {
    href: '/company-portal/login',
    title: 'Corporate portal',
    body: 'Manage your organisation’s seats and employees.',
  },
];

export default async function HomePage() {
  // Most visitors to a public marketing page carry no Supabase cookie at all,
  // so checking for one first avoids an auth round-trip on the common path.
  // A forged cookie costs nothing: getUser() simply fails and we fall through
  // to the public page.
  const cookieStore = await cookies();
  const hasSessionCookie = cookieStore.getAll().some((cookie) => cookie.name.startsWith('sb-'));

  if (hasSessionCookie) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const staffUser = user ? await usersService.getCurrentStaffUser() : null;
    const destination = getRootDestination({
      isAuthenticated: Boolean(user),
      staffRole: staffUser?.role ?? null,
      accountStatus:
        user && !staffUser ? await usersService.getStaffAccountStatus() : 'active',
    });

    if (destination.kind === 'redirect') {
      redirect(destination.to);
    }
  }

  // Same read the catalogue uses, so a fee or a date can never differ between
  // this page and the programme page. Testimonials fail soft — a visitor came
  // for the training, not the quotes.
  const [allCourses, testimonials] = await Promise.all([
    getPublicCourseCatalog(),
    feedbackService.getPublishableTestimonials(3).catch((err) => {
      console.error('[home testimonials]', err);
      return [];
    }),
  ]);

  // Never advertise a programme with no cohort open (founder rule 2026-08-04);
  // cap at four so the page stays scannable.
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

        {/* Real participant quotes only. Hidden entirely when there are none,
            rather than filled with placeholder praise on a page selling
            professional certification. */}
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

        {/* The root used to redirect anonymous visitors to the STAFF sign-in,
            which stranded anyone who typed the bare domain or trimmed a /verify
            URL off a printed certificate. This band is where those people now
            land instead. */}
        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Already registered?</p>
              <h2>Pick up where you left off</h2>
            </div>
            <div className="grid-3">
              {RETURNING.map((item) => (
                <Link key={item.href} href={item.href} className="feature">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </Link>
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
            <Link href="/programmes">All programmes</Link>
            {' · '}
            <Link href="/verify">Verify a certificate</Link>
            {' · '}
            <Link href="/portal/login">Student portal</Link>
            {' · '}
            <Link href="/login">Staff sign in</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
