'use client';

// F1.04 — Payment Tracking (Document 8, Section 5). Finance's default
// landing page: pre-filtered to Unpaid + Part Payment, sorted by Batch start
// date, so what needs action is visible with zero navigation.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  appendDateRange,
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  type DateRange,
} from '@/components/ui/date-range-filter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatGhs } from '@/lib/utils';

interface RegistrationRow {
  id: string;
  fullName: string;
  email: string;
  courseName: string;
  cohortLabel: string;
  paymentStatus: 'Unpaid' | 'Part Payment' | 'Paid';
  isFree: boolean;
  courseFee: number;
  originalFee: number | null;
  amountPaid: number;
  balance: number;
  paymentMethod: string | null;
  transactionId: string | null;
  verifiedBy?: string | null;
}

const PAYMENT_METHODS = ['Bank Transfer', 'MTN MoMo', 'Paystack Card', 'Cash', 'Other'];

function statusBadge(status: RegistrationRow['paymentStatus']) {
  // Colour reinforces the status text, never replaces it (Document 8).
  if (status === 'Paid') return <Badge className="bg-emerald-600">Paid</Badge>;
  if (status === 'Part Payment') return <Badge className="bg-amber-500">Part Payment</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

interface DraftPayment {
  amountPaid: string;
  paymentMethod: string;
  transactionId: string;
  paymentNotes: string;
}

interface SubmissionRow {
  id: string;
  registrationId: string;
  method: 'MTN MoMo' | 'Bank Transfer';
  amount: number;
  transactionReference: string | null;
  paymentDate: string;
  hasSlip: boolean;
  participantNotes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  participantName: string;
  courseName: string;
  cohortLabel: string;
}

export default function PaymentTrackingPage() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [showSettled, setShowSettled] = useState(false);
  // Server-side count of everything matching the current filter, so the screen
  // can say when it is showing less than all of it instead of quietly lying.
  const [totalMatching, setTotalMatching] = useState(0);
  // Filters registrations by registration date, applied server-side for the
  // same reason the payment status filter is — see the reload comment below.
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPayment>>({});
  const [confirmTarget, setConfirmTarget] = useState<RegistrationRow | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recentlySavedId, setRecentlySavedId] = useState<string | null>(null);
  const [discountTarget, setDiscountTarget] = useState<RegistrationRow | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [savingDiscount, setSavingDiscount] = useState(false);

  const [view, setView] = useState<'tracking' | 'submissions'>('tracking');
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<SubmissionRow | null>(null);
  const [reviewOverrides, setReviewOverrides] = useState({
    amountPaid: '',
    transactionId: '',
    paymentDate: '',
  });
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // The outstanding filter has to be applied by the SERVER, not by
  // visibleRows below. This screen loads one page of registrations
  // newest-first; filtering after that only filters what the page happened to
  // include. On 2026-08-06 the 267 free ESG2 sign-ups (all Paid at GHS 0)
  // filled the whole window and pushed 27 of the 35 outstanding balances past
  // it — the screen showed 8 of 35 and gave no sign anything was missing.
  const reload = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: '200' });
      if (!showSettled) query.set('paymentStatus', 'outstanding');
      appendDateRange(query, dateRange);
      const result = await apiFetch<{ registrations: RegistrationRow[]; total: number }>(
        `/api/registrations?${query.toString()}`,
      );
      setRows(result.registrations);
      setTotalMatching(result.total ?? result.registrations.length);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load payments.');
    }
  }, [showSettled, dateRange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadSubmissions = useCallback(async () => {
    setSubmissionsError(null);
    try {
      const result = await apiFetch<{ submissions: SubmissionRow[] }>(
        '/api/payment-submissions?status=pending',
      );
      setSubmissions(result.submissions);
    } catch (err) {
      setSubmissionsError(
        err instanceof Error ? err.message : 'Failed to load payment submissions.',
      );
    }
  }, []);

  useEffect(() => {
    if (view === 'submissions') void reloadSubmissions();
  }, [view, reloadSubmissions]);

  function openReview(row: SubmissionRow) {
    setReviewTarget(row);
    setReviewOverrides({
      amountPaid: String(row.amount),
      transactionId: row.transactionReference ?? '',
      paymentDate: row.paymentDate,
    });
    setReviewNote('');
    setReviewError(null);
  }

  async function viewSlip(row: SubmissionRow) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/payment-submissions/${row.id}/slip-url`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setSubmissionsError(err instanceof Error ? err.message : 'Failed to load the slip.');
    }
  }

  async function submitReview(decision: 'approved' | 'rejected') {
    if (!reviewTarget) return;
    setReviewSaving(true);
    setReviewError(null);
    try {
      await apiFetch(`/api/payment-submissions/${reviewTarget.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          overrideAmountPaid: decision === 'approved' ? Number(reviewOverrides.amountPaid) : undefined,
          overrideTransactionId: reviewOverrides.transactionId.trim() || undefined,
          overridePaymentDate: reviewOverrides.paymentDate || undefined,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });
      setReviewTarget(null);
      await reloadSubmissions();
      await reload();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to review this submission.');
    } finally {
      setReviewSaving(false);
    }
  }

  // Free events are dropped before the settled filter, not by it: their rows
  // are Paid at GHS 0, so "show settled" would otherwise fill a collections
  // screen with webinar sign-ups that were never a receivable.
  const visibleRows = useMemo(() => {
    const collectible = rows.filter((row) => !row.isFree);
    return showSettled
      ? collectible
      : collectible.filter((row) => row.paymentStatus !== 'Paid');
  }, [rows, showSettled]);

  // rows.length is what the server sent for this filter; totalMatching is how
  // many exist. A gap means the 200-row page cut some off.
  const hiddenByPaging = Math.max(0, totalMatching - rows.length);

  // The CSV must carry the SAME filters as the screen — an export that
  // silently widens the selection is how a partial view becomes a wrong
  // decision. This is also the escape hatch offered when paging truncates.
  const exportHref = useMemo(() => {
    const query = new URLSearchParams();
    if (!showSettled) query.set('paymentStatus', 'outstanding');
    appendDateRange(query, dateRange);
    const suffix = query.toString();
    return suffix ? `/api/registrations/export?${suffix}` : '/api/registrations/export';
  }, [showSettled, dateRange]);

  function draftFor(row: RegistrationRow): DraftPayment {
    return (
      drafts[row.id] ?? {
        amountPaid: '',
        paymentMethod: '',
        transactionId: '',
        paymentNotes: '',
      }
    );
  }

  function setDraft(rowId: string, changes: Partial<DraftPayment>) {
    setDrafts((current) => ({
      ...current,
      [rowId]: { ...draftFor(rows.find((row) => row.id === rowId)!), ...changes },
    }));
  }

  function draftValidation(row: RegistrationRow): {
    amount: number;
    canSave: boolean;
    needsTransactionId: boolean;
    partPaymentPreview: boolean;
  } {
    const draft = draftFor(row);
    const amount = Number(draft.amountPaid);
    const needsTransactionId =
      draft.paymentMethod === 'Bank Transfer' || draft.paymentMethod === 'MTN MoMo';
    const canSave =
      draft.amountPaid !== '' &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      draft.paymentMethod !== '' &&
      (!needsTransactionId || draft.transactionId.trim() !== '');
    return {
      amount,
      canSave,
      needsTransactionId,
      partPaymentPreview: amount > 0 && amount < row.courseFee,
    };
  }

  async function savePayment(row: RegistrationRow) {
    const draft = draftFor(row);
    const { amount } = draftValidation(row);
    setSavingId(row.id);
    setErrorMessage(null);
    try {
      // BR-04: only amountPaid is sent — paymentStatus is derived by the
      // database trigger. BR-12: verifiedBy is set server-side.
      await apiFetch(`/api/payments/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          amountPaid: amount,
          paymentMethod: draft.paymentMethod,
          transactionId: draft.transactionId.trim() || null,
          paymentNotes: draft.paymentNotes.trim() || null,
        }),
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setRecentlySavedId(row.id);
      setTimeout(() => setRecentlySavedId(null), 2500);
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save payment.');
    } finally {
      setSavingId(null);
      setConfirmTarget(null);
    }
  }

  function handleSaveClick(row: RegistrationRow) {
    const { amount } = draftValidation(row);
    if (amount >= row.courseFee) {
      // Marking as Paid triggers an irreversible external side effect (a
      // confirmation email) — confirmation dialog is appropriate here.
      setConfirmTarget(row);
      return;
    }
    void savePayment(row);
  }

  function openDiscountDialog(row: RegistrationRow) {
    setDiscountTarget(row);
    setDiscountAmount('');
    setDiscountReason('');
    setDiscountError(null);
  }

  // Preview only — the service layer is authoritative on whether this
  // actually requires admin (founder-approved 2026-07-22: finance and admin
  // can both grant a partial discount; only admin may grant one that zeroes
  // the remaining balance).
  function discountPreview(row: RegistrationRow): {
    amount: number;
    valid: boolean;
    newFee: number;
    newBalance: number;
    isFullWaiver: boolean;
  } {
    const amount = Number(discountAmount);
    const valid =
      discountAmount !== '' &&
      Number.isFinite(amount) &&
      amount > 0 &&
      discountReason.trim().length >= 3;
    const newFee = Math.max(row.courseFee - amount, 0);
    const newBalance = newFee - row.amountPaid;
    return { amount, valid, newFee, newBalance, isFullWaiver: newBalance <= 0 };
  }

  async function saveDiscount() {
    if (!discountTarget) return;
    const { amount, valid } = discountPreview(discountTarget);
    if (!valid) return;
    setSavingDiscount(true);
    setDiscountError(null);
    try {
      await apiFetch(`/api/payments/${discountTarget.id}/discount`, {
        method: 'POST',
        body: JSON.stringify({ discountAmount: amount, reason: discountReason.trim() }),
      });
      setDiscountTarget(null);
      await reload();
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : 'Failed to apply discount.');
    } finally {
      setSavingDiscount(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Payment Tracking</h1>
        <div className="flex items-center gap-3">
          {view === 'tracking' ? (
            <>
              <DateRangeFilter value={dateRange} onChange={setDateRange} label="Registered" />
              <Button variant="outline" onClick={() => setShowSettled((value) => !value)}>
                {showSettled ? 'Show outstanding only' : 'Show all (incl. Paid)'}
              </Button>
              <Button variant="outline" asChild>
                <a href={exportHref} download>
                  Export CSV
                </a>
              </Button>
            </>
          ) : null}
          <Button
            variant={view === 'submissions' ? 'default' : 'outline'}
            onClick={() => setView((current) => (current === 'tracking' ? 'submissions' : 'tracking'))}
          >
            {view === 'tracking'
              ? `Payment Submissions${submissions.length > 0 ? ` (${submissions.length})` : ''}`
              : 'Back to Payment Tracking'}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {view === 'submissions' ? (
        <div className="space-y-4">
          {submissionsError && (
            <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {submissionsError}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Course / Batch</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount claimed</TableHead>
                <TableHead>Payment date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Slip</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.participantName}</p>
                  </TableCell>
                  <TableCell>
                    <p>{row.courseName}</p>
                    <p className="text-xs text-muted-foreground">{row.cohortLabel}</p>
                  </TableCell>
                  <TableCell>{row.method}</TableCell>
                  <TableCell>{formatGhs(row.amount)}</TableCell>
                  <TableCell>{row.paymentDate}</TableCell>
                  <TableCell>{row.transactionReference ?? '—'}</TableCell>
                  <TableCell>
                    {row.hasSlip ? (
                      <Button variant="outline" size="sm" onClick={() => viewSlip(row)}>
                        View slip
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => openReview(row)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {submissions.length === 0 && (
            <p className="text-muted-foreground">No payment submissions awaiting review.</p>
          )}
        </div>
      ) : (
        <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Participant</TableHead>
            <TableHead>Course / Batch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Balance</TableHead>
            <TableHead>Record payment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => {
            const draft = draftFor(row);
            const { canSave, needsTransactionId, partPaymentPreview, amount } =
              draftValidation(row);
            return (
              <TableRow
                key={row.id}
                className={recentlySavedId === row.id ? 'bg-emerald-50' : undefined}
              >
                <TableCell>
                  <p className="font-medium">{row.fullName}</p>
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>
                  <p>{row.courseName}</p>
                  <p className="text-xs text-muted-foreground">{row.cohortLabel}</p>
                </TableCell>
                <TableCell>{statusBadge(row.paymentStatus)}</TableCell>
                <TableCell>
                  {row.originalFee !== null && row.originalFee > row.courseFee ? (
                    <div>
                      <p className="text-xs text-muted-foreground line-through">
                        {formatGhs(row.originalFee)}
                      </p>
                      <p className="font-medium text-emerald-700">{formatGhs(row.courseFee)}</p>
                    </div>
                  ) : (
                    formatGhs(row.courseFee)
                  )}
                </TableCell>
                <TableCell>{formatGhs(row.amountPaid)}</TableCell>
                <TableCell className={row.balance < 0 ? 'text-amber-600' : undefined}>
                  {formatGhs(row.balance)}
                </TableCell>
                <TableCell className="min-w-72">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">GHS</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-8 w-28"
                        placeholder="Amount"
                        value={draft.amountPaid}
                        onChange={(event) =>
                          setDraft(row.id, { amountPaid: event.target.value })
                        }
                      />
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={draft.paymentMethod}
                        onChange={(event) =>
                          setDraft(row.id, { paymentMethod: event.target.value })
                        }
                      >
                        <option value="">Method</option>
                        {PAYMENT_METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={!canSave || savingId === row.id}
                        onClick={() => handleSaveClick(row)}
                      >
                        {savingId === row.id
                          ? 'Saving…'
                          : amount >= row.courseFee && draft.amountPaid !== ''
                            ? 'Mark as Paid'
                            : 'Save'}
                      </Button>
                    </div>
                    {needsTransactionId && (
                      <Input
                        className="h-8"
                        placeholder="Transaction / reference ID (required)"
                        value={draft.transactionId}
                        onChange={(event) =>
                          setDraft(row.id, { transactionId: event.target.value })
                        }
                      />
                    )}
                    {partPaymentPreview && (
                      <p className="text-xs text-amber-600">
                        This will be recorded as a Part Payment.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Verified by: {row.verifiedBy ?? 'Auto-filled on save'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openDiscountDialog(row)}
                    >
                      Apply discount
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {visibleRows.length === 0 && (
        <p className="text-muted-foreground">No outstanding payments. 🎉</p>
      )}

      {hiddenByPaging > 0 && (
        <p className="text-amber-600 font-medium">
          Showing {visibleRows.length} of {totalMatching} matching registrations —{' '}
          {hiddenByPaging} more are not loaded. Narrow by course, cohort or date, or use
          Export CSV to get the full list.
        </p>
      )}
        </>
      )}

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm payment</DialogTitle>
            <DialogDescription>
              Confirm payment of{' '}
              {confirmTarget
                ? formatGhs(Number(draftFor(confirmTarget).amountPaid))
                : ''}{' '}
              for {confirmTarget?.fullName}? A confirmation email will be sent
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="paymentNotes">Payment notes (optional)</Label>
            <Input
              id="paymentNotes"
              placeholder={
                confirmTarget && draftFor(confirmTarget).paymentMethod === 'MTN MoMo'
                  ? 'e.g. Sent to personal number 0530531328 (or MoMo Pay 143735)'
                  : 'Confirmed against GCB statement…'
              }
              value={confirmTarget ? draftFor(confirmTarget).paymentNotes : ''}
              onChange={(event) =>
                confirmTarget && setDraft(confirmTarget.id, { paymentNotes: event.target.value })
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmTarget && savePayment(confirmTarget)}
              disabled={savingId !== null}
            >
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={discountTarget !== null}
        onOpenChange={(open) => !open && setDiscountTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply discount</DialogTitle>
            <DialogDescription>
              {discountTarget
                ? `Grant an additional discount for ${discountTarget.fullName}. Current fee: ${formatGhs(discountTarget.courseFee)}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {discountTarget && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="discountAmount">Discount amount (GHS)</Label>
                <Input
                  id="discountAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountReason">Reason (required, for the audit trail)</Label>
                <Input
                  id="discountReason"
                  placeholder="e.g. Corporate sponsorship partial waiver"
                  value={discountReason}
                  onChange={(event) => setDiscountReason(event.target.value)}
                />
              </div>
              {(() => {
                const preview = discountPreview(discountTarget);
                if (discountAmount === '') return null;
                return (
                  <div className="rounded-md bg-muted/30 p-3 text-sm">
                    <p>New fee: {formatGhs(preview.newFee)}</p>
                    <p>New balance: {formatGhs(Math.max(preview.newBalance, 0))}</p>
                    {preview.isFullWaiver && (
                      <p className="mt-1 text-amber-600">
                        This fully waives the remaining balance — only an admin can confirm this.
                      </p>
                    )}
                  </div>
                );
              })()}
              {discountError && (
                <p role="alert" className="text-sm text-destructive">
                  {discountError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveDiscount}
              disabled={
                savingDiscount || !discountTarget || !discountPreview(discountTarget).valid
              }
            >
              {savingDiscount ? 'Saving…' : 'Apply discount'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewTarget !== null} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review payment submission</DialogTitle>
            <DialogDescription>
              {reviewTarget
                ? `${reviewTarget.participantName} — ${reviewTarget.courseName} (${reviewTarget.cohortLabel}), submitted via ${reviewTarget.method}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-3">
              {reviewTarget.participantNotes && (
                <p className="rounded-md bg-muted/30 p-3 text-sm">
                  Participant note: {reviewTarget.participantNotes}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Approving adds this amount to the registration&apos;s existing amount paid — it does
                not replace it.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reviewAmount">Amount to add (GHS)</Label>
                <Input
                  id="reviewAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={reviewOverrides.amountPaid}
                  onChange={(event) =>
                    setReviewOverrides((current) => ({ ...current, amountPaid: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewReference">Transaction / reference ID</Label>
                <Input
                  id="reviewReference"
                  value={reviewOverrides.transactionId}
                  onChange={(event) =>
                    setReviewOverrides((current) => ({ ...current, transactionId: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewDate">Payment date</Label>
                <Input
                  id="reviewDate"
                  type="date"
                  value={reviewOverrides.paymentDate}
                  onChange={(event) =>
                    setReviewOverrides((current) => ({ ...current, paymentDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewNote">Review note (optional — shown to the participant if rejected)</Label>
                <Input
                  id="reviewNote"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                />
              </div>
              {reviewError && (
                <p role="alert" className="text-sm text-destructive">
                  {reviewError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={reviewSaving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => submitReview('rejected')}
              disabled={reviewSaving}
            >
              {reviewSaving ? 'Saving…' : 'Reject'}
            </Button>
            <Button
              onClick={() => submitReview('approved')}
              disabled={reviewSaving || !reviewOverrides.amountPaid || !reviewOverrides.paymentDate}
            >
              {reviewSaving ? 'Saving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
