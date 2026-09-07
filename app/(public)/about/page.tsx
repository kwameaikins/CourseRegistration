import type { Metadata } from 'next';
import Link from 'next/link';

import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MARKETING_STYLES, MarketingIcons } from '@/components/marketing/marketing-design-system';
import { appUrl } from '@/lib/app-url';

// /about — ported from knowsia.com/about/ on 2026-09-04 (Coding Docs/20,
// Phase 2: content parity before the WordPress site is retired). The copy is
// the founder's own from the WordPress page, trimmed to what this platform
// actually offers today: the parent consultancy's service lines and the
// features still "coming soon" on WordPress are left out rather than
// promised here. The legacy URL /about/ 301s to this page at cutover.

const APP_URL = appUrl();

export const metadata: Metadata = {
  title: 'About Knowsia | Professional education, made easier to pass',
  description:
    'Knowsia is an African EdTech platform helping accountants and finance professionals learn, teach and earn — expert-led tuition, a question bank for ICAG, ICAN, ACCA and CIMA, and practical CPD training.',
  alternates: { canonical: `${APP_URL}/about` },
  openGraph: {
    title: 'About Knowsia',
    description: 'Make professional education easy to access — and easier to pass.',
    url: `${APP_URL}/about`,
    siteName: 'Knowsia',
    type: 'website',
  },
};

const OFFERINGS = [
  {
    icon: 'm-live',
    title: 'Expert tuition',
    body: 'Learn from experienced tutors who make complex topics clear and practical. Build confidence, master exam techniques, and prepare smarter — not harder.',
  },
  {
    icon: 'm-check',
    title: 'Question bank',
    body: 'A rich library of past questions, mock exams and topic-based materials for professional programmes including ICAG, ICAN, CIBG, CITG, ACCA and CIMA — organised by topic, level and tag for stress-free study.',
  },
  {
    icon: 'm-award',
    title: 'Continuing professional development',
    body: 'Stay career-ready with practical CPD programmes that build the business, accounting and digital skills you can apply at work the next day.',
  },
];

const VALUES = [
  { title: 'Excellence', body: 'We uphold the highest standards of quality in education, training and service delivery.' },
  { title: 'Innovation', body: 'We foster a culture of continuous innovation to stay at the forefront of industry advancements.' },
  { title: 'Empowerment', body: 'We empower individuals to take charge of their learning journey and professional growth.' },
  { title: 'Integrity', body: 'We conduct ourselves with the utmost honesty, transparency and ethical conduct.' },
  { title: 'Diversity', body: 'We embrace diversity in all its forms, recognising the value it brings to our community.' },
];

const TEAM = [
  { name: 'Stephen Kwame Aikins', role: 'CA · CEO and Founder' },
  { name: 'Isaac Adjin Bonney', role: 'BBA, MFC, CA, CFIP, CPFA, ACFE, MIPA, AFA, MIFA, MIIA, MIOD, MISACA' },
  { name: 'Prospero Killian Ametefee', role: 'MBA, CFIP' },
];

const FAQ = [
  {
    question: 'What is Knowsia?',
    answer:
      'Knowsia is an African professional learning platform that makes education easy to access — and easier to pass. We bring together tutors, learners and technology through three offerings: expert-led tuition, a comprehensive question bank for exam practice, and practical CPD programmes for career growth.',
  },
  {
    question: 'What kind of tuition does Knowsia provide?',
    answer:
      'Our programmes are led by practising chartered accountants and experienced tutors who break complex professional topics into clear, practical lessons. Live cohorts run over Zoom, so you can join from anywhere with a laptop or a phone.',
  },
  {
    question: 'Will I get a certificate after completing a programme?',
    answer:
      'Yes. Every paid programme comes with a certificate of completion that carries a verification number and QR code. Anyone can confirm it is genuine on our verification page, and you can add it to your LinkedIn profile in one click from your student portal.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Mobile money, debit card or bank transfer. Card and mobile-money payments are confirmed instantly; for bank transfers you upload the payment slip in your student portal and we confirm it. Clear payment instructions are sent the moment your registration is confirmed.',
  },
  {
    question: 'Who are the tutors?',
    answer:
      'Chartered professionals, experienced lecturers and industry practitioners who have guided thousands of students through their exams. Each brings real-world experience, deep subject knowledge and a genuine interest in seeing you succeed.',
  },
  {
    question: 'Can organisations partner with Knowsia?',
    answer:
      'Yes. Employers buy seats for their teams and manage everyone from a corporate portal, and training institutions and professional bodies can work with us on custom learning. Email info@knowsia.com to start the conversation.',
  },
];

export default function AboutPage() {
  return (
    <div className="mk">
      <style>{MARKETING_STYLES}</style>
      <MarketingIcons />
      <a href="#about" className="skip">
        Skip to content
      </a>

      <MarketingNav current="/about" />

      <header className="hero" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <p className="eyebrow">About us</p>
          <h1 style={{ maxWidth: '24ch' }}>
            We make professional education easy to access — and easier to pass.
          </h1>
          <p className="lede">
            Many professional students struggle to pass tough exams like ICAG, ICAN, ACCA and CIMA
            because of confusing materials, a lack of structure, and study stress. At Knowsia we
            simplify the journey — helping you learn smarter, pass faster, and grow your career.
          </p>
        </div>
      </header>

      <main id="about">
        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">What we do</p>
              <h2>Learn, teach and earn</h2>
              <p>
                We are an African EdTech platform that empowers learners and tutors through guided
                tuition, digital tools and an active learning community. Our mission is simple:
                make professional education easy to access — and easier to pass.
              </p>
            </div>
            <div className="grid-3">
              {OFFERINGS.map((item) => (
                <div key={item.title} className="feature">
                  <span className="icon-badge">
                    <svg className="icon" aria-hidden>
                      <use href={`#${item.icon}`} />
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
            <div className="quotes">
              <figure className="quote">
                <p className="mark" aria-hidden>
                  &ldquo;
                </p>
                <blockquote>
                  To create Africa&rsquo;s most trusted ecosystem where professionals learn, teach and
                  earn to transform their future.
                </blockquote>
                <figcaption>Our vision</figcaption>
              </figure>
              <figure className="quote">
                <p className="mark" aria-hidden>
                  &ldquo;
                </p>
                <blockquote>
                  We combine expert guidance, smart technology and community support to help you
                  achieve one goal: pass with confidence and build a career that matters.
                </blockquote>
                <figcaption>Our promise</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Core values</p>
              <h2>What we hold ourselves to</h2>
            </div>
            <ol className="steps">
              {VALUES.map((value, index) => (
                <li key={value.title} className="step">
                  <span className="num">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{value.title}</h3>
                  <p>{value.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band band-tint">
          <div className="wrap">
            <div className="band-head">
              <p className="kicker">Our team</p>
              <h2>Practitioners first</h2>
              <p>
                Knowsia Professional Institute is an online institution in Ghana. The people
                behind it teach what they practise.
              </p>
            </div>
            <div className="grid-3">
              {TEAM.map((member) => (
                <div key={member.name} className="feature">
                  <span className="icon-badge">
                    <svg className="icon" aria-hidden>
                      <use href="#m-users" />
                    </svg>
                  </span>
                  <h3>{member.name}</h3>
                  <p>{member.role}</p>
                </div>
              ))}
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
              {FAQ.map((item) => (
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
              <h2>Join the movement</h2>
              <p>
                Knowsia is more than a platform — it is a mission to make success in professional
                education achievable for everyone. Start learning today and experience the
                difference.
              </p>
              <div className="hero-cta">
                <Link href="/programmes" className="btn btn-primary">
                  See open programmes
                </Link>
                <Link href="/contact" className="btn btn-ghost-light">
                  Talk to us
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
