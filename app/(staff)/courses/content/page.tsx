'use client';

// Course Content editor (founder-requested 2026-08-16) — lets staff edit the
// public programme-page copy that previously lived only in
// modules/courses/public-content.ts and needed a developer and a deploy to
// change.
//
// Admin only, inherited from the '/courses' entry in ROLE_ROUTES (the
// middleware matches by prefix). The API route and the service layer both
// re-check; the middleware is only the UX layer.
//
// Deliberately NOT here: fees, dates, times and seat counts. Those live on the
// Batch and are edited on the Courses screen, so a programme page can never
// advertise a price the registration form contradicts.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CurriculumSession {
  heading: string;
  title: string;
  points: string[];
  practical?: string;
}

interface ContentBody {
  briefSlug: string;
  tagline: string;
  heroImage: string | null;
  overview: string[];
  idealFor: string;
  primaryAudience: string[];
  alsoSuitableFor: string[];
  outcomesLabel: string;
  outcomes: string[];
  curriculum: CurriculumSession[];
  format: Array<{ label: string; value: string }>;
  prerequisites: string[];
  includes: string[];
  facilitator: { name: string; credentials: string | null };
  faq: Array<{ question: string; answer: string }>;
  corporateNote: string | null;
}

interface ContentRecord {
  courseId: string;
  courseCode: string;
  courseName: string;
  body: ContentBody;
  displayOrder: number | null;
  updatedAt: string | null;
  source: 'database' | 'code' | 'none';
}

const SOURCE_LABEL: Record<ContentRecord['source'], string> = {
  database: 'Edited here',
  code: 'From code',
  none: 'Not written yet',
};

const SOURCE_STYLE: Record<ContentRecord['source'], string> = {
  database: 'bg-emerald-100 text-emerald-800',
  code: 'bg-slate-100 text-slate-700',
  none: 'bg-amber-100 text-amber-800',
};

const textareaClass =
  'w-full rounded-md border border-input bg-background p-2 text-sm leading-relaxed';

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Reorderable list of plain lines — overview paragraphs, outcomes, etc. */
function TextListEditor({
  label,
  hint,
  values,
  onChange,
  multiline = false,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  multiline?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
          Add
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {values.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          Empty — this section is hidden on the public page.
        </p>
      )}
      {values.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          {multiline ? (
            <textarea
              className={textareaClass}
              rows={3}
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
          ) : (
            <Input
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
          )}
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index - 1))}>
              ↑
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index + 1))}>
              ↓
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** Reorderable list of two-field rows — format specs and FAQ entries. */
function PairListEditor<K extends string>({
  label,
  hint,
  values,
  keys,
  placeholders,
  onChange,
  answerMultiline = false,
}: {
  label: string;
  hint?: string;
  values: Array<Record<K, string>>;
  keys: [K, K];
  placeholders: [string, string];
  onChange: (next: Array<Record<K, string>>) => void;
  answerMultiline?: boolean;
}) {
  const blank = { [keys[0]]: '', [keys[1]]: '' } as Record<K, string>;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, blank])}>
          Add
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {values.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          Empty — this section is hidden on the public page.
        </p>
      )}
      {values.map((row, index) => (
        <div key={index} className="flex items-start gap-2 rounded-md border p-2">
          <div className="flex-1 space-y-2">
            <Input
              placeholder={placeholders[0]}
              value={row[keys[0]]}
              onChange={(event) => {
                const next = [...values];
                next[index] = { ...row, [keys[0]]: event.target.value };
                onChange(next);
              }}
            />
            {answerMultiline ? (
              <textarea
                className={textareaClass}
                rows={3}
                placeholder={placeholders[1]}
                value={row[keys[1]]}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = { ...row, [keys[1]]: event.target.value };
                  onChange(next);
                }}
              />
            ) : (
              <Input
                placeholder={placeholders[1]}
                value={row[keys[1]]}
                onChange={(event) => {
                  const next = [...values];
                  next[index] = { ...row, [keys[1]]: event.target.value };
                  onChange(next);
                }}
              />
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index - 1))}>
              ↑
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index + 1))}>
              ↓
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function CurriculumEditor({
  values,
  onChange,
}: {
  values: CurriculumSession[];
  onChange: (next: CurriculumSession[]) => void;
}) {
  function patch(index: number, changes: Partial<CurriculumSession>) {
    const next = [...values];
    next[index] = { ...next[index], ...changes };
    onChange(next);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-semibold">Curriculum</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...values,
              { heading: `Module ${values.length + 1}`, title: '', points: [] },
            ])
          }
        >
          Add module
        </Button>
      </div>
      {values.length === 0 && (
        <p className="text-xs italic text-muted-foreground">
          Empty — the curriculum section is hidden on the public page.
        </p>
      )}
      {values.map((session, index) => (
        <div key={index} className="space-y-3 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-[160px_1fr]">
              <Input
                placeholder="Module 1"
                value={session.heading}
                onChange={(event) => patch(index, { heading: event.target.value })}
              />
              <Input
                placeholder="Module title"
                value={session.title}
                onChange={(event) => patch(index, { title: event.target.value })}
              />
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index - 1))}>
                ↑
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onChange(move(values, index, index + 1))}>
                ↓
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
              >
                ✕
              </Button>
            </div>
          </div>

          <TextListEditor
            label="Topics"
            values={session.points}
            onChange={(points) => patch(index, { points })}
          />

          <div className="space-y-1">
            <Label className="text-xs">Practical exercise (optional)</Label>
            <textarea
              className={textareaClass}
              rows={2}
              value={session.practical ?? ''}
              onChange={(event) =>
                patch(index, { practical: event.target.value.trim() === '' ? undefined : event.target.value })
              }
            />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function CourseContentPage() {
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContentBody | null>(null);
  const [displayOrder, setDisplayOrder] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ records: ContentRecord[] }>('/api/courses/content');
      setRecords(data.records);
      setSelectedCode((current) => current ?? data.records[0]?.courseCode ?? null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load course content.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => records.find((record) => record.courseCode === selectedCode) ?? null,
    [records, selectedCode],
  );

  // Re-seed the form whenever the selection changes. Structured-cloned so
  // editing a draft never mutates the loaded record behind it, which is what
  // makes "Discard changes" a simple re-select.
  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(structuredClone(selected.body));
    setDisplayOrder(selected.displayOrder === null ? '' : String(selected.displayOrder));
    setMessage(null);
    setErrorMessage(null);
  }, [selected]);

  function patch(changes: Partial<ContentBody>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
  }

  async function handleSave() {
    if (!selected || !draft) return;
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/courses/content/${encodeURIComponent(selected.courseCode)}`, {
        method: 'PUT',
        body: JSON.stringify({
          body: draft,
          displayOrder: displayOrder.trim() === '' ? null : Number(displayOrder),
        }),
      });
      await load();
      setMessage('Saved. The public programme page now shows this copy.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selected) return;
    if (
      !window.confirm(
        `Discard the saved copy for ${selected.courseCode} and go back to the version in code? This cannot be undone.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/courses/content/${encodeURIComponent(selected.courseCode)}`, {
        method: 'DELETE',
      });
      await load();
      setMessage('Reverted to the copy held in code.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not revert.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Course Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The public programme-page copy at{' '}
          <span className="font-mono">/programmes/&lt;code&gt;</span>. Fees, dates and seat counts
          are not here — those live on the cohort and are edited on the Courses screen.
        </p>
      </header>

      {errorMessage && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {message && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav className="space-y-1">
          {records.map((record) => (
            <button
              key={record.courseCode}
              type="button"
              onClick={() => setSelectedCode(record.courseCode)}
              className={`w-full rounded-md border p-3 text-left text-sm ${
                record.courseCode === selectedCode ? 'border-primary bg-muted' : 'hover:bg-muted/50'
              }`}
            >
              <span className="font-medium">{record.courseCode}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{record.courseName}</span>
              <span
                className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${SOURCE_STYLE[record.source]}`}
              >
                {SOURCE_LABEL[record.source]}
              </span>
            </button>
          ))}
        </nav>

        {selected && draft ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {selected.courseCode} — {selected.courseName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.source === 'database' && selected.updatedAt
                    ? `Last edited ${new Date(selected.updatedAt).toLocaleString()}`
                    : selected.source === 'code'
                      ? 'Currently rendering from the copy held in code. Saving here overrides it.'
                      : 'No copy written yet. This course renders with only its name and dates.'}
                </p>
              </div>
              <a
                href={`/programmes/${selected.courseCode}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                View public page
              </a>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {selected.source === 'database' && (
                <Button type="button" variant="outline" onClick={handleReset} disabled={saving}>
                  Revert to code
                </Button>
              )}
            </div>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={draft.tagline}
                  onChange={(event) => patch({ tagline: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  One sentence. Also used as the page&apos;s search-result and link-preview text.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="idealFor">Ideal for</Label>
                <Input
                  id="idealFor"
                  value={draft.idealFor}
                  onChange={(event) => patch({ idealFor: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="outcomesLabel">Outcomes heading</Label>
                <Input
                  id="outcomesLabel"
                  value={draft.outcomesLabel}
                  onChange={(event) => patch({ outcomesLabel: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="facilitatorName">Facilitator</Label>
                <Input
                  id="facilitatorName"
                  value={draft.facilitator.name}
                  onChange={(event) =>
                    patch({ facilitator: { ...draft.facilitator, name: event.target.value } })
                  }
                />
                <p className="text-xs text-muted-foreground">Leave blank to hide the row.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="facilitatorCredentials">Credentials</Label>
                <Input
                  id="facilitatorCredentials"
                  value={draft.facilitator.credentials ?? ''}
                  onChange={(event) =>
                    patch({
                      facilitator: {
                        ...draft.facilitator,
                        credentials: event.target.value.trim() === '' ? null : event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="displayOrder">Catalogue position</Label>
                <Input
                  id="displayOrder"
                  inputMode="numeric"
                  value={displayOrder}
                  onChange={(event) => setDisplayOrder(event.target.value.replace(/[^\d]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Lower shows first. Blank keeps the default order.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="briefSlug">Brief slug</Label>
                <Input
                  id="briefSlug"
                  value={draft.briefSlug}
                  onChange={(event) => patch({ briefSlug: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Filename of the founder&apos;s brief in Coding Docs, for traceability.
                </p>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="corporateNote">Corporate note</Label>
                <textarea
                  id="corporateNote"
                  className={textareaClass}
                  rows={2}
                  value={draft.corporateNote ?? ''}
                  onChange={(event) =>
                    patch({ corporateNote: event.target.value.trim() === '' ? null : event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Shown as the &ldquo;Training a team?&rdquo; callout. Blank hides it.
                </p>
              </div>
            </section>

            <TextListEditor
              label="Overview"
              hint="One paragraph per entry."
              values={draft.overview}
              onChange={(overview) => patch({ overview })}
              multiline
            />
            <TextListEditor
              label="Primary audience"
              values={draft.primaryAudience}
              onChange={(primaryAudience) => patch({ primaryAudience })}
            />
            <TextListEditor
              label="Also suitable for"
              values={draft.alsoSuitableFor}
              onChange={(alsoSuitableFor) => patch({ alsoSuitableFor })}
            />
            <TextListEditor
              label="Outcomes"
              values={draft.outcomes}
              onChange={(outcomes) => patch({ outcomes })}
            />

            <CurriculumEditor
              values={draft.curriculum}
              onChange={(curriculum) => patch({ curriculum })}
            />

            <PairListEditor
              label="Course format"
              hint="Delivery, certification and so on. Never fees or dates."
              values={draft.format}
              keys={['label', 'value']}
              placeholders={['Delivery', 'Live, instructor-led via Zoom']}
              onChange={(format) => patch({ format })}
            />
            <TextListEditor
              label="Prerequisites"
              values={draft.prerequisites}
              onChange={(prerequisites) => patch({ prerequisites })}
            />
            <TextListEditor
              label="What registration includes"
              hint="Always shown, so it needs at least one entry."
              values={draft.includes}
              onChange={(includes) => patch({ includes })}
            />
            <PairListEditor
              label="Frequently asked questions"
              hint="Leave empty to use the shared catalogue FAQ instead."
              values={draft.faq}
              keys={['question', 'answer']}
              placeholders={['Is prior experience required?', 'No. The programme begins with…']}
              onChange={(faq) => patch({ faq })}
              answerMultiline
            />

            <div className="flex gap-3 border-t pt-4">
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(structuredClone(selected.body))}
                disabled={saving}
              >
                Discard changes
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select a course to edit its copy.</p>
        )}
      </div>
    </main>
  );
}
