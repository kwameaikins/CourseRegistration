'use client';

// Nurture sequences admin (Revenue OS Phase 2, 2026-09-03).
//
// Sequences ship seeded but INACTIVE: this screen is where an admin reads the
// copy, adjusts timing, and flips a sequence live — the same review-then-arm
// posture as campaign live-send toggles.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface StepView {
  id: string;
  stepNumber: number;
  offsetDays: number;
  subject: string;
  body: string;
}

interface SequenceView {
  id: string;
  key: string;
  name: string;
  trigger: string;
  isActive: boolean;
  steps: StepView[];
  activeEnrollments: number;
  completedEnrollments: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  lead_new: 'New lead created (no registration yet)',
  lead_lost: 'Lead marked Lost',
  registration_lapsed: 'Registration written off',
  post_course: 'Course completed (upsell candidates)',
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<StepView | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await apiFetch<{ sequences: SequenceView[] }>('/api/sequences');
      setSequences(data.sequences);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sequences.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleActive(sequence: SequenceView) {
    setSavingId(sequence.id);
    try {
      await apiFetch(`/api/sequences/${sequence.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !sequence.isActive }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update sequence.');
    } finally {
      setSavingId(null);
    }
  }

  async function saveStep() {
    if (!editingStep) return;
    setSavingId(editingStep.id);
    try {
      await apiFetch(`/api/sequences/steps/${editingStep.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          offsetDays: editingStep.offsetDays,
          subject: editingStep.subject,
          body: editingStep.body,
        }),
      });
      setEditingStep(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save step.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nurture Sequences</h1>
        <p className="text-sm text-muted-foreground">
          Automated multi-step follow-ups. Nothing sends until a sequence is switched on;
          every email honours unsubscribes and carries an unsubscribe link. Tokens:{' '}
          <code>{'{{first_name}}'}</code>, <code>{'{{full_name}}'}</code>,{' '}
          <code>{'{{course_name}}'}</code>.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {sequences.map((sequence) => (
        <Card key={sequence.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-3">
                {sequence.name}
                <Badge variant={sequence.isActive ? 'default' : 'outline'}>
                  {sequence.isActive ? 'Active' : 'Off'}
                </Badge>
              </span>
              <span className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
                {sequence.activeEnrollments} in flight · {sequence.completedEnrollments} completed
                <Switch
                  checked={sequence.isActive}
                  disabled={savingId === sequence.id}
                  onCheckedChange={() => void toggleActive(sequence)}
                />
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Trigger: {TRIGGER_LABELS[sequence.trigger] ?? sequence.trigger}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {sequence.steps.map((step) =>
              editingStep?.id === step.id ? (
                <div key={step.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Step {step.stepNumber}</span>
                    <span className="text-muted-foreground">— send</span>
                    <Input
                      type="number" min={0} max={365} className="h-8 w-20"
                      value={editingStep.offsetDays}
                      onChange={(e) =>
                        setEditingStep({ ...editingStep, offsetDays: Number(e.target.value) })
                      }
                    />
                    <span className="text-muted-foreground">days after enrollment</span>
                  </div>
                  <Input
                    value={editingStep.subject}
                    onChange={(e) => setEditingStep({ ...editingStep, subject: e.target.value })}
                    placeholder="Subject"
                  />
                  <textarea
                    className="min-h-[140px] w-full rounded-md border border-input bg-background p-2 text-sm"
                    value={editingStep.body}
                    onChange={(e) => setEditingStep({ ...editingStep, body: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveStep()} disabled={savingId === step.id}>
                      Save step
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingStep(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={step.id} className="flex items-start justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Step {step.stepNumber} · day {step.offsetDays}: {step.subject}
                    </p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingStep(step)}>
                    Edit
                  </Button>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
