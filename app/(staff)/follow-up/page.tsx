'use client';

// Follow-up workspace (Revenue OS Phase 2, 2026-09-03) — replaces the
// "ships in Phase 2" stub. The working queue for whoever does sales calls:
// every lead whose follow-up is due, oldest first, with outcome capture
// (US-M02) and one-click rescheduling in place.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

interface LeadRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string | null;
  leadSource: string;
  status: string;
  score: number;
  notes: string | null;
  nextFollowUpAt: string | null;
}

function temperature(score: number): 'Hot' | 'Warm' | 'Cold' {
  if (score >= 70) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Cold';
}

const TEMP_CLASS: Record<string, string> = {
  Hot: 'bg-red-600',
  Warm: 'bg-amber-500',
  Cold: 'bg-slate-400',
};

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export default function FollowUpPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ leads: LeadRow[] }>('/api/leads?dueForFollowUp=true');
      setLeads(data.leads);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the follow-up queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sorted = useMemo(
    () =>
      [...leads].sort((a, b) =>
        (a.nextFollowUpAt ?? '').localeCompare(b.nextFollowUpAt ?? ''),
      ),
    [leads],
  );

  async function logOutcome(lead: LeadRow, nextFollowUpAt: string | null | undefined) {
    const outcome = (outcomes[lead.id] ?? '').trim();
    if (outcome.length < 3) {
      setError('Write a short note about what happened before saving.');
      return;
    }
    setSavingId(lead.id);
    setError('');
    try {
      await apiFetch(`/api/leads/${lead.id}/outcome`, {
        method: 'POST',
        body: JSON.stringify({ outcome, nextFollowUpAt }),
      });
      setOutcomes((current) => ({ ...current, [lead.id]: '' }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the outcome.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Follow-Up Queue</h1>
        <p className="text-sm text-muted-foreground">
          Every lead whose follow-up is due, oldest first. Record what happened and when to
          try again — both land on the lead&apos;s timeline.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && sorted.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Queue clear — no follow-ups due. New enquiries land here automatically.
          </CardContent>
        </Card>
      )}

      {sorted.map((lead) => {
        const overdueDays = lead.nextFollowUpAt
          ? Math.floor((Date.now() - new Date(lead.nextFollowUpAt).getTime()) / 86_400_000)
          : 0;
        const temp = temperature(lead.score);
        return (
          <Card key={lead.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  {lead.fullName}
                  <Badge className={TEMP_CLASS[temp]}>{temp}</Badge>
                  <Badge variant="outline">{lead.status}</Badge>
                </span>
                <span className="text-sm font-normal">
                  {overdueDays > 0 ? (
                    <span className="font-medium text-red-600">{overdueDays}d overdue</span>
                  ) : (
                    <span className="text-muted-foreground">due today</span>
                  )}
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {lead.phone} · {lead.email}
                {lead.company ? ` · ${lead.company}` : ''} · {lead.leadSource}
                {lead.nextFollowUpAt ? ` · scheduled ${formatDate(lead.nextFollowUpAt)}` : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {lead.notes && (
                <p className="rounded bg-muted/50 p-2 text-sm text-muted-foreground">
                  {lead.notes}
                </p>
              )}
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background p-2 text-sm"
                placeholder="What happened? e.g. Spoke on phone — wants the evening cohort, will pay after payday."
                value={outcomes[lead.id] ?? ''}
                onChange={(event) =>
                  setOutcomes((current) => ({ ...current, [lead.id]: event.target.value }))
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={savingId === lead.id}
                  onClick={() => void logOutcome(lead, inDays(1))}
                >
                  Save · retry tomorrow
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingId === lead.id}
                  onClick={() => void logOutcome(lead, inDays(3))}
                >
                  Save · in 3 days
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingId === lead.id}
                  onClick={() => void logOutcome(lead, inDays(7))}
                >
                  Save · next week
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingId === lead.id}
                  onClick={() => void logOutcome(lead, null)}
                >
                  Save · no further follow-up
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
