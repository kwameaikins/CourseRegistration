'use client';

import { useState } from 'react';

import { ApiError, apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CATEGORIES = [
  { value: 'ambassador', label: 'Ambassador — I have an audience/community I can refer to Knowsia' },
  { value: 'institutional', label: 'Institutional Partner — my organisation refers students in volume' },
] as const;

const PAYOUT_METHODS = ['MTN MoMo', 'Bank Transfer'] as const;

type FieldErrors = Partial<Record<'category' | 'fullName' | 'phone' | 'agreedToCodeOfConduct', string>>;

export function PartnerApplicationForm() {
  const [category, setCategory] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [socialLinks, setSocialLinks] = useState('');
  const [professionalBackground, setProfessionalBackground] = useState('');
  const [promotionalMethods, setPromotionalMethods] = useState('');
  const [estimatedAudienceSize, setEstimatedAudienceSize] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [agreedToCodeOfConduct, setAgreedToCodeOfConduct] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!category) errors.category = 'Please select the type of partner you are.';
    if (fullName.trim().length < 2) errors.fullName = 'Please enter your full name.';
    if (phone.trim().length < 10) errors.phone = 'Please enter a valid phone number.';
    if (!agreedToCodeOfConduct) errors.agreedToCodeOfConduct = 'You must agree to the code of conduct.';
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setBannerError(null);
    try {
      const result = await apiFetch<{ message: string }>('/api/partners/apply', {
        method: 'POST',
        body: JSON.stringify({
          category,
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim(),
          companyName: companyName.trim() || null,
          socialLinks: socialLinks.trim() || null,
          professionalBackground: professionalBackground.trim() || null,
          promotionalMethods: promotionalMethods.trim() || null,
          estimatedAudienceSize: estimatedAudienceSize.trim() || null,
          payoutMethod: payoutMethod || null,
          payoutDetails: payoutDetails.trim() || null,
          agreedToCodeOfConduct,
        }),
      });
      setSuccess(result.message);
    } catch (err) {
      setBannerError(err instanceof ApiError ? err.message : 'Could not submit your application.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-2 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold text-emerald-700">Application received</h2>
        <p className="text-sm">{success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {bannerError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {bannerError}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="category">Partner Type</Label>
        <select
          id="category"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">Select the type of partner you are</option>
          {CATEGORIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldErrors.category && <p className="text-sm text-destructive">{fieldErrors.category}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          value={fullName}
          className={fieldErrors.fullName ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setFullName(event.target.value)}
        />
        {fieldErrors.fullName && <p className="text-sm text-destructive">{fieldErrors.fullName}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">
          Email <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="email" type="email" value={email} className="h-11" onChange={(event) => setEmail(event.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          placeholder="+233…"
          className={fieldErrors.phone ? 'h-11 border-destructive' : 'h-11'}
          onChange={(event) => setPhone(event.target.value)}
        />
        {fieldErrors.phone && <p className="text-sm text-destructive">{fieldErrors.phone}</p>}
      </div>

      {category === 'institutional' && (
        <div className="space-y-2">
          <Label htmlFor="companyName">Organisation Name</Label>
          <Input id="companyName" value={companyName} className="h-11" onChange={(event) => setCompanyName(event.target.value)} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="socialLinks">
          Social/Community Links <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="socialLinks"
          className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={socialLinks}
          onChange={(event) => setSocialLinks(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="professionalBackground">
          Professional Background <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="professionalBackground"
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={professionalBackground}
          onChange={(event) => setProfessionalBackground(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="promotionalMethods">
          How will you promote Knowsia courses? <span className="text-muted-foreground">(optional)</span>
        </Label>
        <textarea
          id="promotionalMethods"
          className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={promotionalMethods}
          onChange={(event) => setPromotionalMethods(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="estimatedAudienceSize">
          Estimated Audience Size <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="estimatedAudienceSize"
          value={estimatedAudienceSize}
          placeholder="e.g. 2,000 WhatsApp community members"
          className="h-11"
          onChange={(event) => setEstimatedAudienceSize(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="payoutMethod">
          Preferred Payout Method <span className="text-muted-foreground">(optional)</span>
        </Label>
        <select
          id="payoutMethod"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          value={payoutMethod}
          onChange={(event) => setPayoutMethod(event.target.value)}
        >
          <option value="">Select a payout method</option>
          {PAYOUT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>

      {payoutMethod && (
        <div className="space-y-2">
          <Label htmlFor="payoutDetails">
            {payoutMethod === 'MTN MoMo' ? 'MoMo Number' : 'Bank Account Details'}
          </Label>
          <Input id="payoutDetails" value={payoutDetails} className="h-11" onChange={(event) => setPayoutDetails(event.target.value)} />
        </div>
      )}

      <div className="flex items-start gap-3 rounded-md border p-4">
        <input
          id="agreedToCodeOfConduct"
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={agreedToCodeOfConduct}
          onChange={(event) => setAgreedToCodeOfConduct(event.target.checked)}
        />
        <Label htmlFor="agreedToCodeOfConduct" className="text-sm font-normal leading-snug">
          I agree to represent Knowsia honestly, never impersonate Knowsia staff, and only use
          approved promotional methods.
        </Label>
      </div>
      {fieldErrors.agreedToCodeOfConduct && (
        <p className="text-sm text-destructive">{fieldErrors.agreedToCodeOfConduct}</p>
      )}

      <Button type="submit" className="h-11 w-full" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit Application'}
      </Button>
    </form>
  );
}
