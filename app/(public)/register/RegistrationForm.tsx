'use client';

// F1.01 — mobile-first, single-column form (Document 8, Section 2).
// Inline validation on blur; submit disabled until DPA consent is checked;
// on a duplicate-registration error the form retains its values.
import { useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { PaystackCheckout } from '@/components/PaystackCheckout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate, formatGhs } from '@/lib/utils';

interface BatchOption {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  courseFee: number;
}

const LEAD_SOURCES = [
  'WhatsApp',
  'Facebook',
  'LinkedIn',
  'Referral',
  'Website',
  'Other',
] as const;

const CONSENT_TEXT =
  'I consent to my personal data (name, email, phone) being stored and used to manage ' +
  'my course registration, payment, and course communications, in line with the Ghana ' +
  'Data Protection Act, 2012 (Act 843). I can request deletion of my data at any time.';

type FieldErrors = Partial<Record<'fullName' | 'email' | 'phone' | 'batchId' | 'leadSource', string>>;

export function RegistrationForm({ batchOptions }: { batchOptions: BatchOption[] }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [batchId, setBatchId] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    registrationId: string;
    message: string;
  } | null>(null);
  const [paymentStarted, setPaymentStarted] = useState(false);

  const selectedBatch = batchOptions.find((option) => option.batchId === batchId) ?? null;

  function validateField(field: keyof FieldErrors): string | undefined {
    switch (field) {
      case 'fullName':
        return fullName.trim().length < 2 ? 'Please enter your full name.' : undefined;
      case 'email':
        return /.+@.+\..+/.test(email) ? undefined : 'Please enter a valid email address.';
      case 'phone':
        return phone.trim().length < 10
          ? 'Please enter a valid phone number (at least 10 digits).'
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors: FieldErrors = {};
    (['fullName', 'email', 'phone', 'batchId', 'leadSource'] as const).forEach((field) => {
      const fieldError = validateField(field);
      if (fieldError) errors[field] = fieldError;
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setBannerError(null);
    try {
      const result = await apiFetch<{ registrationId: string; message: string }>(
        '/api/registrations',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            batchId,
            leadSource,
            consentGiven,
          }),
        },
      );
      setSuccess(result);
    } catch (err) {
      // The form retains its values on error — the participant is not forced
      // to re-enter details (Document 8, Section 2).
      setBannerError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold text-emerald-700">
            Registration received
          </h2>
          <p className="mt-2 text-sm">{success.message}</p>
        </div>
        {selectedBatch && !paymentStarted && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">
              Course fee: {formatGhs(selectedBatch.courseFee)}
            </p>
            <PaystackCheckout
              registrationId={success.registrationId}
              participantEmail={email.trim().toLowerCase()}
              amountGhs={selectedBatch.courseFee}
              onCompleted={() => setPaymentStarted(true)}
            />
            <p className="text-xs text-muted-foreground">
              You can also pay later by bank transfer — details are in the payment
              instructions email we just sent you.
            </p>
          </div>
        )}
        {paymentStarted && (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            Payment received — thank you! A confirmation email is on its way once the
            payment is verified.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {bannerError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {bannerError}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="batchId">Course</Label>
        <select
          id="batchId"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={batchId}
          onChange={(event) => setBatchId(event.target.value)}
          onBlur={() => handleBlur('batchId')}
        >
          <option value="">Select a course</option>
          {batchOptions.map((option) => (
            <option key={option.batchId} value={option.batchId}>
              {option.courseName} — {option.cohortLabel} — {formatDate(option.startDate)}
            </option>
          ))}
        </select>
        {fieldErrors.batchId && (
          <p className="text-sm text-destructive">{fieldErrors.batchId}</p>
        )}
        {selectedBatch && (
          <p className="text-sm text-muted-foreground">
            Course fee: {formatGhs(selectedBatch.courseFee)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          value={fullName}
          autoComplete="name"
          className={fieldErrors.fullName ? 'border-destructive' : undefined}
          onChange={(event) => setFullName(event.target.value)}
          onBlur={() => handleBlur('fullName')}
        />
        {fieldErrors.fullName && (
          <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          className={fieldErrors.email ? 'border-destructive' : undefined}
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
          className={fieldErrors.phone ? 'border-destructive' : undefined}
          onChange={(event) => setPhone(event.target.value)}
          onBlur={() => handleBlur('phone')}
        />
        {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="leadSource">How did you hear about us?</Label>
        <select
          id="leadSource"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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

      <div className="flex items-start gap-3 rounded-md border p-4">
        <input
          id="consent"
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={consentGiven}
          onChange={(event) => setConsentGiven(event.target.checked)}
        />
        <Label htmlFor="consent" className="text-sm font-normal leading-snug">
          {CONSENT_TEXT}
        </Label>
      </div>

      {/* BR-15: disabled (visibly greyed), not hidden, until consent given. */}
      <Button type="submit" className="w-full" disabled={!consentGiven || submitting}>
        {submitting ? 'Submitting…' : 'Complete Registration'}
      </Button>
    </form>
  );
}
