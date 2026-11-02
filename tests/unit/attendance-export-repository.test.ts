import { beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny fake of the supabase query builder: every filter is recorded and ignored, the
// table's rows come back whole (the paging stops because they are fewer than a page).
const tables: Record<string, unknown[]> = {};
const filters: Array<[string, string, unknown]> = [];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = chain;
  b.order = chain;
  b.range = chain;
  b.eq = (col: string, val: unknown) => {
    filters.push([table, col, val]);
    return b;
  };
  b.in = chain;
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: null });
  return b;
}

vi.mock('@/lib/supabase/service-role', () => ({
  createSupabaseServiceRoleClient: () => ({ from: (t: string) => builder(t) }),
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));

const { selectAttendanceForLmsExport } = await import('@/modules/attendance/repository');

beforeEach(() => {
  filters.length = 0;
  for (const k of Object.keys(tables)) delete tables[k];
  tables.registrations = [{ id: 'r1', batch_id: 'b1' }, { id: 'r2', batch_id: 'b1' }];
  tables.live_sessions = [{ id: 'l1', starts_at: '2026-10-03T09:00:00Z' }];
  tables.attendance = [
    {
      registration_id: 'r1', session_date: '2026-10-03', join_time: null, leave_time: null,
      duration_minutes: 0, session_minutes: 90, source: 'zoom_name_match', live_session_id: 'l1',
    },
  ];
  tables.attendance_exceptions = [{ registration_id: 'r2', session_date: '2026-10-10' }];
});

describe('selectAttendanceForLmsExport', () => {
  it('maps rows, resolves the batch and the live session start, keeps zero minutes', async () => {
    const out = await selectAttendanceForLmsExport();
    expect(out[0]).toEqual({
      registrationId: 'r1', batchId: 'b1', sessionDate: '2026-10-03', joinTime: null, leaveTime: null,
      durationMinutes: 0, sessionMinutes: 90, source: 'zoom_name_match', liveSessionId: 'l1',
      liveSessionStartsAt: '2026-10-03T09:00:00Z', absentCorrection: false,
    });
  });

  it('adds an approved absent correction as an absentCorrection entry (its attendance row was deleted)', async () => {
    const out = await selectAttendanceForLmsExport();
    expect(out[1]).toMatchObject({
      registrationId: 'r2', batchId: 'b1', sessionDate: '2026-10-10', absentCorrection: true, durationMinutes: 0,
    });
    expect(filters).toContainEqual(['attendance_exceptions', 'requested_present', false]);
    expect(filters).toContainEqual(['attendance_exceptions', 'status', 'approved']);
  });

  it('with a batchId, filters the registrations and the exceptions by it', async () => {
    await selectAttendanceForLmsExport('b1');
    expect(filters).toContainEqual(['registrations', 'batch_id', 'b1']);
    expect(filters).toContainEqual(['attendance_exceptions', 'batch_id', 'b1']);
  });
});
