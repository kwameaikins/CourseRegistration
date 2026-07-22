'use client';

// Admin messaging editor (founder-approved 2026-07-19): write and edit the
// per-Course email templates the automated engine sends from. Placeholders
// use {{name}} syntax and are substituted at send time.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SentMessagesLog } from '@/app/(staff)/messaging/SentMessagesLog';

interface Course {
  id: string;
  courseName: string;
}

interface TemplateView {
  id: string;
  courseId: string;
  emailType: string;
  subject: string;
  body: string;
  isActive: boolean;
}

const EMAIL_TYPE_LABELS: Array<{ type: string; label: string; phase: 1 | 2 }> = [
  { type: 'welcome', label: 'Welcome (on registration)', phase: 1 },
  { type: 'payment_instruction', label: 'Payment instructions (on registration)', phase: 1 },
  { type: 'reminder_1', label: 'Payment reminder 1 (at registration)', phase: 1 },
  { type: 'reminder_2', label: 'Payment reminder 2 (24h after)', phase: 1 },
  { type: 'reminder_3', label: 'Payment reminder 3 (2 days before start)', phase: 1 },
  { type: 'reminder_4', label: 'Payment reminder 4 (morning of start)', phase: 1 },
  { type: 'payment_confirmation', label: 'Payment confirmation (on Paid)', phase: 1 },
  { type: 'zoom_link', label: 'Personal Zoom link (on Paid, attendance)', phase: 1 },
  { type: 'class_reminder_24h', label: 'Class reminder — 24h before', phase: 2 },
  { type: 'class_reminder_2h', label: 'Class reminder — 2h before', phase: 2 },
  { type: 'whatsapp_invite', label: 'WhatsApp group invitation', phase: 2 },
  { type: 'post_training_thankyou', label: 'Post-course thank you + feedback request (day after end)', phase: 1 },
  { type: 'upsell', label: 'Upsell / cross-sell', phase: 2 },
];

const PLACEHOLDERS =
  '{{participant_name}} {{course_name}} {{course_code}} {{cohort_label}} {{course_fee}} ' +
  '{{amount_paid}} {{balance}} {{start_date}} {{start_time}} {{end_date}} {{zoom_link}} ' +
  '{{whatsapp_group_link}} {{facilitator_name}} {{feedback_link}}';

interface DraftTemplate {
  subject: string;
  body: string;
  isActive: boolean;
  exists: boolean;
}

export default function MessagingPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'log'>('templates');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftTemplate>>({});
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ courses: Course[] }>('/api/courses');
        setCourses(data.courses);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load courses.');
      }
    })();
  }, []);

  const loadTemplates = useCallback(async (courseId: string) => {
    setSelectedCourseId(courseId);
    setDrafts({});
    setExpandedType(null);
    setStatusMessage(null);
    setErrorMessage(null);
    if (!courseId) return;
    try {
      const data = await apiFetch<{ templates: TemplateView[] }>(
        `/api/templates?courseId=${encodeURIComponent(courseId)}`,
      );
      const next: Record<string, DraftTemplate> = {};
      for (const { type } of EMAIL_TYPE_LABELS) {
        const existing = data.templates.find((t) => t.emailType === type);
        next[type] = existing
          ? {
              subject: existing.subject,
              body: existing.body,
              isActive: existing.isActive,
              exists: true,
            }
          : { subject: '', body: '', isActive: true, exists: false };
      }
      setDrafts(next);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load templates.');
    }
  }, []);

  async function handleSave(emailType: string) {
    const draft = drafts[emailType];
    if (!draft) return;
    setSavingType(emailType);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await apiFetch('/api/templates', {
        method: 'PUT',
        body: JSON.stringify({
          courseId: selectedCourseId,
          emailType,
          subject: draft.subject,
          body: draft.body,
          isActive: draft.isActive,
        }),
      });
      setDrafts({ ...drafts, [emailType]: { ...draft, exists: true } });
      setStatusMessage('Template saved. It applies to the next send immediately.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save template.');
    } finally {
      setSavingType(null);
    }
  }

  function updateDraft(emailType: string, changes: Partial<DraftTemplate>) {
    setDrafts({ ...drafts, [emailType]: { ...drafts[emailType], ...changes } });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Messaging</h1>
        <p className="text-sm text-muted-foreground">
          Edit the automated emails sent for each course, or review everything already sent.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-3 py-2 text-sm font-medium ${activeTab === 'templates' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
        >
          Templates
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={`px-3 py-2 text-sm font-medium ${activeTab === 'log' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
        >
          Sent Messages
        </button>
      </div>

      {activeTab === 'log' && <SentMessagesLog />}

      {activeTab === 'templates' && (
      <>
      <p className="text-sm text-muted-foreground">
        Placeholders are replaced at send time: <code className="text-xs">{PLACEHOLDERS}</code>
      </p>

      <div className="max-w-md space-y-2">
        <Label htmlFor="course">Course</Label>
        <select
          id="course"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedCourseId}
          onChange={(event) => loadTemplates(event.target.value)}
        >
          <option value="">Select a course…</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.courseName}
            </option>
          ))}
        </select>
      </div>

      {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {selectedCourseId && Object.keys(drafts).length > 0 && (
        <div className="space-y-3">
          {EMAIL_TYPE_LABELS.map(({ type, label, phase }) => {
            const draft = drafts[type];
            if (!draft) return null;
            const isExpanded = expandedType === type;
            return (
              <div key={type} className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedType(isExpanded ? null : type)}
                >
                  <span className="text-sm font-medium">
                    {label}
                    {phase === 2 && (
                      <span className="ml-2 text-xs text-muted-foreground">(Phase 2)</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {draft.exists
                      ? draft.isActive
                        ? 'Active'
                        : 'Inactive'
                      : 'Not written yet — this email is skipped'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="space-y-4 border-t px-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor={`subject-${type}`}>Subject</Label>
                      <Input
                        id={`subject-${type}`}
                        value={draft.subject}
                        placeholder="e.g. Welcome to {{course_name}}"
                        onChange={(event) =>
                          updateDraft(type, { subject: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`body-${type}`}>Body (HTML allowed)</Label>
                      <textarea
                        id={`body-${type}`}
                        className="min-h-64 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                        value={draft.body}
                        placeholder="<p>Dear {{participant_name}}, …</p>"
                        onChange={(event) => updateDraft(type, { body: event.target.value })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`active-${type}`}
                          checked={draft.isActive}
                          onCheckedChange={(checked) =>
                            updateDraft(type, { isActive: checked })
                          }
                        />
                        <Label htmlFor={`active-${type}`} className="text-sm">
                          Active (inactive templates are skipped, never sent)
                        </Label>
                      </div>
                      <Button
                        onClick={() => handleSave(type)}
                        disabled={savingType === type || !draft.subject || !draft.body}
                      >
                        {savingType === type ? 'Saving…' : 'Save template'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
