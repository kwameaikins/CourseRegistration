import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { KnowsiaHeader } from '@/components/KnowsiaHeader';
import { getRootDestination } from '@/lib/auth/root-destination';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import * as usersService from '@/modules/users/service';

// Root of reg.knowsia.com.
//
// Staff behaviour is unchanged: a signed-in staff member still lands on their
// role's default page (Document 8, Section 9).
//
// What changed (2026-08-17): an ANONYMOUS visitor used to be redirected to
// `/login` — the *staff* sign-in. Anyone who typed the bare domain, or trimmed
// a `/verify` URL off a printed certificate, hit an internal screen with no way
// forward and no explanation. They now get a signpost instead.
//
// Deliberately NOT a marketing page. Marketing lives on knowsia.com by founder
// decision of 2026-08-05 (Coding Docs/course-catalog-integration-plan.md), and
// next.config.ts states this app "keeps only the transactional surface". This
// page sorts a visitor to the thing they came for and sends anyone wanting to
// browse programmes to the marketing site.

const MARKETING_SITE = process.env.MARKETING_SITE_URL ?? 'https://knowsia.com';

export const metadata: Metadata = {
  title: 'Knowsia — Course Registration',
  description:
    'Register for a Knowsia programme, log in to your student portal, or verify a certificate.',
};

const DESTINATIONS = [
  {
    href: '/register',
    title: 'Register for a course',
    body: 'Browse open cohorts and sign up. Takes about two minutes.',
  },
  {
    href: '/portal/login',
    title: 'Student portal',
    body: 'Your class link, payments, receipts and certificates. Log in with your email or phone and your PIN.',
  },
  {
    href: '/verify',
    title: 'Verify a certificate',
    body: 'Check that a Knowsia certificate is genuine using its certificate number.',
  },
  {
    href: '/company-portal/login',
    title: 'Corporate portal',
    body: 'For organisations that have bought seats — add employees and track attendance.',
  },
];

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The routing rule itself lives in lib/auth/root-destination.ts so it can be
  // tested without standing up Supabase — same split as lib/auth/callback.ts.
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <KnowsiaHeader />

      <h1 className="mt-6 text-2xl font-semibold">Welcome to Knowsia</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is where course registration, payments and certificates live. What would you
        like to do?
      </p>

      <div className="mt-8 grid gap-3">
        {DESTINATIONS.map((destination) => (
          <Link
            key={destination.href}
            href={destination.href}
            className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="font-medium">{destination.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {destination.body}
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Looking for course details, dates and fees?{' '}
        <a href={MARKETING_SITE} className="underline">
          Visit knowsia.com
        </a>
      </p>

      {/* Staff previously arrived at the sign-in page automatically, so the
          link has to stay visible now that anonymous visitors land here. */}
      <p className="mt-10 border-t pt-6 text-sm text-muted-foreground">
        Knowsia staff?{' '}
        <Link href="/login" className="underline">
          Sign in here
        </Link>
      </p>
    </main>
  );
}
