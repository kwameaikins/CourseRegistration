'use client';

// Bulk import — staff backfill of registrations collected outside the
// system (e.g. a Google Form). One Batch, one Payment Method, one Lead
// Source per run; each CSV row becomes a registration + (if it has an
// amount paid) a payment, using the exact same comms the normal public
// registration flow sends.
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseCsv } from '@/lib/csv';
import { effectiveCourseFee } from '@/lib/utils';

interface Course {
  id: string;
  courseName: string;
}

interface Batch {
  id: string;
  courseId: string;
  cohortLabel: string;
  startDate: string;
  courseFee: number;
  discountCutoffDate: string | null;
  discountedFee: number | null;
}

const TARGET_FIELDS = [
  { key: 'firstName', label: 'First name', required: true },
  { key: 'middleName', label: 'Middle name', required: false },
  { key: 'surname', label: 'Surname', required: true },
  { key: 'gender', label: 'Gender', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'jobTitle', label: 'Job title', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'amountPaid', label: 'Amount paid', required: false },
] as const;

type FieldKey = (typeof TARGET_FIELDS)[number]['key'];
type ColumnMap = Partial<Record<FieldKey, number>>;

const LEAD_SOURCES = ['Other', 'WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website'];
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'MTN MoMo', 'Paystack Card', 'Other'];

const GUESS_PATTERNS: Record<FieldKey, RegExp> = {
  firstName: /first/i,
  middleName: /middle/i,
  surname: /(sur|last)\s*name/i,
  gender: /gender|sex/i,
  email: /e-?mail/i,
  phone: /phone|mobile|whatsapp|contact/i,
  jobTitle: /job|title|role|position/i,
  company: /company|organi[sz]ation|employer/i,
  amountPaid: /amount|paid|payment/i,
};

function guessColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (const field of TARGET_FIELDS) {
    const idx = headers.findIndex((h) => GUESS_PATTERNS[field.key].test(h));
    if (idx !== -1) map[field.key] = idx;
  }
  return map;
}

function normalizeGender(raw: string): 'Male' | 'Female' | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith('m')) return 'Male';
  if (v.startsWith('f')) return 'Female';
  return null;
}

// Google Forms' "number"-type fields silently drop a leading 0, so a
// Ghanaian mobile number like 0245121941 commonly comes through as
// 245121941 (9 digits) — restore it so it passes the same min-10 rule the
// public registration form applies, and so it normalizes correctly later
// when WhatsApp/SMS actually send to it (see normalizeWhatsappPhone).
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 9 && !trimmed.startsWith('+')) {
    return `0${digitsOnly}`;
  }
  return trimmed;
}

interface MappedRow {
  rowIndex: number;
  firstName: string;
  middleName: string;
  surname: string;
  gender: 'Male' | 'Female' | null;
  email: string;
  phone: string;
  jobTitle: string;
  company: string;
  amountPaid: number;
  errors: string[];
}

function buildMappedRows(dataRows: string[][], map: ColumnMap): MappedRow[] {
  const get = (row: string[], key: FieldKey) => {
    const idx = map[key];
    return idx === undefined ? '' : (row[idx] ?? '').trim();
  };

  return dataRows.map((row, rowIndex) => {
    const errors: string[] = [];
    const firstName = get(row, 'firstName');
    const surname = get(row, 'surname');
    const email = get(row, 'email').toLowerCase();
    const phone = normalizePhone(get(row, 'phone'));
    const genderRaw = get(row, 'gender');
    const gender = normalizeGender(genderRaw);
    const amountPaidRaw = get(row, 'amountPaid').replace(/[^0-9.]/g, '');
    const amountPaid = amountPaidRaw ? Number(amountPaidRaw) : 0;

    if (!firstName) errors.push('Missing first name');
    if (!surname) errors.push('Missing surname');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('Missing/invalid email');
    if (!phone || phone.length < 10) errors.push('Missing/invalid phone (min 10 chars)');
    if (!gender) errors.push('Gender must be Male or Female');
    if (Number.isNaN(amountPaid) || amountPaid < 0) errors.push('Invalid amount paid');

    return {
      rowIndex,
      firstName,
      middleName: get(row, 'middleName'),
      surname,
      gender,
      email,
      phone,
      jobTitle: get(row, 'jobTitle'),
      company: get(row, 'company'),
      amountPaid: Number.isNaN(amountPaid) ? 0 : amountPaid,
      errors,
    };
  });
}

type RowResult = { index: number; email: string; status: string; message?: string; paymentStatus?: string };

export default function ImportRegistrationsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courseId, setCourseId] = useState('');
  const [batchId, setBatchId] = useState('');

  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  // Per-row override for the fee this person actually owed — needed because
  // a backfilled row's "today" is long after the batch's discount cutoff, so
  // the fee that would otherwise be auto-derived (effectiveCourseFee) is
  // wrong for anyone who paid the early-bird price back when they originally
  // registered. Defaults to the batch's current effective fee; edit it down
  // for early-discount rows so amountPaid vs. courseFee comes out as Paid
  // instead of Part Payment.
  const [courseFeeOverrides, setCourseFeeOverrides] = useState<Record<number, number>>({});

  const [leadSource, setLeadSource] = useState('Other');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notesSuffix, setNotesSuffix] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<{
    results: RowResult[];
    summary: { created: number; duplicates: number; errors: number; paid: number; unpaid: number };
  } | null>(null);

  useEffect(() => {
    apiFetch<{ courses: Course[] }>('/api/courses')
      .then((result) => setCourses(result.courses))
      .catch(() => undefined);
  }, []);

  async function onCourseChange(newCourseId: string) {
    setCourseId(newCourseId);
    setBatchId('');
    setBatches([]);
    if (!newCourseId) return;
    try {
      const result = await apiFetch<{ batches: Batch[] }>(
        `/api/batches?courseId=${newCourseId}`,
      );
      setBatches(result.batches);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load batches.');
    }
  }

  function onFileSelected(file: File) {
    setRunResult(null);
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setErrorMessage('That CSV has no data rows.');
        return;
      }
      const [headerRow, ...rest] = rows;
      setHeaders(headerRow);
      setDataRows(rest);
      setColumnMap(guessColumnMap(headerRow));
      setExcludedRows(new Set());
      setCourseFeeOverrides({});
    };
    reader.readAsText(file);
  }

  const selectedBatch = batches.find((batch) => batch.id === batchId) ?? null;
  const defaultCourseFee = selectedBatch ? effectiveCourseFee(selectedBatch) : 0;

  const mappedRows = useMemo(() => buildMappedRows(dataRows, columnMap), [dataRows, columnMap]);
  const includedRows = mappedRows.filter(
    (row) => row.errors.length === 0 && !excludedRows.has(row.rowIndex),
  );

  function toggleRow(rowIndex: number) {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  function courseFeeFor(rowIndex: number): number {
    return courseFeeOverrides[rowIndex] ?? defaultCourseFee;
  }

  function setCourseFeeFor(rowIndex: number, fee: number) {
    setCourseFeeOverrides((prev) => ({ ...prev, [rowIndex]: fee }));
  }

  async function submitImport() {
    setErrorMessage(null);
    if (!batchId) {
      setErrorMessage('Choose a course and batch first.');
      return;
    }
    if (includedRows.length === 0) {
      setErrorMessage('No valid rows to import.');
      return;
    }
    if (!consentConfirmed) {
      setErrorMessage('You must confirm consent was captured on the original form.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{
        results: RowResult[];
        summary: { created: number; duplicates: number; errors: number; paid: number; unpaid: number };
      }>('/api/registrations/bulk-import', {
        method: 'POST',
        body: JSON.stringify({
          batchId,
          leadSource,
          paymentMethod,
          notesSuffix: notesSuffix.trim() || undefined,
          consentConfirmed: true,
          rows: includedRows.map((row) => ({
            firstName: row.firstName,
            middleName: row.middleName || null,
            surname: row.surname,
            gender: row.gender,
            email: row.email,
            phone: row.phone,
            jobTitle: row.jobTitle || null,
            company: row.company || null,
            amountPaid: row.amountPaid,
            courseFee: courseFeeFor(row.rowIndex),
          })),
        }),
      });
      setRunResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import Registrations</h1>
        <p className="text-sm text-muted-foreground">
          Backfill registrations collected outside the system (e.g. a Google Form export) — some
          rows can be marked paid, others left unpaid.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">1. Course &amp; batch</h2>
        <div className="flex flex-wrap gap-3">
          <select
            className={selectClass}
            value={courseId}
            onChange={(event) => void onCourseChange(event.target.value)}
          >
            <option value="">Select a course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.courseName}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            disabled={!courseId}
          >
            <option value="">Select a batch / cohort</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.cohortLabel} ({batch.startDate})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">2. Upload CSV</h2>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelected(file);
          }}
        />
        {headers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {dataRows.length} row(s) detected · {headers.length} column(s)
          </p>
        )}
      </section>

      {headers.length > 0 && (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">3. Map columns</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {TARGET_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-sm">
                <span>
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </span>
                <select
                  className={selectClass}
                  value={columnMap[field.key] ?? ''}
                  onChange={(event) =>
                    setColumnMap((prev) => ({
                      ...prev,
                      [field.key]:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">— not mapped —</option>
                  {headers.map((header, idx) => (
                    <option key={idx} value={idx}>
                      {header || `Column ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {mappedRows.length > 0 && (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">
            4. Preview ({includedRows.length} of {mappedRows.length} will be imported)
          </h2>
          {selectedBatch && (
            <p className="text-xs text-muted-foreground">
              Course fee defaults to {defaultCourseFee} for every row (the batch&apos;s current
              fee — the early-registration discount window has likely already closed for a
              backfill). If someone actually paid the discounted price, edit their row&apos;s
              course fee down to match what they paid, so they come out as Paid rather than Part
              Payment.
            </p>
          )}
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2" />
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Amount paid</th>
                  <th className="p-2">Course fee</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.map((row) => {
                  const hasErrors = row.errors.length > 0;
                  const excluded = excludedRows.has(row.rowIndex);
                  return (
                    <tr key={row.rowIndex} className="border-b last:border-0">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={!hasErrors && !excluded}
                          disabled={hasErrors}
                          onChange={() => toggleRow(row.rowIndex)}
                        />
                      </td>
                      <td className="p-2">
                        {[row.firstName, row.middleName, row.surname].filter(Boolean).join(' ')}
                      </td>
                      <td className="p-2">{row.email}</td>
                      <td className="p-2">{row.phone}</td>
                      <td className="p-2">{row.amountPaid > 0 ? row.amountPaid : '—'}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-8 w-24"
                          value={courseFeeFor(row.rowIndex)}
                          onChange={(event) =>
                            setCourseFeeFor(row.rowIndex, Number(event.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="p-2">
                        {hasErrors ? (
                          <span className="text-xs text-destructive">{row.errors.join('; ')}</span>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mappedRows.length > 0 && (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">5. Run settings</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span>Lead source</span>
              <select
                className={selectClass}
                value={leadSource}
                onChange={(event) => setLeadSource(event.target.value)}
              >
                {LEAD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Payment method (for paid rows)</span>
              <select
                className={selectClass}
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Notes (applied to every imported registration)</span>
              <Input
                className="h-9 w-72"
                placeholder={`Imported from Google Form — ${new Date().toISOString().slice(0, 10)}`}
                value={notesSuffix}
                onChange={(event) => setNotesSuffix(event.target.value)}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) => setConsentConfirmed(event.target.checked)}
            />
            I confirm these participants consented to data processing when they submitted the
            original form.
          </label>
          <p className="text-xs text-muted-foreground">
            Each imported registration sends the same welcome/payment-instruction messages a
            normal registrant gets; rows with an amount paid additionally get the normal
            payment-confirmation message and Zoom link.
          </p>
          <Button onClick={() => void submitImport()} disabled={submitting}>
            {submitting ? 'Importing…' : `Import ${includedRows.length} registration(s)`}
          </Button>
        </section>
      )}

      {runResult && (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">Results</h2>
          <p className="text-sm text-muted-foreground">
            {runResult.summary.created} created · {runResult.summary.duplicates} duplicates
            skipped · {runResult.summary.errors} errors · {runResult.summary.paid} marked paid ·{' '}
            {runResult.summary.unpaid} unpaid
          </p>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {runResult.results.map((row) => (
                  <tr key={row.index} className="border-b last:border-0">
                    <td className="p-2">{row.email}</td>
                    <td className="p-2">
                      {row.status === 'created' && <Badge className="bg-emerald-600">Created</Badge>}
                      {row.status === 'duplicate' && <Badge variant="secondary">Duplicate</Badge>}
                      {row.status === 'error' && <Badge variant="destructive">Error</Badge>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {row.message ?? row.paymentStatus ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
