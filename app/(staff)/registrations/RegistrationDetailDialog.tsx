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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatGhs } from '@/lib/utils';

interface Registration360 {
  registration: {
    id: string;
    registrationStatus: string;
    leadSource: string;
    notes: string | null;
    registeredAt: string;
  };
  participant: {
    fullName: string;
    email: string;
    phone: string;
    jobTitle: string | null;
    company: string | null;
    gender: string | null;
    deleted: boolean;
  } | null;
  course: {
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
    facilitatorRating: number;
    recommendRating: number;
    improvementText: string | null;
    testimonialConsent: boolean;
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

export function RegistrationDetailDialog(props: {
  registrationId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Registration360 | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
                    </>
                  )}
                </div>
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
                      Overall {data.feedback.overallRating}/5 · Facilitator{' '}
                      {data.feedback.facilitatorRating}/5 · Recommend{' '}
                      {data.feedback.recommendRating}/5
                    </p>
                    {data.feedback.improvementText && (
                      <p className="mt-1 text-muted-foreground">
                        &ldquo;{data.feedback.improvementText}&rdquo;
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
