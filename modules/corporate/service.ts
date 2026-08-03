// Corporate registration business rules (BR-26 through BR-30, founder-
// approved 2026-07-26). See Coding Docs/15_Corporate_Operations.md.
import { hashPin, lastFourDigits, verifyPin } from '@/lib/portal-auth/pin';
import { AppError } from '@/lib/errors';
import * as corporateRepository from '@/modules/corporate/repository';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import * as registrationsService from '@/modules/registrations/service';
import { parsePaymentStatus } from '@/lib/domain/parsers';
import type {
  AddEmployeesInput,
  AddEmployeesResult,
  Company,
  CompanyAllocationDetail,
  CompanyBatchAllocation,
  CompanyPortalChangePinInput,
  CompanyPortalDashboard,
  CompanyPortalLoginInput,
  CompanyPortalLoginResult,
  CreateCompanyInput,
  CreateSeatAllocationInput,
  UpdateAllocationStatusInput,
} from '@/modules/corporate/types';
import type { Database } from '@/lib/supabase/database.types';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type AllocationRow = Database['public']['Tables']['company_batch_allocations']['Row'];

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    tin: row.tin,
    billingContactName: row.billing_contact_name,
    billingEmail: row.billing_email,
    billingPhone: row.billing_phone,
    billingAddress: row.billing_address,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAllocation(row: AllocationRow): CompanyBatchAllocation {
  return {
    id: row.id,
    companyId: row.company_id,
    batchId: row.batch_id,
    seatsPurchased: row.seats_purchased,
    pricePerSeat: Number(row.price_per_seat),
    status: row.status as CompanyBatchAllocation['status'],
    statusReason: row.status_reason,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STAFF_ROLES_MANAGE = ['admin', 'finance'] as const;
const STAFF_ROLES_READ = ['admin', 'finance', 'marketing', 'management'] as const;

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const staffUser = await usersService.requireRole([...STAFF_ROLES_MANAGE]);
  const row = await corporateRepository.insertCompany(input, staffUser.id);

  // Every company gets portal access from the moment it's created — same
  // "always seed, never overwrite" posture as ensureParticipantAuth (called
  // per-registration). A seeding failure must not fail company creation.
  try {
    const initialPin = lastFourDigits(input.billingPhone);
    if (initialPin) {
      await corporateRepository.insertCompanyAuthIfMissing(row.id, hashPin(initialPin));
    }
  } catch (err) {
    console.error('[corporate createCompany portal auth provision]', err);
  }

  return toCompany(row);
}

export async function listCompanies(): Promise<Company[]> {
  await usersService.requireRole([...STAFF_ROLES_READ]);
  const rows = await corporateRepository.selectCompanies();
  return rows.map(toCompany);
}

export async function getCompanyById(id: string): Promise<Company> {
  await usersService.requireRole([...STAFF_ROLES_READ]);
  const row = await corporateRepository.selectCompanyById(id);
  if (!row) throw new AppError('NOT_FOUND', 'Company not found.', 404);
  return toCompany(row);
}

export async function listAllocationsForCompany(companyId: string): Promise<CompanyBatchAllocation[]> {
  await usersService.requireRole([...STAFF_ROLES_READ]);
  const rows = await corporateRepository.selectAllocationsForCompany(companyId);
  return rows.map(toAllocation);
}

// BR-26: a seat allocation's seats_purchased must never exceed the batch's
// seats remaining at time of sale — capacity is reserved immediately (via
// coursesService.adjustBatchCapacityInternal), not just at fill time.
export async function createSeatAllocation(
  input: CreateSeatAllocationInput,
): Promise<CompanyBatchAllocation> {
  const staffUser = await usersService.requireRole([...STAFF_ROLES_MANAGE]);

  const company = await corporateRepository.selectCompanyById(input.companyId);
  if (!company) throw new AppError('NOT_FOUND', 'Company not found.', 404);

  const batch = await coursesService.getBatchByIdSystem(input.batchId);
  if (!batch) throw new AppError('INVALID_BATCH', 'That course intake does not exist.', 400);

  const seatsRemaining = await coursesService.getSeatsRemaining(input.batchId);
  if (seatsRemaining !== null && input.seatsPurchased > seatsRemaining) {
    throw new AppError(
      'INSUFFICIENT_CAPACITY',
      `Only ${seatsRemaining} seat(s) remain in this batch — cannot sell ${input.seatsPurchased}.`,
      409,
    );
  }

  const row = await corporateRepository.insertAllocation(input, staffUser.id);

  // Reserve the full purchase immediately, regardless of fill status — see
  // Coding Docs/15_Corporate_Operations.md's capacity-reservation invariant.
  // A reservation failure must not silently lose the sale; surface it.
  await coursesService.adjustBatchCapacityInternal(input.batchId, -input.seatsPurchased);

  return toAllocation(row);
}

export async function getAllocationById(id: string): Promise<CompanyAllocationDetail> {
  await usersService.requireRole([...STAFF_ROLES_READ]);
  return buildAllocationDetail(id);
}

// Shared by the staff and company-portal read paths (system-context lookups
// throughout, since the company portal has no Supabase Auth session for RLS
// to key off — same posture as modules/portal).
async function buildAllocationDetail(id: string): Promise<CompanyAllocationDetail> {
  const row = await corporateRepository.selectAllocationByIdSystem(id);
  if (!row) throw new AppError('NOT_FOUND', 'Seat allocation not found.', 404);

  const [company, batch, roster] = await Promise.all([
    corporateRepository.selectCompanyByIdSystem(row.company_id),
    coursesService.getBatchByIdSystem(row.batch_id),
    corporateRepository.selectRegistrationsForAllocationSystem(id),
  ]);
  const course = batch ? await coursesService.getCourseByIdSystem(batch.courseId) : null;

  let amountInvoiced = 0;
  let amountSettled = 0;
  const employees = roster.map(({ registration, participant, payment }) => {
    const courseFee = payment ? Number(payment.course_fee) : 0;
    const amountPaid = payment ? Number(payment.amount_paid) : 0;
    amountInvoiced += courseFee;
    amountSettled += amountPaid;
    return {
      registrationId: registration.id,
      fullName: participant?.full_name ?? '[unavailable]',
      email: participant?.email ?? '',
      phone: participant?.phone ?? '',
      paymentStatus: payment ? parsePaymentStatus(payment.payment_status) : 'Unpaid',
      amountPaid,
      courseFee,
      registeredAt: registration.registered_at,
    };
  });

  return {
    ...toAllocation(row),
    companyName: company?.name ?? '[unavailable]',
    batchCohortLabel: batch?.cohortLabel ?? '',
    batchStartDate: batch?.startDate ?? '',
    courseName: course?.courseName ?? '',
    seatsUsed: employees.length,
    seatsRemaining: Math.max(row.seats_purchased - employees.length, 0),
    amountInvoiced,
    amountSettled,
    employees,
  };
}

// BR-27 (dedup) is enforced by createCorporateEmployeeRegistration's
// underlying unique(participant_id, batch_id) — a duplicate row here just
// means the same behavior bulk import already has (skip, don't fail the
// whole run).
export async function addEmployeesToAllocation(
  allocationId: string,
  input: AddEmployeesInput,
  actor: { id: string; fullName: string; role: string },
): Promise<AddEmployeesResult> {
  const row = await corporateRepository.selectAllocationByIdSystem(allocationId);
  if (!row) throw new AppError('NOT_FOUND', 'Seat allocation not found.', 404);
  if (row.status !== 'active') {
    throw new AppError('CONFLICT', 'This seat allocation is no longer active.', 409);
  }

  const company = await corporateRepository.selectCompanyByIdSystem(row.company_id);
  const batch = await coursesService.getBatchByIdSystem(row.batch_id);
  if (!batch) throw new AppError('INVALID_BATCH', 'That course intake does not exist.', 400);

  let seatsUsed = await corporateRepository.countRegistrationsForAllocationSystem(allocationId);

  const results: AddEmployeesResult['results'] = [];
  const summary = { created: 0, duplicates: 0, errors: 0 };

  for (let index = 0; index < input.rows.length; index++) {
    const employeeRow = input.rows[index];

    if (seatsUsed >= row.seats_purchased) {
      results.push({
        index,
        email: employeeRow.email,
        status: 'seats_exhausted',
        message: 'No seats remain in this allocation.',
      });
      summary.errors++;
      continue;
    }

    try {
      const result = await registrationsService.createCorporateEmployeeRegistration(
        employeeRow,
        {
          batchId: row.batch_id,
          leadSource: input.leadSource,
          paymentMethod: input.paymentMethod,
          courseFee: batch.courseFee,
          isFree: batch.isFree,
          companyAllocationId: allocationId,
          companyName: company?.name ?? 'Corporate client',
        },
        actor,
      );

      if (result.status === 'duplicate') {
        results.push({
          index,
          email: employeeRow.email,
          status: 'duplicate',
          message: 'Already registered for this course intake.',
        });
        summary.duplicates++;
        continue;
      }

      // Converts one reserved-but-unfilled seat into a real counted
      // registration — net-zero change in public availability, so this
      // deliberately does NOT go through updateBatch (no waitlist-notify).
      await coursesService.adjustBatchCapacityInternal(row.batch_id, 1);
      seatsUsed += 1;

      results.push({ index, email: employeeRow.email, status: 'created' });
      summary.created++;
    } catch (err) {
      console.error('[corporate addEmployeesToAllocation row]', err);
      results.push({
        index,
        email: employeeRow.email,
        status: 'error',
        message: err instanceof AppError ? err.message : 'Unexpected error adding this employee.',
      });
      summary.errors++;
    }
  }

  return { results, summary };
}

// BR-30: cancelling releases unfilled seats back to public capacity via the
// full updateBatch (so the existing waitlist-notify side effect fires
// correctly) and never touches already-created employee registrations.
export async function updateSeatAllocationStatus(
  allocationId: string,
  input: UpdateAllocationStatusInput,
): Promise<CompanyBatchAllocation> {
  await usersService.requireRole([...STAFF_ROLES_MANAGE]);

  const row = await corporateRepository.selectAllocationByIdSystem(allocationId);
  if (!row) throw new AppError('NOT_FOUND', 'Seat allocation not found.', 404);
  if (row.status !== 'active') {
    throw new AppError('CONFLICT', 'This seat allocation has already been closed.', 409);
  }

  if (input.status === 'cancelled') {
    const seatsUsed = await corporateRepository.countRegistrationsForAllocationSystem(allocationId);
    const unfilled = Math.max(row.seats_purchased - seatsUsed, 0);
    if (unfilled > 0) {
      const batch = await coursesService.getBatchByIdSystem(row.batch_id);
      if (batch && batch.capacity !== null) {
        await coursesService.updateBatch(row.batch_id, { capacity: batch.capacity + unfilled });
      }
    }
  }

  const updated = await corporateRepository.updateAllocation(allocationId, {
    status: input.status,
    status_reason: input.reason,
  });
  return toAllocation(updated);
}

// Phase 3 dashboard summary — companies count, seats sold/filled, and
// invoiced/settled totals across every allocation, computed live (same
// "derived, never stored" posture as the allocation detail rollup) so it
// can never drift from the individual detail screens. Admin/management only
// — same gate as dashboardService.getDashboardSummary, which folds this in.
export async function getCorporateSummary(): Promise<{
  totalCompanies: number;
  seatsSold: number;
  seatsFilled: number;
  amountInvoiced: number;
  amountSettled: number;
}> {
  const [totalCompanies, allocations, registrationTotals] = await Promise.all([
    corporateRepository.countCompaniesSystem(),
    corporateRepository.selectAllAllocationsSystem(),
    corporateRepository.selectCorporateRegistrationTotalsSystem(),
  ]);

  const seatsSold = allocations.reduce((sum, row) => sum + row.seats_purchased, 0);
  const seatsFilled = registrationTotals.length;
  const amountInvoiced = round2(registrationTotals.reduce((sum, row) => sum + row.courseFee, 0));
  const amountSettled = round2(registrationTotals.reduce((sum, row) => sum + row.amountPaid, 0));

  return { totalCompanies, seatsSold, seatsFilled, amountInvoiced, amountSettled };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- Company portal auth (Phase 2, BR-28/BR-29) — mirrors
// modules/portal/service.ts's login/requirePortalSession/changePin/logout
// exactly, scoped to company_id instead of participant_id. Every failure
// branch returns the same generic 'invalid' status — no enumeration. ---

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function loginToCompanyPortal(
  input: CompanyPortalLoginInput,
): Promise<CompanyPortalLoginResult> {
  const company = await corporateRepository.selectCompanyByEmailSystem(
    input.billingEmail.trim().toLowerCase(),
  );
  if (!company) return { status: 'invalid' };

  let auth = await corporateRepository.selectCompanyAuth(company.id);
  if (!auth) {
    const initialPin = lastFourDigits(company.billing_phone);
    if (initialPin) {
      await corporateRepository.insertCompanyAuthIfMissing(company.id, hashPin(initialPin));
      auth = await corporateRepository.selectCompanyAuth(company.id);
    }
  }
  if (!auth) return { status: 'invalid' };

  if (auth.locked_until && new Date(auth.locked_until) > new Date()) {
    return { status: 'locked' };
  }

  if (!verifyPin(input.pin, auth.pin_hash)) {
    const nextFailedAttempts = auth.failed_attempts + 1;
    if (nextFailedAttempts >= LOCKOUT_THRESHOLD) {
      await corporateRepository.recordFailedCompanyLogin(company.id, {
        failed_attempts: 0,
        locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
      });
      return { status: 'locked' };
    }
    await corporateRepository.recordFailedCompanyLogin(company.id, {
      failed_attempts: nextFailedAttempts,
      locked_until: null,
    });
    return { status: 'invalid' };
  }

  await corporateRepository.recordSuccessfulCompanyLogin(company.id);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const session = await corporateRepository.insertCompanySession(company.id, expiresAt);
  return { status: 'ok', sessionId: session.id, expiresAt, mustChangePin: auth.must_change_pin };
}

export async function requireCompanyPortalSession(
  sessionId: string | undefined,
): Promise<{ companyId: string }> {
  if (!sessionId) {
    throw new AppError('UNAUTHENTICATED', 'You must be signed in.', 401);
  }
  const session = await corporateRepository.selectCompanySession(sessionId);
  if (!session || session.revoked_at !== null || new Date(session.expires_at) <= new Date()) {
    throw new AppError('UNAUTHENTICATED', 'Your session has expired. Please log in again.', 401);
  }
  return { companyId: session.company_id };
}

export async function changeCompanyPin(
  sessionId: string | undefined,
  input: CompanyPortalChangePinInput,
): Promise<void> {
  const { companyId } = await requireCompanyPortalSession(sessionId);
  const auth = await corporateRepository.selectCompanyAuth(companyId);
  if (!auth || !verifyPin(input.currentPin, auth.pin_hash)) {
    throw new AppError('INVALID_PIN', 'Your current PIN is incorrect.', 400);
  }
  await corporateRepository.updateCompanyPin(companyId, hashPin(input.newPin));
}

export async function logoutOfCompanyPortal(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  await corporateRepository.revokeCompanySession(sessionId);
}

// BR-29: scoped strictly to the session's own companyId — never accepts a
// companyId from the client. Rolls up every allocation (any status) so the
// company can see its full purchase history, not just active ones.
export async function getCompanyPortalDashboard(
  sessionId: string | undefined,
): Promise<CompanyPortalDashboard> {
  const { companyId } = await requireCompanyPortalSession(sessionId);
  const [company, auth, allocationRows] = await Promise.all([
    corporateRepository.selectCompanyByIdSystem(companyId),
    corporateRepository.selectCompanyAuth(companyId),
    corporateRepository.selectAllocationsForCompany(companyId),
  ]);
  if (!company) throw new AppError('NOT_FOUND', 'Company not found.', 404);

  const allocations = await Promise.all(
    allocationRows.map((row) => buildAllocationDetail(row.id)),
  );

  return {
    companyName: company.name,
    billingContactName: company.billing_contact_name,
    billingEmail: company.billing_email,
    mustChangePin: auth?.must_change_pin ?? false,
    allocations,
  };
}

// BR-29: verifies the allocation belongs to the session's own company
// before returning anything — used by the portal's invoice download.
export async function getOwnAllocationDetail(
  sessionId: string | undefined,
  allocationId: string,
): Promise<CompanyAllocationDetail> {
  const { companyId } = await requireCompanyPortalSession(sessionId);
  const detail = await buildAllocationDetail(allocationId);
  if (detail.companyId !== companyId) {
    throw new AppError('NOT_FOUND', 'Seat allocation not found.', 404);
  }
  return detail;
}

// The company portal's own "add employees" action — same underlying
// function staff uses, just authorized via the company's own session
// instead of a staff role, and scoped to the company's own allocation.
// BR-12 (verified_by is always a real staff identity, never client-
// supplied): the portal has no staff identity at all, so every row's
// amountPaid is forced to 0 here regardless of what was submitted —
// settlement can only ever happen via a staff member marking a specific
// registration Paid, same as every other payment write in this codebase.
export async function addEmployeesToOwnAllocation(
  sessionId: string | undefined,
  allocationId: string,
  input: AddEmployeesInput,
): Promise<AddEmployeesResult> {
  const { companyId } = await requireCompanyPortalSession(sessionId);
  const allocation = await corporateRepository.selectAllocationByIdSystem(allocationId);
  if (!allocation || allocation.company_id !== companyId) {
    throw new AppError('NOT_FOUND', 'Seat allocation not found.', 404);
  }
  const company = await corporateRepository.selectCompanyByIdSystem(companyId);
  const sanitizedInput: AddEmployeesInput = {
    ...input,
    rows: input.rows.map((row) => ({ ...row, amountPaid: 0 })),
  };
  return addEmployeesToAllocation(allocationId, sanitizedInput, {
    id: company?.created_by ?? companyId,
    fullName: company?.billing_contact_name ?? 'Company portal',
    role: 'corporate',
  });
}
