'use client';

// Knowsia Growth Partner Programme staff console (2026-08-02) — one page,
// four sections, same single-page-multi-view pattern as the Payment
// Submissions screen (app/(staff)/payments/page.tsx): Applications review,
// Partners management, Codes, and Commissions & Payouts.
import { useCallback, useEffect, useState } from 'react';

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

type Category = 'ambassador' | 'tutor' | 'institutional' | 'strategic';
type PartnerStatus = 'pending' | 'active' | 'suspended' | 'rejected';
type CommissionStatus = 'pending' | 'approved' | 'payable' | 'paid' | 'clawed_back' | 'redeemed';

interface Partner {
  id: string;
  category: Category;
  fullName: string;
  email: string | null;
  phone: string;
  companyName: string | null;
  tutorId: string | null;
  commissionRate: number | null;
  payoutMethod: string | null;
  payoutDetails: string | null;
  status: PartnerStatus;
  socialLinks: string | null;
  professionalBackground: string | null;
  promotionalMethods: string | null;
  estimatedAudienceSize: string | null;
  createdAt: string;
}

interface Code {
  id: string;
  code: string;
  partnerId: string | null;
  discountType: 'percentage' | 'fixed_amount' | null;
  discountValue: number | null;
  appliesToCourseId: string | null;
  maxUses: number | null;
  usesCount: number;
  onePerParticipant: boolean;
  expiresAt: string | null;
  isActive: boolean;
}

interface CommissionRow {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerCategory: Category;
  participantName: string;
  courseName: string;
  cohortLabel: string;
  commissionAmount: number;
  status: CommissionStatus;
  qualifiesAt: string;
}

interface CourseOption {
  id: string;
  courseName: string;
  courseCode: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  ambassador: 'Ambassador',
  tutor: 'Tutor Partner',
  institutional: 'Institutional Partner',
  strategic: 'Strategic Partner',
};

function partnerStatusBadge(status: PartnerStatus) {
  if (status === 'active') return <Badge className="bg-emerald-600">Active</Badge>;
  if (status === 'pending') return <Badge className="bg-amber-500">Pending</Badge>;
  if (status === 'suspended') return <Badge variant="destructive">Suspended</Badge>;
  return <Badge variant="outline">Rejected</Badge>;
}

function commissionStatusBadge(status: CommissionStatus) {
  if (status === 'paid') return <Badge className="bg-emerald-600">Paid</Badge>;
  if (status === 'redeemed') return <Badge className="bg-emerald-600">Redeemed as credit</Badge>;
  if (status === 'payable') return <Badge className="bg-sky-600">Payable</Badge>;
  if (status === 'approved') return <Badge className="bg-amber-500">Approved</Badge>;
  if (status === 'clawed_back') return <Badge variant="destructive">Clawed back</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

const EMPTY_PARTNER_FORM = {
  category: 'ambassador' as Category,
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  tutorId: '',
  commissionRate: '',
  payoutMethod: '',
  payoutDetails: '',
};

const EMPTY_CODE_FORM = {
  code: '',
  partnerId: '',
  discountType: '' as '' | 'percentage' | 'fixed_amount',
  discountValue: '',
  appliesToCourseId: '',
  maxUses: '',
  onePerParticipant: true,
  expiresAt: '',
};

export default function PartnersPage() {
  const [view, setView] = useState<'applications' | 'partners' | 'codes' | 'commissions'>(
    'applications',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [applications, setApplications] = useState<Partner[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<'' | CommissionStatus>('');

  const [backfillingTutors, setBackfillingTutors] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);
  const [createPartnerOpen, setCreatePartnerOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER_FORM);
  const [savingPartner, setSavingPartner] = useState(false);

  const [createCodeOpen, setCreateCodeOpen] = useState(false);
  const [codeForm, setCodeForm] = useState(EMPTY_CODE_FORM);
  const [savingCode, setSavingCode] = useState(false);

  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<string>>(new Set());
  const [payoutTarget, setPayoutTarget] = useState<{ partnerId: string; partnerName: string } | null>(
    null,
  );
  const [payoutMethod, setPayoutMethod] = useState('MTN MoMo');
  const [payoutReference, setPayoutReference] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  const loadApplications = useCallback(async () => {
    try {
      const result = await apiFetch<{ partners: Partner[] }>('/api/partners?status=pending');
      setApplications(result.partners);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load applications.');
    }
  }, []);

  const loadPartners = useCallback(async () => {
    try {
      const result = await apiFetch<{ partners: Partner[] }>('/api/partners');
      setPartners(result.partners);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load partners.');
    }
  }, []);

  const loadCodes = useCallback(async () => {
    try {
      const result = await apiFetch<{ codes: Code[] }>('/api/codes');
      setCodes(result.codes);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load codes.');
    }
  }, []);

  const loadCommissions = useCallback(async (status: string) => {
    try {
      const query = status ? `?status=${status}` : '';
      const result = await apiFetch<{ commissions: CommissionRow[] }>(`/api/commissions${query}`);
      setCommissions(result.commissions);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load commissions.');
    }
  }, []);

  useEffect(() => {
    void apiFetch<{ courses: CourseOption[] }>('/api/courses')
      .then((result) => setCourses(result.courses))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    setErrorMessage(null);
    if (view === 'applications') void loadApplications();
    if (view === 'partners') void loadPartners();
    if (view === 'codes') {
      void loadCodes();
      if (partners.length === 0) void loadPartners();
    }
    if (view === 'commissions') void loadCommissions(commissionStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === 'commissions') void loadCommissions(commissionStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionStatusFilter]);

  function partnerName(partnerId: string | null): string {
    if (!partnerId) return '—';
    return partners.find((p) => p.id === partnerId)?.fullName ?? partnerId.slice(0, 8);
  }

  async function reviewApplication(id: string, decision: 'approve' | 'reject') {
    setErrorMessage(null);
    try {
      await apiFetch(`/api/partners/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await loadApplications();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to review this application.');
    }
  }

  async function toggleStatus(partner: Partner) {
    setErrorMessage(null);
    const nextStatus = partner.status === 'suspended' ? 'active' : 'suspended';
    try {
      await apiFetch(`/api/partners/${partner.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadPartners();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update partner status.');
    }
  }

  async function backfillTutorPartners() {
    setBackfillingTutors(true);
    setBackfillMessage(null);
    setErrorMessage(null);
    try {
      const result = await apiFetch<{ totalTutors: number; provisioned: number }>(
        '/api/tutors/backfill-partners',
        { method: 'POST' },
      );
      setBackfillMessage(
        `Checked ${result.totalTutors} tutor(s) — provisioned ${result.provisioned} new partner record(s).`,
      );
      await loadPartners();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to backfill tutor partners.');
    } finally {
      setBackfillingTutors(false);
    }
  }

  async function submitCreatePartner() {
    setSavingPartner(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/partners', {
        method: 'POST',
        body: JSON.stringify({
          category: partnerForm.category,
          fullName: partnerForm.fullName.trim(),
          email: partnerForm.email.trim() || null,
          phone: partnerForm.phone.trim(),
          companyName: partnerForm.companyName.trim() || null,
          tutorId: partnerForm.category === 'tutor' ? partnerForm.tutorId.trim() || null : null,
          commissionRate: partnerForm.commissionRate ? Number(partnerForm.commissionRate) : null,
          payoutMethod: partnerForm.payoutMethod || null,
          payoutDetails: partnerForm.payoutDetails.trim() || null,
        }),
      });
      setCreatePartnerOpen(false);
      setPartnerForm(EMPTY_PARTNER_FORM);
      await loadPartners();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create partner.');
    } finally {
      setSavingPartner(false);
    }
  }

  async function submitCreateCode() {
    setSavingCode(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/codes', {
        method: 'POST',
        body: JSON.stringify({
          code: codeForm.code.trim().toUpperCase(),
          partnerId: codeForm.partnerId || null,
          discountType: codeForm.discountType || null,
          discountValue: codeForm.discountValue ? Number(codeForm.discountValue) : null,
          appliesToCourseId: codeForm.appliesToCourseId || null,
          maxUses: codeForm.maxUses ? Number(codeForm.maxUses) : null,
          onePerParticipant: codeForm.onePerParticipant,
          expiresAt: codeForm.expiresAt || null,
        }),
      });
      setCreateCodeOpen(false);
      setCodeForm(EMPTY_CODE_FORM);
      await loadCodes();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create code.');
    } finally {
      setSavingCode(false);
    }
  }

  async function deactivateCode(id: string) {
    setErrorMessage(null);
    try {
      await apiFetch(`/api/codes/${id}`, { method: 'DELETE' });
      await loadCodes();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to deactivate code.');
    }
  }

  function toggleCommissionSelection(id: string) {
    setSelectedCommissionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markSelectedPayable() {
    if (selectedCommissionIds.size === 0) return;
    setErrorMessage(null);
    try {
      await apiFetch('/api/commissions/mark-payable', {
        method: 'POST',
        body: JSON.stringify({ commissionIds: Array.from(selectedCommissionIds) }),
      });
      setSelectedCommissionIds(new Set());
      await loadCommissions(commissionStatusFilter);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to mark commissions payable.');
    }
  }

  function openPayoutDialogFor(partnerId: string) {
    const ids = commissions
      .filter((c) => c.partnerId === partnerId && selectedCommissionIds.has(c.id))
      .map((c) => c.id);
    if (ids.length === 0) return;
    setPayoutTarget({ partnerId, partnerName: partnerName(partnerId) });
    setPayoutMethod('MTN MoMo');
    setPayoutReference('');
  }

  async function submitPayout() {
    if (!payoutTarget) return;
    const ids = commissions
      .filter((c) => c.partnerId === payoutTarget.partnerId && selectedCommissionIds.has(c.id))
      .map((c) => c.id);
    if (ids.length === 0) return;
    setSavingPayout(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/commissions/payout', {
        method: 'POST',
        body: JSON.stringify({
          partnerId: payoutTarget.partnerId,
          commissionIds: ids,
          method: payoutMethod,
          reference: payoutReference.trim() || null,
        }),
      });
      setPayoutTarget(null);
      setSelectedCommissionIds(new Set());
      await loadCommissions(commissionStatusFilter);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to record payout.');
    } finally {
      setSavingPayout(false);
    }
  }

  const selectedPayablePartnerIds = new Set(
    commissions
      .filter((c) => selectedCommissionIds.has(c.id) && c.status === 'payable')
      .map((c) => c.partnerId),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Partners &amp; Coupons</h1>
        <div className="flex items-center gap-2">
          {(['applications', 'partners', 'codes', 'commissions'] as const).map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={view === tab ? 'default' : 'outline'}
              onClick={() => setView(tab)}
            >
              {tab === 'applications' && `Applications${applications.length > 0 ? ` (${applications.length})` : ''}`}
              {tab === 'partners' && 'Partners'}
              {tab === 'codes' && 'Codes'}
              {tab === 'commissions' && 'Commissions & Payouts'}
            </Button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {view === 'applications' && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Audience / Methods</TableHead>
              <TableHead>Payout</TableHead>
              <TableHead>Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>
                  <p className="font-medium">{application.fullName}</p>
                  {application.companyName && (
                    <p className="text-xs text-muted-foreground">{application.companyName}</p>
                  )}
                </TableCell>
                <TableCell>{CATEGORY_LABELS[application.category]}</TableCell>
                <TableCell>
                  <p>{application.phone}</p>
                  <p className="text-xs text-muted-foreground">{application.email ?? '—'}</p>
                </TableCell>
                <TableCell className="max-w-64 text-xs text-muted-foreground">
                  {application.estimatedAudienceSize && <p>{application.estimatedAudienceSize}</p>}
                  {application.promotionalMethods && <p className="line-clamp-2">{application.promotionalMethods}</p>}
                </TableCell>
                <TableCell>
                  <p>{application.payoutMethod ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{application.payoutDetails ?? ''}</p>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void reviewApplication(application.id, 'approve')}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void reviewApplication(application.id, 'reject')}
                    >
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {view === 'applications' && applications.length === 0 && (
        <p className="text-muted-foreground">No pending applications.</p>
      )}

      {view === 'partners' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={backfillingTutors} onClick={() => void backfillTutorPartners()}>
              {backfillingTutors ? 'Backfilling…' : 'Backfill Tutor Partners'}
            </Button>
            <Button size="sm" onClick={() => setCreatePartnerOpen(true)}>
              Add Partner
            </Button>
          </div>
          {backfillMessage && <p className="text-sm text-muted-foreground">{backfillMessage}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Commission Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell>
                    <p className="font-medium">{partner.fullName}</p>
                    {partner.companyName && (
                      <p className="text-xs text-muted-foreground">{partner.companyName}</p>
                    )}
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[partner.category]}</TableCell>
                  <TableCell>
                    <p>{partner.phone}</p>
                    <p className="text-xs text-muted-foreground">{partner.email ?? '—'}</p>
                  </TableCell>
                  <TableCell>{partner.commissionRate !== null ? `${partner.commissionRate}%` : 'Tiered'}</TableCell>
                  <TableCell>{partnerStatusBadge(partner.status)}</TableCell>
                  <TableCell>
                    {(partner.status === 'active' || partner.status === 'suspended') && (
                      <Button
                        size="sm"
                        variant={partner.status === 'suspended' ? 'default' : 'outline'}
                        onClick={() => void toggleStatus(partner)}
                      >
                        {partner.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {partners.length === 0 && <p className="text-muted-foreground">No partners yet.</p>}
        </div>
      )}

      {view === 'codes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreateCodeOpen(true)}>
              Create Code
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => (
                <TableRow key={code.id}>
                  <TableCell className="font-mono">{code.code}</TableCell>
                  <TableCell>{partnerName(code.partnerId)}</TableCell>
                  <TableCell>
                    {code.discountType && code.discountValue !== null
                      ? code.discountType === 'percentage'
                        ? `${code.discountValue}% off`
                        : `${formatGhs(code.discountValue)} off`
                      : 'Attribution only'}
                  </TableCell>
                  <TableCell>
                    {code.usesCount}
                    {code.maxUses !== null ? ` / ${code.maxUses}` : ''}
                  </TableCell>
                  <TableCell>
                    {code.isActive ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {code.isActive && (
                      <Button size="sm" variant="destructive" onClick={() => void deactivateCode(code.id)}>
                        Deactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {codes.length === 0 && <p className="text-muted-foreground">No codes yet.</p>}
        </div>
      )}

      {view === 'commissions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={commissionStatusFilter}
              onChange={(event) => setCommissionStatusFilter(event.target.value as '' | CommissionStatus)}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="payable">Payable</option>
              <option value="paid">Paid</option>
              <option value="redeemed">Redeemed as credit</option>
              <option value="clawed_back">Clawed back</option>
            </select>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={selectedCommissionIds.size === 0} onClick={() => void markSelectedPayable()}>
                Mark selected payable
              </Button>
              <Button
                size="sm"
                disabled={selectedPayablePartnerIds.size !== 1}
                onClick={() => {
                  const [partnerId] = Array.from(selectedPayablePartnerIds);
                  if (partnerId) openPayoutDialogFor(partnerId);
                }}
              >
                Record payout
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Participant / Course</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Qualifies</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission) => (
                <TableRow key={commission.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedCommissionIds.has(commission.id)}
                      onChange={() => toggleCommissionSelection(commission.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{commission.partnerName}</p>
                    <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[commission.partnerCategory]}</p>
                  </TableCell>
                  <TableCell>
                    <p>{commission.participantName}</p>
                    <p className="text-xs text-muted-foreground">{commission.courseName} — {commission.cohortLabel}</p>
                  </TableCell>
                  <TableCell>{formatGhs(commission.commissionAmount)}</TableCell>
                  <TableCell>{commission.qualifiesAt}</TableCell>
                  <TableCell>{commissionStatusBadge(commission.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {commissions.length === 0 && <p className="text-muted-foreground">No commissions match this filter.</p>}
        </div>
      )}

      <Dialog open={createPartnerOpen} onOpenChange={setCreatePartnerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Partner</DialogTitle>
            <DialogDescription>
              Staff-direct creation — status starts Active immediately, no review step. Use this for
              Tutor and Strategic Partners.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="partnerCategory">Type</Label>
              <select
                id="partnerCategory"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={partnerForm.category}
                onChange={(event) =>
                  setPartnerForm({ ...partnerForm, category: event.target.value as Category })
                }
              >
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerFullName">Full Name</Label>
              <Input
                id="partnerFullName"
                value={partnerForm.fullName}
                onChange={(event) => setPartnerForm({ ...partnerForm, fullName: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerPhone">Phone</Label>
              <Input
                id="partnerPhone"
                value={partnerForm.phone}
                onChange={(event) => setPartnerForm({ ...partnerForm, phone: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partnerEmail">Email (optional)</Label>
              <Input
                id="partnerEmail"
                type="email"
                value={partnerForm.email}
                onChange={(event) => setPartnerForm({ ...partnerForm, email: event.target.value })}
              />
            </div>
            {partnerForm.category === 'tutor' && (
              <div className="space-y-2">
                <Label htmlFor="partnerTutorId">Tutor ID</Label>
                <Input
                  id="partnerTutorId"
                  placeholder="Copy from the Tutors screen"
                  value={partnerForm.tutorId}
                  onChange={(event) => setPartnerForm({ ...partnerForm, tutorId: event.target.value })}
                />
              </div>
            )}
            {partnerForm.category === 'institutional' && (
              <div className="space-y-2">
                <Label htmlFor="partnerCompanyName">Organisation Name</Label>
                <Input
                  id="partnerCompanyName"
                  value={partnerForm.companyName}
                  onChange={(event) => setPartnerForm({ ...partnerForm, companyName: event.target.value })}
                />
              </div>
            )}
            {partnerForm.category === 'strategic' && (
              <div className="space-y-2">
                <Label htmlFor="partnerCommissionRate">Negotiated Commission Rate (%)</Label>
                <Input
                  id="partnerCommissionRate"
                  type="number"
                  min="0"
                  max="100"
                  value={partnerForm.commissionRate}
                  onChange={(event) => setPartnerForm({ ...partnerForm, commissionRate: event.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="partnerPayoutMethod">Payout Method</Label>
              <select
                id="partnerPayoutMethod"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={partnerForm.payoutMethod}
                onChange={(event) => setPartnerForm({ ...partnerForm, payoutMethod: event.target.value })}
              >
                <option value="">Select a method</option>
                <option value="MTN MoMo">MTN MoMo</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            {partnerForm.payoutMethod && (
              <div className="space-y-2">
                <Label htmlFor="partnerPayoutDetails">Payout Details</Label>
                <Input
                  id="partnerPayoutDetails"
                  value={partnerForm.payoutDetails}
                  onChange={(event) => setPartnerForm({ ...partnerForm, payoutDetails: event.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePartnerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitCreatePartner()}
              disabled={
                savingPartner ||
                !partnerForm.fullName.trim() ||
                !partnerForm.phone.trim() ||
                (partnerForm.category === 'tutor' && !partnerForm.tutorId.trim())
              }
            >
              {savingPartner ? 'Saving…' : 'Add Partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCodeOpen} onOpenChange={setCreateCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Code</DialogTitle>
            <DialogDescription>
              A code can carry a discount, attribute to a partner, or both.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="codeValue">Code</Label>
              <Input
                id="codeValue"
                className="uppercase"
                value={codeForm.code}
                onChange={(event) => setCodeForm({ ...codeForm, code: event.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="codePartner">Partner (optional)</Label>
              <select
                id="codePartner"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={codeForm.partnerId}
                onChange={(event) => setCodeForm({ ...codeForm, partnerId: event.target.value })}
              >
                <option value="">No partner (pure coupon)</option>
                {partners
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} — {CATEGORY_LABELS[p.category]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="codeDiscountType">Discount Type (optional)</Label>
                <select
                  id="codeDiscountType"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={codeForm.discountType}
                  onChange={(event) =>
                    setCodeForm({ ...codeForm, discountType: event.target.value as '' | 'percentage' | 'fixed_amount' })
                  }
                >
                  <option value="">None (attribution only)</option>
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed amount (GHS)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="codeDiscountValue">Discount Value</Label>
                <Input
                  id="codeDiscountValue"
                  type="number"
                  min="0"
                  disabled={!codeForm.discountType}
                  value={codeForm.discountValue}
                  onChange={(event) => setCodeForm({ ...codeForm, discountValue: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="codeCourse">Restrict to Course (optional)</Label>
              <select
                id="codeCourse"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={codeForm.appliesToCourseId}
                onChange={(event) => setCodeForm({ ...codeForm, appliesToCourseId: event.target.value })}
              >
                <option value="">Any course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.courseCode} — {course.courseName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="codeMaxUses">Max Uses (optional)</Label>
                <Input
                  id="codeMaxUses"
                  type="number"
                  min="1"
                  value={codeForm.maxUses}
                  onChange={(event) => setCodeForm({ ...codeForm, maxUses: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codeExpiresAt">Expires (optional)</Label>
                <Input
                  id="codeExpiresAt"
                  type="date"
                  value={codeForm.expiresAt}
                  onChange={(event) => setCodeForm({ ...codeForm, expiresAt: event.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="codeOnePerParticipant"
                type="checkbox"
                checked={codeForm.onePerParticipant}
                onChange={(event) => setCodeForm({ ...codeForm, onePerParticipant: event.target.checked })}
              />
              <Label htmlFor="codeOnePerParticipant" className="font-normal">
                One use per participant
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateCodeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitCreateCode()}
              disabled={
                savingCode ||
                !codeForm.code.trim() ||
                (!codeForm.partnerId && !codeForm.discountType)
              }
            >
              {savingCode ? 'Saving…' : 'Create Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payoutTarget !== null} onOpenChange={(open) => !open && setPayoutTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payout</DialogTitle>
            <DialogDescription>
              {payoutTarget
                ? `Paying ${payoutTarget.partnerName} for ${
                    commissions.filter((c) => c.partnerId === payoutTarget.partnerId && selectedCommissionIds.has(c.id))
                      .length
                  } commission(s), total ${formatGhs(
                    commissions
                      .filter((c) => c.partnerId === payoutTarget.partnerId && selectedCommissionIds.has(c.id))
                      .reduce((sum, c) => sum + c.commissionAmount, 0),
                  )}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="payoutMethod">Method</Label>
              <select
                id="payoutMethod"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={payoutMethod}
                onChange={(event) => setPayoutMethod(event.target.value)}
              >
                <option value="MTN MoMo">MTN MoMo</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payoutReference">Reference (optional)</Label>
              <Input
                id="payoutReference"
                value={payoutReference}
                onChange={(event) => setPayoutReference(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitPayout()} disabled={savingPayout}>
              {savingPayout ? 'Saving…' : 'Record payout'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
