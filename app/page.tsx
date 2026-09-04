import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CourseRating } from '@/app/(public)/programmes/CourseRating';
import { CourseSessionSummary } from '@/app/(public)/programmes/CourseSessionSummary';
import { EnquiryForm } from '@/components/EnquiryForm';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { TrackedLink } from '@/components/marketing/TrackedLink';
import {
  MARKETING_STYLES,
  MarketingIcons,
  WHY_ICONS,
} from '@/components/marketing/marketing-design-system';
import { appUrl } from '@/lib/app-url';
import { getRootDestination } from '@/lib/auth/root-destination';
import {
  ORGANISATION_EMAIL,
  ORGANISATION_NAME,
  ORGANISATION_PHONES,
  whatsappUrl,
} from '@/lib/organisation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicCourseCatalog } from '@/modules/courses/public-catalog';
import * as feedbackService from '@/modules/feedback/service';
import {
  CATALOG_FAQ,
  HOW_REGISTRATION_WORKS,
  WHY_KNOWSIA,
} from '@/modules/courses/public-content';
import * as usersService from '@/modules/users/service';

// The home page of knowsia.com (reg.knowsia.com until the Doc 20 cutover).
//
// Rebuilt 2026-09-04 for the domain consolidation. It replaces two pages that
// did different jobs: this app's home (one product, live cohorts) and the
// WordPress home (everything at once). It is one page with two doors — live
// programmes here, the question bank on the study platform — and everything
// below the hero sorts visitors rather than selling all four offerings at
// equal volume.
//
// Two founder rules survive from the previous version and are enforced by
// the data reads, not by copy: never advertise a programme with no cohort
// open, and never show a testimonial that is not a real, consented quote.
//
// Staff behaviour is unchanged: a signed-in staff member is redirected to
// their role's default screen (Document 8, Section 9).

export const dynamic = 'force-dynamic';

const APP_URL = appUrl();

export const metadata: Metadata = {
  title: 'Knowsia — Professional Tuition, Training and Question Bank for Finance Professionals',
  description:
    'Knowsia Professional Institute: live expert-led training, exam tuition and a past-questions bank for ICAG, ICAN, ACCA and CIMA candidates, and CPD that counts. Taught by practising chartered accountants, with a verifiable certificate.',
  alternates: { canonical: APP_URL },
  openGraph: {
    title: 'Knowsia — Professional education, made easier to pass',
    description:
      'Live training, exam tuition, a question bank and CPD for accountants and finance professionals in Ghana and across Africa.',
    url: APP_URL,
    siteName: 'Knowsia',
    type: 'website',
  },
};

const WHATSAPP_CONTACT_URL = whatsappUrl();

// A real, published past question from the bank, shown as a taste of what
// the study platform holds. Chosen for being short enough to read on a
// phone; the answer and explanation stay on the platform, which is the point.
// Refresh it from time to time from m3_questions (approved AND published).
const EXAMPLE_QUESTION = {
  paper: 'Advanced Taxation',
  level: 'ICAG Level 3',
  sitting: 'November 2024',
  reference: 'Question 4(b)',
  marks: 5,
  text: 'Expansionary fiscal policy has been criticised on the grounds that it can lead to "crowding out". Explain, with appropriate examples, what is meant by "crowding out" as used under fiscal policy.',
};

// The study platform. Served at /learn on this host today (rewrite) and at
// app.knowsia.com after Phase 1 (redirect) — both resolve these paths.
const STUDY = {
  register: '/learn/register',
  login: '/learn/login',
  catalogue: '/learn/catalogue',
};

const TRUST_POINTS = [
  { icon: 'm-live', label: 'Live, expert-led training' },
  { icon: 'm-check', label: 'Past questions with model answers' },
  { icon: 'm-award', label: 'CPD hours on every certificate' },
  { icon: 'm-shield', label: 'Certificates anyone can verify' },
];

// What we do — the four things a visitor can actually act on today. Each
// door goes to something that exists, not to a "coming soon".
const OFFERINGS = [
  {
    icon: 'm-live',
    title: 'Live professional programmes',
    body: 'Short, practical cohorts in financial reporting, tax, ESG, risk, audit and AI for finance, taught live over Zoom by practising chartered accountants. Dates, fees and places are shown live.',
    href: '#cohorts',
    label: 'See open programmes',
    event: 'home_offering_programmes',
  },
  {
    icon: 'm-users',
    title: 'Professional exam tuition',
    body: 'Structured preparation for ICAG and other professional examinations, level by level, with examination technique built in. Tuition cohorts appear in the programme list whenever one is open.',
    href: '/programmes',
    label: 'Browse programmes',
    event: 'home_offering_tuition',
  },
  {
    icon: 'm-check',
    title: 'Question bank and mock exams',
    body: 'Past questions organised by paper, level, sitting and topic, with model answers and explanations. Practise on your phone or laptop and track the topics that need work.',
    href: STUDY.register,
    label: 'Start a free 14-day trial',
    event: 'home_offering_question_bank',
  },
  {
    icon: 'm-award',
    title: 'CPD and certificates',
    body: 'Every paid programme carries CPD hours and ends with a certificate that employers, institutes and clients can verify online in seconds.',
    href: '/verify',
    label: 'Verify a certificate',
    event: 'home_offering_cpd',
  },
];

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
    title: 'Students of the professional bodies',
    body: 'Candidates for ICAG, ICAN, ACCA and CIMA who want structure, past questions and someone who has passed the exam to learn from.',
  },
];

const RETURNING = [
  { href: '/portal/login', title: 'Student portal', body: 'Your class link, payments, receipts and certificates.' },
  { href: STUDY.login, title: 'Study platform', body: 'Question bank, mock exams and your study plan. Cohort students sign in with their email and PIN.' },
  { href: '/company-portal/login', title: 'Corporate portal', body: 'Manage your organisation’s seats and employees.' },
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
  // this page and the programme page. Both reads fail soft: a database
  // hiccup shows the "cohorts are being scheduled" callout and no quotes,
  // never a 500 on the front door — the one page a search engine and every
  // advert points at (caught locally 2026-09-04).
  const [allCourses, testimonials] = await Promise.all([
    getPublicCourseCatalog().catch((err: unknown) => {
      console.error('[home catalogue]', err);
      return [] as Awaited<ReturnType<typeof getPublicCourseCatalog>>;
    }),
    feedbackService.getPublishableTestimonials(3).catch((err: unknown) => {
      console.error('[home testimonials]', err);
      return [] as Awaited<ReturnType<typeof feedbackService.getPublishableTestimonials>>;
    }),
  ]);

  // Never advertise a programme with no cohort open (founder rule 2026-08-04);
  // cap at four so the page stays scannable.
  const courses = allCourses.filter((course) => course.sessions.length > 0);
  const featured = courses.slice(0, 4);

  // Organisation markup with the legal name, so a brand search shows the
  // institute rather than a bare wordmark.
  const organisationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: ORGANISATION_NAME,
    alternateName: 'Knowsia',
    url: APP_URL,
    logo: `${APP_URL}/knowsia-logo.png`,
    email: ORGANISATION_EMAIL,
    telephone: ORGANISATION_PHONES[1].tel,
    address: { '@type': 'PostalAddress', addressLocality: 'Accra', addressCountry: 'GH' },
    sameAs: ['https://www.linkedin.com/company/66631112', 'https://www.youtube.com/@knowsia1'],
  };

  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
      />
      <a href="#what-we-do" className="skip">
        Skip to content
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

          <p className="eyebrow">{ORGANISATION_NAME} · Accra</p>
          <h1>Professional education, made easier to pass</h1>
          <p className="lede">
            Live, expert-led training for finance professionals, exam tuition and a
            past-questions bank for ICAG, ICAN, ACCA and CIMA candidates, and CPD that
            counts — taught by practising chartered accountants, with a certificate anyone
            can verify.
          </p>

          <div className="hero-cta">
            <TrackedLink href="#cohorts" event="home_hero_programmes" className="btn btn-primary">
              See open programmes
              <svg className="icon" aria-hidden>
                <use href="#m-arrow" />
              </svg>
            </TrackedLink>
            <TrackedLink
              href={STUDY.register}
              event="home_hero_question_bank"
              className="btn btn-ghost-light"
            >
              Practise past questions
            </TrackedLink>
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
        <section className="band" id="what-we-do">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">What we do</p>
              <h2>Four ways to learn, one place to prove it</h2>
              <p>
                Everything Knowsia offers is built around one goal: help you pass, then help you
                perform. Pick the door that fits where you are.
              </p>
            </div>
            <div className="cards">
              {OFFERINGS.map((item) => (
                <article key={item.title} className="card">
                  <div className="card-top">
                    <span className="icon-badge">
                      <svg className="icon" aria-hidden>
                        <use href={`#${item.icon}`} />
                      </svg>
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="blurb">{item.body}</p>
                  <div className="cta-row">
                    <TrackedLink href={item.href} event={item.event} className="btn btn-outline btn-sm">
                      {item.label}
                    </TrackedLink>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="band band-tint" id="cohorts">
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
                  <TrackedLink
                    href={WHATSAPP_CONTACT_URL}
                    event="home_whatsapp"
                    external
                    className="btn btn-outline btn-sm"
                  >
                    Chat with us on WhatsApp
                  </TrackedLink>
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

                      <CourseRating rating={course.rating} />

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
                        <TrackedLink
                          href={
                            course.nextSession
                              ? `/register?batchId=${course.nextSession.batchId}`
                              : '/register'
                          }
                          event="home_register_click"
                          className="btn btn-primary btn-sm"
                        >
                          {course.isFreeProgramme ? 'Register free' : 'Register now'}
                        </TrackedLink>
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

        <section className="band" id="question-bank">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Question bank</p>
              <h2>Practise the way the examiner marks</h2>
              <p>
                Past questions from the professional bodies, filed by paper, level, sitting and
                topic, each with a model answer and an explanation of what earns the marks.
                Attempt them, see where you lose marks, and let your study plan follow the
                topics that need work.
              </p>
            </div>
            <div className="grid-3">
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-check" />
                  </svg>
                </span>
                <h3>Real past questions</h3>
                <p>
                  Sourced from the institutes’ own papers and examiner reports, reviewed before
                  publication, and organised the way the syllabus is.
                </p>
              </div>
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-calendar" />
                  </svg>
                </span>
                <h3>Mock exams and study plans</h3>
                <p>
                  Sit timed mocks, track your scores by topic, and get a week-by-week plan
                  built from your own gaps.
                </p>
              </div>
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-support" />
                  </svg>
                </span>
                <h3>Free to start</h3>
                <p>
                  Create an account and practise free for 14 days. Cohort students sign in with
                  the same email and PIN they use for their portal.
                </p>
              </div>
            </div>
            <div className="detail-grid" style={{ marginTop: 32 }}>
              <article className="card">
                <div className="card-top">
                  <h3>An example from the bank</h3>
                  <span className="tag tag-code">{EXAMPLE_QUESTION.marks} marks</span>
                </div>
                <p className="promise">
                  {EXAMPLE_QUESTION.paper} · {EXAMPLE_QUESTION.level} · {EXAMPLE_QUESTION.sitting} ·{' '}
                  {EXAMPLE_QUESTION.reference}
                </p>
                <p className="blurb">{EXAMPLE_QUESTION.text}</p>
                <div className="cta-row">
                  <TrackedLink href={STUDY.register} event="home_qb_example" className="btn btn-primary btn-sm">
                    See the model answer
                  </TrackedLink>
                </div>
              </article>
              <div className="callout">
                <h3>How a practice session works</h3>
                <ul className="list">
                  <li>
                    <svg className="icon" aria-hidden>
                      <use href="#m-check" />
                    </svg>
                    <span>Filter by paper, level, sitting or topic and attempt the question.</span>
                  </li>
                  <li>
                    <svg className="icon" aria-hidden>
                      <use href="#m-check" />
                    </svg>
                    <span>Compare your answer with the model answer and the marking points.</span>
                  </li>
                  <li>
                    <svg className="icon" aria-hidden>
                      <use href="#m-check" />
                    </svg>
                    <span>Your topic scores update, and your study plan follows the gaps.</span>
                  </li>
                </ul>
              </div>
            </div>
            <div style={{ marginTop: 28, textAlign: 'center' }} className="hero-cta">
              <TrackedLink href={STUDY.register} event="home_qb_register" className="btn btn-primary">
                Start a free 14-day trial
              </TrackedLink>
              <TrackedLink href={STUDY.catalogue} event="home_qb_catalogue" className="btn btn-outline">
                Browse self-paced courses
              </TrackedLink>
            </div>
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
            <div className="band-head">
              <p className="kicker">Work with Knowsia</p>
              <h2>For organisations, tutors and partners</h2>
            </div>
            <div className="grid-3">
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-users" />
                  </svg>
                </span>
                <h3>Training a team?</h3>
                <p>
                  Buy seats for your organisation, add colleagues as you go, and track
                  attendance and certificates from a corporate portal — with a discount on
                  group registrations.
                </p>
                <p style={{ marginTop: 12 }}>
                  <TrackedLink
                    href={WHATSAPP_CONTACT_URL}
                    event="home_team_training"
                    external
                    className="btn btn-outline btn-sm"
                  >
                    Talk to us about team training
                  </TrackedLink>
                </p>
              </div>
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-hands" />
                  </svg>
                </span>
                <h3>Teach with Knowsia</h3>
                <p>
                  Practising professionals and experienced lecturers facilitate our programmes.
                  If you can make a hard topic clear, we would like to hear from you.
                </p>
                <p style={{ marginTop: 12 }}>
                  <Link href="/contact" className="btn btn-outline btn-sm">
                    Get in touch
                  </Link>
                </p>
              </div>
              <div className="feature">
                <span className="icon-badge">
                  <svg className="icon" aria-hidden>
                    <use href="#m-award" />
                  </svg>
                </span>
                <h3>Partner programme</h3>
                <p>
                  Refer professionals and organisations to Knowsia programmes and earn a
                  commission on every completed registration, tracked in your own portal.
                </p>
                <p style={{ marginTop: 12 }}>
                  <Link href="/partners/apply" className="btn btn-outline btn-sm">
                    Apply as a partner
                  </Link>
                </p>
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
            <div style={{ maxWidth: 720, margin: '28px auto 0' }}>
              <EnquiryForm />
            </div>
          </div>
        </section>

        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Already with us?</p>
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
              <h2>Ready to pass with confidence?</h2>
              <p>
                Choose a programme, or start practising past questions today, and take the
                next step towards a more capable, confident and future-ready career.
              </p>
              <div className="hero-cta">
                <TrackedLink href="#cohorts" event="home_closer_programmes" className="btn btn-primary">
                  See open programmes
                </TrackedLink>
                <TrackedLink
                  href={STUDY.register}
                  event="home_closer_question_bank"
                  className="btn btn-ghost-light"
                >
                  Practise past questions
                </TrackedLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
