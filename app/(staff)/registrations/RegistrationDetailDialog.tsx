'use client';

// Registration 360° view (system review, approved 2026-07-20): one panel
// pulling together everything every module knows about a single
// Registration — payment, every message channel, Zoom attendance, feedback,
// certificates, and voice calls. Sections the viewer's role can't see are
// simply absent from the API response (see `shapeRegistration360ForRole`),
// so this component renders only what it's given.
import { useEffect, useState } from 'react';

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
import { formatDate, formatGhs } from '@/lib/utils';

interface Registration360 {
  canDelete: boolean;
  canLapse: boolean;
  canViewStatement: boolean;
  registration: {
    id: string;
    registrationStatus: string;
    leadSource: string;
    notes: string | null;
    registeredAt: string;
    lapsedAt: string | null;
    lapsedByName: string | null;
    lapsedReason: string | null;
    invoiceBillTo: { name: string; attention?: string; address?: string; email?: string } | null;
  };
  participant: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    jobTitle: string | null;
    company: string | null;
    gender: string | null;
    deleted: boolean;
  } | null;
  course: {
    courseId: string;
    batchId: string;
    courseName: string;
    courseCode: string;
    cohortLabel: string;
    startDate: string;
    endDate: string;
    facilitatorName: string;
  } | null;
  payment: {
    paymentStatus: string;
    courseFee: number;
    amountPaid: number;
    balance: number;
    paymentMethod?: string | null;
    transactionId?: string | null;
    paymentNotes?: string | null;
    verifiedBy?: string | null;
    paymentDate?: string | null;
    originalFee?: number | null;
    discountAmount?: number;
    discountReason?: string | null;
    discountGrantedByName?: string | null;
    discountGrantedAt?: string | null;
    installments?: Array<{
      installmentNumber: number;
      amountDue: number;
      amountPaid: number;
      dueDate: string;
      paymentStatus: 'Pending' | 'Paid';
    }>;
  } | null;
  messages?: {
    email: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
    whatsapp: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
    sms: Array<{ type: string; sentAt: string; success: boolean; error: string | null }>;
  };
  zoom?: { joinUrl: string; registeredAt: string } | null;
  attendance?: Array<{
    sessionDate: string;
    joinTime: string | null;
    leaveTime: string | null;
    durationMinutes: number;
  }>;
  feedback?: {
    overallRating: number;
    relevanceRating: number;
    facilitatorRating: number;
    confidenceRating: number;
    materialsClarity: 'Yes' | 'Partly' | 'No';
    mostValuableText: string | null;
    improvementText: string | null;
    recommendation: 'Yes' | 'Maybe' | 'No';
    otherCourseSuggestion: string | null;
    testimonialChoice: 'Named' | 'Anonymous' | 'No';
    submittedAt: string;
  } | null;
  certificates?: Array<{
    id: string;
    certificateNumber: string;
    issuedDate: string;
    revoked: boolean;
  }>;
  calls?: Array<{
    id: string;
    callType: string;
    status: string;
    summary: string | null;
    needsHumanFollowup: boolean;
    createdAt: string;
  }>;
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

function channelBadge(channel: 'Email' | 'WhatsApp' | 'SMS') {
  const styles: Record<string, string> = {
    Email: 'bg-blue-100 text-blue-800',
    WhatsApp: 'bg-emerald-100 text-emerald-800',
    SMS: 'bg-purple-100 text-purple-800',
  };
  return <span className={`rounded px-1.5 py-0.5 text-xs ${styles[channel]}`}>{channel}</span>;
}

interface TransferBatchOption {
  id: string;
  cohortLabel: string;
  startDate: string;
  // Late registration (2026-08-12): eligibility is judged on endDate, so this
  // list can include a cohort already under way. Must stay in step with
  // transferRegistration's own gate — the server rejects what this hides.
  endDate: string;
  isActive: boolean;
}

export function RegistrationDetailDialog(props: {
  registrationId: string;
  onClose: () => void;
  // Called after a successful delete so the parent list can refresh —
  // optional so this dialog still works from callers that don't care.
  onDeleted?: () => void;
  // Called after a successful batch transfer (cohort label changes) — same
  // optional refresh-the-parent-list posture as onDeleted.
  onTransferred?: () => void;
}) {
  const [data, setData] = useState<Registration360 | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [transferring, setTransferring] = useState(false);
  const [transferBatches, setTransferBatches] = useState<TransferBatchOption[]>([]);
  const [transferBatchId, setTransferBatchId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState(false);

  const [confirmingLapse, setConfirmingLapse] = useState(false);
  const [lapseReason, setLapseReason] = useState('');
  // Recorded-course access grant (founder rule 2026-08-23: time-boxed, never
  // automatic with a live seat).
  const [grantDays, setGrantDays] = useState('30');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantSuccess, setGrantSuccess] = useState<string | null>(null);
  const [lapsing, setLapsing] = useState(false);
  const [lapseError, setLapseError] = useState<string | null>(null);

  // Invoice (founder request 2026-09-18, one-to-one tuition). The sheet opens
  // on demand, reads as one sentence with the due date in the middle of it,
  // and on success the sentence changes where the person was looking.
  const [invoicing, setInvoicing] = useState(false);
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [invoiceSending, setInvoiceSending] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSent, setInvoiceSent] = useState<{ reference: string; sentTo: string } | null>(null);
  // Bill to a company (2026-09-18: "my boss wants the invoice in the company
  // name"). Pre-filled from the participant's own company; stored on the
  // registration so preview and every re-send agree.
  const [billToCompany, setBillToCompany] = useState(false);
  const [billTo, setBillTo] = useState({ name: '', attention: '', address: '', email: '' });
  const [invoicePreviewing, setInvoicePreviewing] = useState(false);

  function openInvoice() {
    const inSevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const start = data?.course?.startDate ?? '';
    const today = new Date().toISOString().slice(0, 10);
    setInvoiceDueDate(start && start >= today && start < inSevenDays ? start : inSevenDays);
    setInvoiceMessage('');
    setInvoiceError(null);
    const stored = data?.registration.invoiceBillTo ?? null;
    setBillToCompany(Boolean(stored));
    setBillTo({
      name: stored?.name ?? data?.participant?.company ?? '',
      attention: stored?.attention ?? data?.participant?.fullName ?? '',
      address: stored?.address ?? '',
      email: stored?.email ?? '',
    });
    setInvoicing(true);
  }

  function billToPayload() {
    return billToCompany
      ? { name: billTo.name.trim(), attention: billTo.attention.trim(), address: billTo.address.trim(), email: billTo.email.trim() }
      : null;
  }

  // Preview must show what will be sent, so the bill-to is saved first.
  async function handlePreviewInvoice() {
    setInvoicePreviewing(true);
    setInvoiceError(null);
    try {
      await apiFetch(`/api/registrations/${props.registrationId}/invoice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billTo: billToPayload() }),
      });
      window.open(
        `/api/registrations/${props.registrationId}/invoice?dueDate=${encodeURIComponent(invoiceDueDate)}`,
        '_blank',
        'noopener',
      );
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Failed to save the billing details.');
    } finally {
      setInvoicePreviewing(false);
    }
  }

  async function handleSendInvoice() {
    setInvoiceSending(true);
    setInvoiceError(null);
    try {
      const result = await apiFetch<{ reference: string; sentTo: string }>(
        `/api/registrations/${props.registrationId}/invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dueDate: invoiceDueDate || null,
            message: invoiceMessage.trim() || null,
            billTo: billToPayload(),
          }),
        },
      );
      setInvoiceSent({ reference: result.reference, sentTo: result.sentTo });
      setInvoicing(false);
      void loadData(); // the stored bill-to is now part of the row
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Failed to send the invoice.');
    } finally {
      setInvoiceSending(false);
    }
  }

  function loadData() {
    setLoading(true);
    setErrorMessage(null);
    return apiFetch<Registration360>(`/api/registrations/${props.registrationId}`)
      .then((result) => setData(result))
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load registration.');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    apiFetch<Registration360>(`/api/registrations/${props.registrationId}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load registration.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.registrationId]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/registrations/${props.registrationId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      setConfirmingDelete(false);
      props.onDeleted?.();
      props.onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete registration.');
    } finally {
      setDeleting(false);
    }
  }

  // Write-off (2026-08-09) — the non-destructive counterpart to the delete
  // below. Keeps every row; only stops the balance counting as collectible.
  async function handleLapse() {
    setLapsing(true);
    setLapseError(null);
    try {
      await apiFetch(`/api/registrations/${props.registrationId}/lapse`, {
        method: 'POST',
        body: JSON.stringify({ reason: lapseReason.trim() }),
      });
      setConfirmingLapse(false);
      setLapseReason('');
      props.onTransferred?.();
      await loadData();
    } catch (err) {
      setLapseError(err instanceof Error ? err.message : 'Failed to write off registration.');
    } finally {
      setLapsing(false);
    }
  }

  async function handleReinstate() {
    setLapsing(true);
    setLapseError(null);
    try {
      await apiFetch(`/api/registrations/${props.registrationId}/lapse`, { method: 'DELETE' });
      props.onTransferred?.();
      await loadData();
    } catch (err) {
      setLapseError(err instanceof Error ? err.message : 'Failed to reinstate registration.');
    } finally {
      setLapsing(false);
    }
  }

  async function handleOpenTransfer() {
    if (!data?.course) return;
    setTransferring(true);
    setTransferBatchId('');
    setTransferReason('');
    setTransferError(null);
    setTransferSuccess(false);
    try {
      const result = await apiFetch<{ batches: TransferBatchOption[] }>(
        `/api/batches?courseId=${data.course.courseId}`,
      );
      const todayIso = new Date().toISOString().slice(0, 10);
      setTransferBatches(
        result.batches.filter(
          (batch) =>
            batch.id !== data.course!.batchId &&
            batch.isActive &&
            batch.endDate >= todayIso,
        ),
      );
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : 'Failed to load available batches.',
      );
    }
  }

  async function handleTransfer() {
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      await apiFetch(`/api/registrations/${props.registrationId}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          newBatchId: transferBatchId,
          reason: transferReason.trim(),
        }),
      });
      setTransferring(false);
      setTransferSuccess(true);
      setTimeout(() => setTransferSuccess(false), 2500);
      props.onTransferred?.();
      await loadData();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Failed to transfer registration.');
    } finally {
      setTransferSubmitting(false);
    }
  }

  const messageTimeline = data?.messages
    ? [
        ...data.messages.email.map((m) => ({ ...m, channel: 'Email' as const })),
        ...data.messages.whatsapp.map((m) => ({ ...m, channel: 'WhatsApp' as const })),
        ...data.messages.sms.map((m) => ({ ...m, channel: 'SMS' as const })),
      ].sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data?.participant?.fullName ?? (loading ? 'Loading…' : 'Registration')}
          </DialogTitle>
        </DialogHeader>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {data && (
          <div className="space-y-4">
            <Section title="Participant">
              {data.participant?.deleted ? (
                <p className="text-sm text-muted-foreground">
                  This participant&apos;s data has been erased (DPA request).
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    {data.participant?.email}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone:</span>{' '}
                    {data.participant?.phone}
                  </p>
                  {data.participant?.jobTitle && (
                    <p>
                      <span className="text-muted-foreground">Job title:</span>{' '}
                      {data.participant.jobTitle}
                    </p>
                  )}
                  {data.participant?.company && (
                    <p>
                      <span className="text-muted-foreground">Company:</span>{' '}
                      {data.participant.company}
                    </p>
                  )}
                  <p>
                    <span className="text-muted-foreground">Lead source:</span>{' '}
                    {data.registration.leadSource}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Registered:</span>{' '}
                    {formatDate(data.registration.registeredAt)}
                  </p>
                </div>
              )}
              {data.registration.notes && (
                <p className="rounded bg-muted/50 p-2 text-sm">
                  <span className="text-muted-foreground">Notes: </span>
                  {data.registration.notes}
                </p>
              )}
            </Section>

            {data.course && (
              <Section title="Course">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <p className="col-span-2 font-medium">
                    {data.course.courseName}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({data.course.courseCode})
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Batch:</span> {data.course.cohortLabel}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Facilitator:</span>{' '}
                    {data.course.facilitatorName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Starts:</span>{' '}
                    {formatDate(data.course.startDate)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Ends:</span>{' '}
                    {formatDate(data.course.endDate)}
                  </p>
                </div>
                <Badge variant="secondary">{data.registration.registrationStatus}</Badge>
              </Section>
            )}

            {data.payment && (
              <Section title="Payment">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <Badge
                      className={
                        data.payment.paymentStatus === 'Paid'
                          ? 'bg-emerald-600'
                          : data.payment.paymentStatus === 'Part Payment'
                            ? 'bg-amber-500'
                            : undefined
                      }
                      variant={data.payment.paymentStatus === 'Unpaid' ? 'destructive' : undefined}
                    >
                      {data.payment.paymentStatus}
                    </Badge>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Fee:</span>{' '}
                    {data.payment.originalFee != null &&
                    data.payment.originalFee > data.payment.courseFee ? (
                      <>
                        <span className="line-through text-muted-foreground">
                          {formatGhs(data.payment.originalFee)}
                        </span>{' '}
                        <span className="font-medium text-emerald-700">
                          {formatGhs(data.payment.courseFee)}
                        </span>
                      </>
                    ) : (
                      formatGhs(data.payment.courseFee)
                    )}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Paid:</span>{' '}
                    {formatGhs(data.payment.amountPaid)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Balance:</span>{' '}
                    {formatGhs(data.payment.balance)}
                  </p>
                  {data.payment.paymentMethod !== undefined && (
                    <>
                      <p>
                        <span className="text-muted-foreground">Method:</span>{' '}
                        {data.payment.paymentMethod ?? '—'}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Reference:</span>{' '}
                        {data.payment.transactionId ?? '—'}
                      </p>
                      {data.payment.verifiedBy && (
                        <p>
                          <span className="text-muted-foreground">Verified by:</span>{' '}
                          {data.payment.verifiedBy}
                        </p>
                      )}
                      {data.payment.paymentNotes && (
                        <p className="col-span-2">
                          <span className="text-muted-foreground">Notes:</span>{' '}
                          {data.payment.paymentNotes}
                        </p>
                      )}
                      {data.payment.discountAmount !== undefined &&
                        data.payment.discountAmount > 0 && (
                          <div className="col-span-2 rounded bg-muted/50 p-2">
                            <p>
                              <span className="text-muted-foreground">Discount granted:</span>{' '}
                              {formatGhs(data.payment.discountAmount)}
                            </p>
                            {data.payment.discountReason && (
                              <p>
                                <span className="text-muted-foreground">Reason:</span>{' '}
                                {data.payment.discountReason}
                              </p>
                            )}
                            {data.payment.discountGrantedByName && (
                              <p>
                                <span className="text-muted-foreground">Granted by:</span>{' '}
                                {data.payment.discountGrantedByName}
                                {data.payment.discountGrantedAt &&
                                  ` on ${formatDate(data.payment.discountGrantedAt)}`}
                              </p>
                            )}
                          </div>
                        )}
                      {data.payment.installments && data.payment.installments.length > 0 && (
                        <div className="col-span-2 rounded bg-muted/50 p-2">
                          <p className="mb-1 text-muted-foreground">Payment plan:</p>
                          {data.payment.installments.map((installment) => (
                            <p key={installment.installmentNumber}>
                              Installment {installment.installmentNumber}:{' '}
                              {formatGhs(installment.amountDue)} —{' '}
                              {installment.paymentStatus === 'Paid'
                                ? 'Paid'
                                : `Due ${formatDate(installment.dueDate)}`}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {data.canViewStatement && data.participant && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`/api/participants/${data.participant.id}/statement`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download account statement
                      </a>
                    </Button>
                    {data.course && data.payment && (
                      <>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/registrations/${props.registrationId}/invoice`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview invoice
                          </a>
                        </Button>
                        {!invoicing && !invoiceSent && data.participant.email && (
                          <Button variant="outline" size="sm" onClick={openInvoice}>
                            Email invoice
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
                {invoiceSent && data.participant && (
                  <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
                    Invoice {invoiceSent.reference} sent to {invoiceSent.sentTo}.{' '}
                    <button type="button" className="underline" onClick={() => { setInvoiceSent(null); openInvoice(); }}>
                      Send again
                    </button>
                  </p>
                )}
                {invoicing && data.participant && data.payment && (
                  <div className="mt-3 space-y-3 rounded-md border p-3">
                    <p className="text-sm leading-7">
                      Email an invoice for{' '}
                      <strong>
                        {data.payment.balance > 0 ? formatGhs(data.payment.balance) : formatGhs(data.payment.amountPaid)}
                      </strong>
                      {data.payment.balance > 0 ? (
                        <>
                          , due by{' '}
                          <input
                            type="date"
                            aria-label="Due date"
                            className="mx-1 inline-block h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={invoiceDueDate}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(event) => setInvoiceDueDate(event.target.value)}
                          />
                        </>
                      ) : (
                        <> (paid in full — a receipted invoice)</>
                      )}
                      , to <strong>{data.participant.email}</strong>
                      {billToCompany && billTo.email.trim() && (
                        <> and <strong>{billTo.email.trim()}</strong></>
                      )}
                      .
                    </p>
                    <div className="space-y-2 rounded-md bg-muted/40 p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={billToCompany}
                          onChange={(event) => setBillToCompany(event.target.checked)}
                        />
                        Bill to a company instead
                        <span className="text-xs text-muted-foreground">
                          — the invoice is made out to the company, with {data.participant.fullName.split(' ')[0]} as the attention line
                        </span>
                      </label>
                      {billToCompany && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="billToName" className="text-xs text-muted-foreground">Company or organisation</Label>
                            <Input
                              id="billToName"
                              placeholder="e.g. Noohra Business Consult"
                              value={billTo.name}
                              onChange={(event) => setBillTo({ ...billTo, name: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="billToAttention" className="text-xs text-muted-foreground">Attention</Label>
                            <Input
                              id="billToAttention"
                              value={billTo.attention}
                              onChange={(event) => setBillTo({ ...billTo, attention: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="billToEmail" className="text-xs text-muted-foreground">Billing email (also receives the invoice)</Label>
                            <Input
                              id="billToEmail"
                              type="email"
                              placeholder="accounts@company.com"
                              value={billTo.email}
                              onChange={(event) => setBillTo({ ...billTo, email: event.target.value })}
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="billToAddress" className="text-xs text-muted-foreground">Address (optional)</Label>
                            <Input
                              id="billToAddress"
                              placeholder="e.g. PMB 12, Koforidua"
                              value={billTo.address}
                              onChange={(event) => setBillTo({ ...billTo, address: event.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="invoiceMessage" className="text-xs text-muted-foreground">
                        A note to include (optional)
                      </Label>
                      <Input
                        id="invoiceMessage"
                        placeholder="e.g. Sessions are Tuesdays and Thursdays, 6–8 pm, online and in person as agreed."
                        value={invoiceMessage}
                        onChange={(event) => setInvoiceMessage(event.target.value)}
                      />
                    </div>
                    {invoiceError && <p className="text-sm text-destructive">{invoiceError}</p>}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={invoiceSending || invoicePreviewing || (data.payment.balance > 0 && !invoiceDueDate) || (billToCompany && billTo.name.trim().length < 2)}
                        onClick={handleSendInvoice}
                      >
                        {invoiceSending ? 'Sending…' : 'Send invoice'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={invoiceSending || invoicePreviewing || (billToCompany && billTo.name.trim().length < 2)}
                        onClick={handlePreviewInvoice}
                      >
                        {invoicePreviewing ? 'Opening…' : 'Preview'}
                      </Button>
                      <Button variant="ghost" size="sm" disabled={invoiceSending} onClick={() => setInvoicing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {messageTimeline && (
              <Section title={`Messages (${messageTimeline.length})`}>
                {messageTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages sent yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {messageTimeline.map((message, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm">
                        {channelBadge(message.channel)}
                        <span>{message.type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.sentAt).toLocaleString()}
                        </span>
                        {!message.success && (
                          <span className="text-xs text-destructive" title={message.error ?? ''}>
                            failed
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {data.zoom !== undefined && data.zoom && (
              <Section title="Zoom">
                <p className="text-sm">
                  Personal join link registered{' '}
                  {new Date(data.zoom.registeredAt).toLocaleDateString()}.
                </p>
              </Section>
            )}

            {data.attendance && data.attendance.length > 0 && (
              <Section title={`Attendance (${data.attendance.length} session${data.attendance.length === 1 ? '' : 's'})`}>
                <ul className="space-y-1 text-sm">
                  {data.attendance.map((session) => (
                    <li key={session.sessionDate}>
                      {formatDate(session.sessionDate)} — {session.durationMinutes} min
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.feedback !== undefined && (
              <Section title="Feedback">
                {data.feedback ? (
                  <div className="text-sm">
                    <p>
                      Overall {data.feedback.overallRating}/5 · Relevance{' '}
                      {data.feedback.relevanceRating}/5 · Facilitator{' '}
                      {data.feedback.facilitatorRating}/5 · Confidence{' '}
                      {data.feedback.confidenceRating}/5 · Materials {data.feedback.materialsClarity}{' '}
                      · Recommend {data.feedback.recommendation}
                    </p>
                    {data.feedback.mostValuableText && (
                      <p className="mt-1 text-muted-foreground">
                        Most valuable: &ldquo;{data.feedback.mostValuableText}&rdquo;
                      </p>
                    )}
                    {data.feedback.improvementText && (
                      <p className="mt-1 text-muted-foreground">
                        To improve: &ldquo;{data.feedback.improvementText}&rdquo;
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
                )}
              </Section>
            )}

            {data.certificates && data.certificates.length > 0 && (
              <Section title="Certificates">
                <ul className="space-y-1 text-sm">
                  {data.certificates.map((cert) => (
                    <li key={cert.id} className="flex items-center gap-2">
                      <span className="font-mono">{cert.certificateNumber}</span>
                      <span className="text-muted-foreground">
                        {formatDate(cert.issuedDate)}
                      </span>
                      {cert.revoked && <Badge variant="destructive">Revoked</Badge>}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.calls && data.calls.length > 0 && (
              <Section title="Calls">
                <ul className="space-y-1.5 text-sm">
                  {data.calls.map((call) => (
                    <li key={call.id}>
                      <span className="font-medium">{call.callType.replace(/_/g, ' ')}</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        {new Date(call.createdAt).toLocaleString()} · {call.status}
                      </span>
                      {call.needsHumanFollowup && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          Needs follow-up
                        </span>
                      )}
                      {call.summary && (
                        <p className="text-muted-foreground">{call.summary}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.canDelete && data.course && (
              <Section title="Transfer">
                <p className="mb-2 text-sm text-muted-foreground">
                  Move this registration to a different batch/cohort of the same course
                  (e.g. they can&apos;t make the original start date). Their course fee is
                  unchanged.
                </p>
                {transferSuccess && (
                  <p className="mb-2 rounded bg-emerald-50 p-2 text-sm text-emerald-700">
                    Transferred.
                  </p>
                )}
                <Button variant="outline" size="sm" onClick={handleOpenTransfer}>
                  Transfer to another cohort
                </Button>
              </Section>
            )}

            <Section title="Recorded course access">
              <p className="mb-2 text-sm text-muted-foreground">
                Give this participant the self-paced recordings of this course on the study
                platform, for a stated period. A live seat does not include recordings —
                this grant is the deliberate exception, and granting again restates the
                period from today.
              </p>
              {grantSuccess && (
                <p className="mb-2 rounded bg-emerald-50 p-2 text-sm text-emerald-700">
                  {grantSuccess}
                </p>
              )}
              {grantError && <p className="mb-2 text-sm text-destructive">{grantError}</p>}
              <div className="flex items-center gap-2">
                <Input
                  className="w-24"
                  inputMode="numeric"
                  value={grantDays}
                  onChange={(event) => setGrantDays(event.target.value.replace(/[^\d]/g, ''))}
                  aria-label="Days of access"
                />
                <span className="text-sm text-muted-foreground">days</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={granting || !grantDays || Number(grantDays) < 1}
                  onClick={async () => {
                    setGranting(true);
                    setGrantError(null);
                    setGrantSuccess(null);
                    try {
                      await apiFetch(`/api/registrations/${props.registrationId}/lms-access`, {
                        method: 'POST',
                        body: JSON.stringify({ days: Number(grantDays) }),
                      });
                      setGrantSuccess(`Granted — recorded access for ${grantDays} days.`);
                    } catch (err) {
                      setGrantError(err instanceof Error ? err.message : 'Could not grant access.');
                    } finally {
                      setGranting(false);
                    }
                  }}
                >
                  {granting ? 'Granting…' : 'Grant recorded access'}
                </Button>
              </div>
            </Section>

            {/* Write-off (2026-08-09). Sits above the danger zone on purpose:
                for an unpaid no-show this is the action staff should reach for,
                and deleting the row is almost never the right answer. */}
            {data.registration.lapsedAt ? (
              <Section title="Written off">
                <p className="mb-2 text-sm text-muted-foreground">
                  Written off on {formatDate(data.registration.lapsedAt)}
                  {data.registration.lapsedByName
                    ? ` by ${data.registration.lapsedByName}`
                    : ' automatically'}
                  . The balance is excluded from Total Outstanding and from the collections
                  list, and the participant&apos;s portal no longer offers to take payment.
                </p>
                {data.registration.lapsedReason && (
                  <p className="mb-2 text-sm text-muted-foreground">
                    Reason: {data.registration.lapsedReason}
                  </p>
                )}
                {lapseError && <p className="mb-2 text-sm text-destructive">{lapseError}</p>}
                <Button variant="outline" size="sm" disabled={lapsing} onClick={handleReinstate}>
                  {lapsing ? 'Reinstating…' : 'Reinstate this registration'}
                </Button>
              </Section>
            ) : (
              data.canLapse && (
                <Section title="Write off">
                  <p className="mb-2 text-sm text-muted-foreground">
                    Stop treating this balance as collectible — for someone who never paid and
                    never attended. Nothing is deleted and no email is sent; the registration
                    simply leaves Total Outstanding, the collections list and the seat count,
                    and can be reinstated if they resurface.
                  </p>
                  {lapseError && <p className="mb-2 text-sm text-destructive">{lapseError}</p>}
                  <Button variant="outline" size="sm" onClick={() => setConfirmingLapse(true)}>
                    Write off this balance
                  </Button>
                </Section>
              )
            )}

            {data.canDelete && (
              <Section title="Danger zone">
                <p className="mb-2 text-sm text-muted-foreground">
                  Permanently delete this Registration and its Payment record — for a
                  wrongly-entered or test row, not a data-subject erasure request (use
                  Participant Data Deletion on the Staff Users screen for that).
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete this registration
                </Button>
              </Section>
            )}
          </div>
        )}
      </DialogContent>

      <Dialog open={transferring} onOpenChange={(open) => !open && setTransferring(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer to another cohort</DialogTitle>
            <DialogDescription>
              Only active, not-yet-started batches of the same course are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="transferBatch">Destination batch</Label>
              <select
                id="transferBatch"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={transferBatchId}
                onChange={(event) => setTransferBatchId(event.target.value)}
              >
                <option value="">Select a batch</option>
                {transferBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.cohortLabel} — {formatDate(batch.startDate)}
                    {batch.startDate < new Date().toISOString().slice(0, 10)
                      ? ' — already started'
                      : ''}
                  </option>
                ))}
              </select>
              {transferBatches.length === 0 && !transferError && (
                <p className="text-xs text-muted-foreground">
                  No other eligible batches found for this course.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="transferReason">Reason (required, recorded)</Label>
              <Input
                id="transferReason"
                placeholder="e.g. Can't make the original start date"
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
              />
            </div>
          </div>
          {transferError && <p className="text-sm text-destructive">{transferError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferring(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !transferBatchId || transferReason.trim().length < 3 || transferSubmitting
              }
              onClick={handleTransfer}
            >
              {transferSubmitting ? 'Transferring…' : 'Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingLapse} onOpenChange={(open) => !open && setConfirmingLapse(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off this balance?</DialogTitle>
            <DialogDescription>
              The registration, payment record and history are all kept — the balance simply
              stops counting as money we expect to collect. The participant is not notified.
              This can be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lapseReason">Reason (required, recorded)</Label>
            <Input
              id="lapseReason"
              placeholder="e.g. Never paid, never attended, no response to follow-up"
              value={lapseReason}
              onChange={(event) => setLapseReason(event.target.value)}
            />
          </div>
          {lapseError && <p className="text-sm text-destructive">{lapseError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingLapse(false)}>
              Cancel
            </Button>
            <Button disabled={lapseReason.trim().length < 3 || lapsing} onClick={handleLapse}>
              {lapsing ? 'Writing off…' : 'Write off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={(open) => !open && setConfirmingDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete this registration?</DialogTitle>
            <DialogDescription>
              This removes the registration and its payment record entirely — attendance,
              messages, certificates, and Zoom registration for it are removed too. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deleteReason">Reason (required, recorded)</Label>
            <Input
              id="deleteReason"
              placeholder="e.g. Duplicate test entry from staging run"
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
            />
          </div>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteReason.trim().length < 3 || deleting}
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
