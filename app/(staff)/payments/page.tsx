'use client';

// F1.04 — Payment Tracking (Document 8, Section 5). Finance's default
// landing page: pre-filtered to Unpaid + Part Payment, sorted by Batch start
// date, so what needs action is visible with zero navigation.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export default function PaymentTrackingPage() {
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [showSettled, setShowSettled] = useState(false);
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

  const reload = useCallback(async () => {
    try {
      const result = await apiFetch<{ registrations: RegistrationRow[] }>(
        '/api/registrations?limit=200',
      );
      setRows(result.registrations);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load payments.');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleRows = useMemo(
    () =>
      showSettled ? rows : rows.filter((row) => row.paymentStatus !== 'Paid'),
    [rows, showSettled],
  );

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
        <Button variant="outline" onClick={() => setShowSettled((value) => !value)}>
          {showSettled ? 'Show outstanding only' : 'Show all (incl. Paid)'}
        </Button>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

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
    </div>
  );
}
