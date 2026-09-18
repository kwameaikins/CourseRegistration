// Data access for the Knowsia Core seam (Coding Docs/22 §3, Phase 2).
//
// Service-role throughout: every caller is knowsia-api through the
// integration door (a shared secret, never a browser), and the identity id
// is a KEY written by the linker — no RLS policy describes it because no
// signed-in person writes it. Nothing here reads a PIN hash or a session.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export interface ExportedParticipant {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  consentGiven: boolean;
  consentAt: string | null;
  deletedAt: string | null;
  coreIdentityId: string | null;
}

export interface ExportedStaff {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  coreIdentityId: string | null;
}

export async function selectPeopleForIdentityExportSystem(): Promise<{
  participants: ExportedParticipant[];
  staff: ExportedStaff[];
}> {
  const supabase = createSupabaseServiceRoleClient();
  const [{ data: participants, error: pError }, { data: staff, error: sError }] = await Promise.all([
    supabase
      .from('participants')
      .select('id, full_name, email, phone, consent_given, consent_at, deleted_at, core_identity_id')
      .order('created_at', { ascending: true }),
    supabase
      .from('staff_users')
      .select('id, full_name, email, role, is_active, core_identity_id')
      .order('created_at', { ascending: true }),
  ]);
  if (pError) throw pError;
  if (sError) throw sError;
  return {
    participants: (participants ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      consentGiven: row.consent_given,
      consentAt: row.consent_at,
      deletedAt: row.deleted_at,
      coreIdentityId: row.core_identity_id,
    })),
    staff: (staff ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      isActive: row.is_active,
      coreIdentityId: row.core_identity_id,
    })),
  };
}

// One UPDATE per row, run in parallel batches: the first version did them in
// sequence and 382 round trips outlived the Vercel function (the first
// apply on 2026-09-18 timed out half-way; the linker is idempotent, so the
// re-run finished it). A row already carrying a DIFFERENT identity is left
// alone and counted, so a re-link can never silently move a person — that
// is a conflict for the linker's plan to report, not for this side to resolve.
const LINK_BATCH = 40;

export async function updateCoreIdentityLinksSystem(
  participants: Array<{ id: string; coreIdentityId: string }>,
  staff: Array<{ id: string; coreIdentityId: string }>,
): Promise<{ participants: number; staff: number; skipped: number }> {
  const supabase = createSupabaseServiceRoleClient();

  async function linkAll(
    table: 'participants' | 'staff_users',
    links: Array<{ id: string; coreIdentityId: string }>,
  ): Promise<{ linked: number; skipped: number }> {
    let linked = 0;
    let skipped = 0;
    for (let i = 0; i < links.length; i += LINK_BATCH) {
      const results = await Promise.all(
        links.slice(i, i + LINK_BATCH).map(async (link) => {
          const { data, error } = await supabase
            .from(table)
            .update({ core_identity_id: link.coreIdentityId })
            .eq('id', link.id)
            .or(`core_identity_id.is.null,core_identity_id.eq.${link.coreIdentityId}`)
            .select('id');
          if (error) throw error;
          return data && data.length > 0;
        }),
      );
      for (const ok of results) {
        if (ok) linked += 1;
        else skipped += 1;
      }
    }
    return { linked, skipped };
  }

  const p = await linkAll('participants', participants);
  const s = await linkAll('staff_users', staff);
  return { participants: p.linked, staff: s.linked, skipped: p.skipped + s.skipped };
}
