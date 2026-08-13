'use client';

// F1.01 — mobile-first, single-column form (Document 8, Section 2).
// Inline validation on blur; submit disabled until DPA consent is checked;
// on a duplicate-registration error the form retains its values.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, apiFetch } from '@/components/api-client';
import { PaystackCheckout } from '@/components/PaystackCheckout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { effectiveCourseFee, formatDate, formatGhs } from '@/lib/utils';
import { SELF_DECLARED_LEAD_SOURCES } from '@/lib/domain/types';

interface BatchOption {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  // Late registration (founder-approved 2026-08-12) — a listed intake may
  // already be running; the window now closes on endDate, not startDate.
  endDate: string;
  hasStarted: boolean;
  courseFee: number;
  // Free event / webinar (2026-08-03) — hides the fee line, the discount
  // preview and the checkout entirely rather than showing them at zero.
  isFree: boolean;
  // Waitlist feature (founder-approved 2026-07-24) — null capacity means
  // unlimited, so seatsRemaining/isFull are also null/false in that case.
  capacity: number | null;
  seatsRemaining: number | null;
  isFull: boolean;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

type RegistrationResult =
  | { outcome: 'registered'; registrationId: string; message: string; courseFee: number }
  | { outcome: 'waitlisted'; waitlistId: string; message: string };

interface CodePreview {
  valid: boolean;
  discountType: 'percentage' | 'fixed_amount' | null;
  discountValue: number | null;
  partnerId: string | null;
  reason?: string;
}

// Derived from the canonical tuple (2026-08-12) rather than repeated here, and
// deliberately the self-declared subset: 'Returning' is assigned by the portal's
// own enrolment path for someone already signed in, never picked off a menu by
// an anonymous visitor.
const LEAD_SOURCES = SELF_DECLARED_LEAD_SOURCES;

const GENDERS = ['Male', 'Female'] as const;

const CONSENT_TEXT =
  'I consent to my personal data (name, email, phone) being stored and used to manage ' +
  'my course registration, payment, and course communications, in line with the Ghana ' +
  'Data Protection Act, 2012 (Act 843). I can request deletion of my data at any time.';

type FieldErrors = Partial<
  Record<
    | 'firstName'
    | 'surname'
    | 'gender'
    | 'email'
    | 'phone'
    | 'jobTitle'
    | 'company'
    | 'batchId'
    | 'leadSource',
    string
  >
>;

const LOGIN_TOKEN_POLL_INTERVAL_MS = 2000;
const LOGIN_TOKEN_POLL_TIMEOUT_MS = 60000;

export function RegistrationForm({ batchOptions }: { batchOptions: BatchOption[] }) {
  const router = useRouter();
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [surname, setSurname] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [batchId, setBatchId] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [codePreview, setCodePreview] = useState<CodePreview | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [isDuplicateRegistration, setIsDuplicateRegistration] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<RegistrationResult | null>(null);
  const [paymentStarted, setPaymentStarted] = useState(false);

  // Preselects the batch when arriving from a "a seat opened up" waitlist
  // email (?batchId=...) — reads window.location directly (rather than
  // next/navigation's useSearchParams, which requires a Suspense boundary
  // this page doesn't have) since this is a one-time read on mount, not
  // something that needs to react to client-side navigation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedBatchId = params.get('batchId');
    if (requestedBatchId && batchOptions.some((option) => option.batchId === requestedBatchId)) {
      setBatchId(requestedBatchId);
    }
    // Tracked-link prefill (Knowsia Growth Partner Programme, 2026-08-02) —
    // app/r/[code] redirects here with ?ref=CODE; the code still has to be
    // typed/confirmed by the visitor (this just saves them re-typing it),
    // and an explicit edit to the field always wins at submit time.
    const referralCode = params.get('ref');
    if (referralCode) setCouponCode(referralCode.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBatch = batchOptions.find((option) => option.batchId === batchId) ?? null;
  // Free event / webinar: no fee, no discount, no checkout — the whole
  // payment side of this form is hidden rather than rendered at GHS 0.00.
  const selectedBatchIsFree = selectedBatch?.isFree ?? false;
  const selectedBatchFee = selectedBatch ? effectiveCourseFee(selectedBatch) : null;
  const selectedBatchHasActiveDiscount =
    selectedBatch !== null && selectedBatchFee !== selectedBatch.courseFee;

  // Live coupon/referral-code preview — debounced, re-runs whenever the code
  // or the selected batch changes (a code can be course-restricted).
  useEffect(() => {
    const trimmed = couponCode.trim();
    if (!trimmed || !batchId) {
      setCodePreview(null);
      return;
    }
    setCheckingCode(true);
    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<CodePreview>('/api/register/preview-code', {
          method: 'POST',
          body: JSON.stringify({ code: trimmed, batchId }),
        });
        setCodePreview(result);
      } catch {
        setCodePreview({ valid: false, discountType: null, discountValue: null, partnerId: null, reason: 'Could not check this code right now.' });
      } finally {
        setCheckingCode(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [couponCode, batchId]);

  // Best-price-wins preview (mirrors the server's rule exactly — see
  // modules/registrations/service.ts): a code discount never stacks with
  // the early-bird price, so show the visitor whichever is actually cheaper.
  const codeDiscountedFee =
    selectedBatch && codePreview?.valid && codePreview.discountType && codePreview.discountValue !== null
      ? codePreview.discountType === 'percentage'
        ? selectedBatch.courseFee * (1 - codePreview.discountValue / 100)
        : Math.max(0, selectedBatch.courseFee - codePreview.discountValue)
      : null;
  const displayedFee =
    codeDiscountedFee !== null && selectedBatchFee !== null
      ? Math.min(codeDiscountedFee, selectedBatchFee)
      : selectedBatchFee;
  const codeBeatsEarlyBird =
    codeDiscountedFee !== null && selectedBatchFee !== null && codeDiscountedFee < selectedBatchFee;

  function validateField(field: keyof FieldErrors): string | undefined {
    switch (field) {
      case 'firstName':
        return firstName.trim().length < 1 ? 'Please enter your first name.' : undefined;
      case 'surname':
        return surname.trim().length < 1 ? 'Please enter your surname.' : undefined;
      case 'gender':
        return gender ? undefined : 'Please select your gender.';
      case 'email':
        return /.+@.+\..+/.test(email) ? undefined : 'Please enter a valid email address.';
      case 'phone':
        return phone.trim().length < 10
          ? 'Please enter a valid phone number (at least 10 digits).'
          : undefined;
      case 'jobTitle':
        return jobTitle.trim().length < 1
          ? 'Please enter your job title, or N/A if not currently employed.'
          : undefined;
      case 'company':
        return company.trim().length < 1
          ? 'Please enter your company/institution, or N/A if not applicable.'
          : undefined;
      case 'batchId':
        return batchId ? undefined : 'Please select a course.';
      case 'leadSource':
        return leadSource ? undefined : 'Please tell us how you heard about us.';
    }
  }

  function handleBlur(field: keyof FieldErrors) {
    setFieldErrors((errors) => ({ ...errors, [field]: validateField(field) }));
  }

  // Founder-approved 2026-07-22: after a self-serve Paystack payment, poll
  // for the webhook to confirm it and mint a portal login token, then log
  // the participant straight into their dashboard — no PIN step. The
  // reference is unguessable (generated client-side, never handed back by
  // the server), so this polling is just politeness/backoff, not a security
  // control. If it never resolves (webhook delayed, or the participant paid
  // by bank transfer/MoMo instead), the existing "payment received" message
  // stays up and the payment_confirmation email already links to
  // /portal/login as a fallback.
  function handlePaymentCompleted(reference: string) {
    setPaymentStarted(true);
    const startedAt = Date.now();
    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > LOGIN_TOKEN_POLL_TIMEOUT_MS) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        return;
      }
      try {
        const result = await apiFetch<{ status: 'ok' | 'pending' | 'invalid' }>(
          '/api/portal/exchange-login-token',
          { method: 'POST', body: JSON.stringify({ reference }) },
        );
        if (result.status === 'ok') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          router.push('/portal');
        } else if (result.status === 'invalid') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      } catch {
        // Transient network error — let the next poll tick try again.
      }
    }, LOGIN_TOKEN_POLL_INTERVAL_MS);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {};
    (
      [
        'firstName',
        'surname',
        'gender',
        'email',
        'phone',
        'jobTitle',
        'company',
        'batchId',
        'leadSource',
      ] as const
    ).forEach((field) => {
      const fieldError = validateField(field);
      if (fieldError) errors[field] = fieldError;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setBannerError(null);
    setIsDuplicateRegistration(false);
    try {
      const result = await apiFetch<RegistrationResult>(
        '/api/registrations',
        {
          method: 'POST',
          body: JSON.stringify({
            firstName: firstName.trim(),
            middleName: middleName.trim(),
            surname: surname.trim(),
            gender,
            email: email.trim(),
            phone: phone.trim(),
            jobTitle: jobTitle.trim(),
            company: company.trim(),
            batchId,
            leadSource,
            consentGiven,
            couponCode: couponCode.trim() || null,
          }),
        },
      );
      setSuccess(result);
    } catch (err) {
      // The form retains its values on error — the participant is not forced
      // to re-enter details (Document 8, Section 2). A duplicate registration
      // means they already have portal access (created at their first
      // registration) — point them there instead of a dead-end error, since
      // that's also where they can pay if they hadn't yet (Issue: previously
      // the only payment link was the one-time success screen, lost forever
      // if they navigated away before paying).
      if (err instanceof ApiError && err.code === 'DUPLICATE_REGISTRATION') {
        setIsDuplicateRegistration(true);
      }
      setBannerError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success?.outcome === 'waitlisted') {
    return (
      <div className="space-y-3 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold text-amber-700">You&apos;re on the waitlist</h2>
        <p className="text-sm">{success.message}</p>
        <p className="text-xs text-muted-foreground">
          We email you the moment a seat opens up, in the order you joined — no action is
          needed from you now.
        </p>
      </div>
    );
  }

  if (success) {
    // A free event is settled the moment it is registered — there is nothing
    // to check out, so this screen confirms and points at the portal instead
    // of offering payment. Keyed on the amount actually owed rather than on
    // isFree alone, so a code that covers the whole fee lands here too.
    const owesNothing = success.courseFee <= 0;
    return (
      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold text-emerald-700">
            {owesNothing ? "You're registered" : 'Registration received'}
          </h2>
          <p className="mt-2 text-sm">{success.message}</p>
        </div>
        {owesNothing && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium text-emerald-700">
              Nothing to pay — your place is confirmed.
            </p>
            <p className="text-xs text-muted-foreground">
              Your joining link is on its way by email, and is always available in your{' '}
              <a href="/portal/login" className="underline">
                student portal
              </a>{' '}
              — log in anytime with your email or phone number and PIN (the last 4 digits
              of your phone number).
            </p>
          </div>
        )}
        {!owesNothing && selectedBatch && !paymentStarted && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Course fee: {formatGhs(success.courseFee)}</p>
            <PaystackCheckout
              registrationId={success.registrationId}
              participantEmail={email.trim().toLowerCase()}
              amountGhs={success.courseFee}
              onCompleted={handlePaymentCompleted}
            />
            <p className="text-xs text-muted-foreground">
              Not ready to pay right now? No problem — log in to your{' '}
              <a href="/portal/login" className="underline">
                student portal
              </a>{' '}
              anytime with your email or phone number and PIN (the last 4 digits of your
              phone number) to pay later. You can also pay by bank transfer or MTN Mobile
              Money (0530531328, or MoMo Pay merchant code 143735) — details are in the
              payment instructions email we just sent you.
            </p>
          </div>
        )}
        {paymentStarted && (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            Payment received — thank you! We&apos;re confirming it now and will take you to
            your student portal automatically. A confirmation email is also on its way —
            it links to{' '}
            <a href="/portal/login" className="underline">
              your portal login
            </a>{' '}
            in case you need it.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Returning-participant nudge (founder-directed 2026-08-13). Everything
          below is already on file for anyone who has registered with us before,
          and the portal can enrol them in one click (BR-42) — so the offer is
          made BEFORE they start typing, which is the only moment it saves them
          anything.

          Deliberately shown to everyone rather than triggered by looking their
          email up: a public "does this address have an account?" check is an
          account-enumeration oracle, and this codebase refuses that everywhere
          it matters (portal login, tutor login, forgot-PIN, staff
          forgot-password all return identical responses precisely so they
          cannot be used to probe who is a participant). A returning student
          reads this line either way; a stranger learns nothing from it. */}
      <p className="rounded-md border border-input bg-muted/40 p-3 text-sm">
        <span className="font-medium">Registered with us before?</span>{' '}
        <a href="/portal/login" className="underline">
          Log in to your student portal
        </a>{' '}
        and use <span className="font-medium">Explore Courses</span> to enrol in one
        click — we already have your details, so there is no form to fill in.
      </p>

      {bannerError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {bannerError}
          {isDuplicateRegistration && (
            <>
              {' '}
              <a href="/portal/login" className="font-medium underline">
                Log in to your student portal
              </a>{' '}
              to check your payment status or pay now.
            </>
          )}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="batchId">Course</Label>
        <select
          id="batchId"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
          onBlur={() => handleBlur('batchId')}
        >
          <option value="">Select a course</option>
          {batchOptions.map((option) => (
            <option key={option.batchId} value={option.batchId}>
              {option.courseName} — {option.cohortLabel} — {formatDate(option.startDate)}
              {option.hasStarted ? ' — in progress' : ''}
              {option.isFree ? ' — Free' : ''}
            </option>
          ))}
        </select>
        {fieldErrors.batchId && (
          <p className="text-sm text-destructive">{fieldErrors.batchId}</p>
        )}
        {selectedBatch && selectedBatchFee !== null && (
          <div className="text-sm text-muted-foreground">
            {selectedBatchIsFree ? (
              <p className="font-medium text-emerald-700">Free — no payment required</p>
            ) : codeBeatsEarlyBird && displayedFee !== null ? (
              <p>
                <span className="line-through">{formatGhs(selectedBatch.courseFee)}</span>{' '}
                <span className="font-medium text-emerald-700">{formatGhs(displayedFee)}</span>{' '}
                — with your code applied
              </p>
            ) : selectedBatchHasActiveDiscount && selectedBatch.discountCutoffDate ? (
              <p>
                <span className="line-through">{formatGhs(selectedBatch.courseFee)}</span>{' '}
                <span className="font-medium text-emerald-700">
                  {formatGhs(selectedBatchFee)}
                </span>{' '}
                — early-bird price if you register by{' '}
                {formatDate(selectedBatch.discountCutoffDate)}
              </p>
            ) : (
              <p>Course fee: {formatGhs(selectedBatchFee)}</p>
            )}
            {selectedBatch.hasStarted && (
              <p className="mt-1 font-medium text-amber-600">
                This intake started on {formatDate(selectedBatch.startDate)} and runs
                until {formatDate(selectedBatch.endDate)}. You can still join, but you
                will have missed the sessions held so far.
              </p>
            )}
            {selectedBatch.isFull ? (
              <p className="mt-1 font-medium text-amber-600">
                This intake is full — submitting will add you to the waitlist instead.
              </p>
            ) : (
              selectedBatch.seatsRemaining !== null &&
              selectedBatch.seatsRemaining <= 5 && (
                <p className="mt-1">Only {selectedBatch.seatsRemaining} seat(s) left.</p>
              )
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="firstName">First Name</Label>
        <Input
          id="firstName"
          value={firstName}
          autoComplete="given-name"
          className={fieldErrors.firstName ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setFirstName(event.target.value)}
          onBlur={() => handleBlur('firstName')}
        />
        {fieldErrors.firstName && (
          <p className="text-sm text-destructive">{fieldErrors.firstName}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="middleName">
          Middle Name <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="middleName"
          value={middleName}
          autoComplete="additional-name"
          className="h-11"
          onChange={(event) => setMiddleName(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="surname">Surname</Label>
        <Input
          id="surname"
          value={surname}
          autoComplete="family-name"
          className={fieldErrors.surname ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setSurname(event.target.value)}
          onBlur={() => handleBlur('surname')}
        />
        {fieldErrors.surname && (
          <p className="text-sm text-destructive">{fieldErrors.surname}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="gender">Gender</Label>
        <select
          id="gender"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          onBlur={() => handleBlur('gender')}
        >
          <option value="">Select gender</option>
          {GENDERS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {fieldErrors.gender && <p className="text-sm text-destructive">{fieldErrors.gender}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          className={fieldErrors.email ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setEmail(event.target.value)}
          onBlur={() => handleBlur('email')}
        />
        {fieldErrors.email && <p className="text-sm text-destructive">{fieldErrors.email}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          autoComplete="tel"
          placeholder="+233…"
          className={fieldErrors.phone ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setPhone(event.target.value)}
          onBlur={() => handleBlur('phone')}
        />
        {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="jobTitle">Job Title / Designation</Label>
        <Input
          id="jobTitle"
          value={jobTitle}
          autoComplete="organization-title"
          placeholder="Enter N/A if not currently employed"
          className={fieldErrors.jobTitle ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setJobTitle(event.target.value)}
          onBlur={() => handleBlur('jobTitle')}
        />
        {fieldErrors.jobTitle && (
          <p className="text-sm text-destructive">{fieldErrors.jobTitle}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="company">Company / Institution</Label>
        <Input
          id="company"
          value={company}
          autoComplete="organization"
          placeholder="Enter N/A if not applicable"
          className={fieldErrors.company ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setCompany(event.target.value)}
          onBlur={() => handleBlur('company')}
        />
        {fieldErrors.company && (
          <p className="text-sm text-destructive">{fieldErrors.company}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="leadSource">How did you hear about us?</Label>
        <select
          id="leadSource"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          value={leadSource}
          onChange={(event) => setLeadSource(event.target.value)}
          onBlur={() => handleBlur('leadSource')}
        >
          <option value="">How did you hear about us?</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        {fieldErrors.leadSource && (
          <p className="text-sm text-destructive">{fieldErrors.leadSource}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="couponCode">
          Coupon / Referral Code <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="couponCode"
          value={couponCode}
          className="h-11 uppercase"
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
        />
        {selectedBatchIsFree && (
          <p className="text-sm text-muted-foreground">
            This event is free, so there is no discount to apply — a code here just credits
            whoever referred you.
          </p>
        )}
        {checkingCode && !selectedBatchIsFree && (
          <p className="text-sm text-muted-foreground">Checking code…</p>
        )}
        {!checkingCode && !selectedBatchIsFree && codePreview?.valid && (
          <p className="text-sm text-emerald-700">Code applied — discount shown above.</p>
        )}
        {!checkingCode && codePreview && !codePreview.valid && (
          <p className="text-sm text-destructive">{codePreview.reason ?? 'This code is not valid.'}</p>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-md border p-4">
        <input
          id="consent"
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={consentGiven}
          onChange={(event) => setConsentGiven(event.target.checked)}
        />
        <Label htmlFor="consent" className="text-sm font-normal leading-snug">
          {CONSENT_TEXT}
        </Label>
      </div>

      {/* BR-15: disabled (visibly greyed), not hidden, until consent given. */}
      <Button type="submit" className="h-11 w-full" disabled={!consentGiven || submitting}>
        {submitting ? 'Submitting…' : 'Complete Registration'}
      </Button>
    </form>
  );
}
