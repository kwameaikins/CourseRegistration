'use client';

// Knowsia Insights Editorial Dashboard (doc Section 17) — Source registry,
// pipeline queues (backed by pipeline_jobs), and the Level 2 human-review
// action. Same single-page-with-view-toggle shape as the Payments screen's
// Payment Submissions view.
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
import { NEWS_CATEGORIES } from '@/modules/news-insights/types';

interface NewsSourceRow {
  id: string;
  name: string;
  sourceUrl: string;
  sourceType: string;
  tier: number;
  status: 'active' | 'disabled';
  reliabilityScore: number;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
}

interface PipelineJobRow {
  id: string;
  rawNewsItemId: string | null;
  storyId: string | null;
  stage: string;
  attempts: number;
  errorMessage: string | null;
  lastAdvancedAt: string | null;
  createdAt: string;
}

interface PendingReviewRow {
  review: {
    id: string;
    riskLevel: number | null;
    riskReasons: string[];
    verificationPassed: boolean | null;
    claimChecks: unknown;
  };
  draft: {
    id: string;
    draftHeadline: string | null;
    draftSummary: string | null;
    draftSections: {
      whatHappened: string;
      whyItMatters: string;
      whoIsAffected: string;
      keyDetails: string;
      whatShouldYouDo: string;
      knowsiaAnalysis: string;
    } | null;
  };
  story: { id: string; category: string; canonicalTitle: string };
}

interface CostSummary {
  sinceDays: number;
  totalCostUsd: number;
  byAgent: Record<string, { tokensIn: number; tokensOut: number; estimatedCostUsd: number; calls: number }>;
}

const STAGE_LABELS: Record<string, string> = {
  collected: 'Newly collected',
  triaged: 'Classified',
  researched: 'Draft ready',
  verified: 'Verification complete',
  routed: 'Routed',
  review: 'Human review required',
  published: 'Published',
  monitoring: 'Monitoring / absorbed',
  blocked: 'Blocked (Level 3 or rejected)',
  filtered: 'Filtered (below relevance bar)',
  error: 'Error',
};

function stageBadge(stage: string) {
  if (stage === 'published') return <Badge className="bg-emerald-600">{STAGE_LABELS[stage] ?? stage}</Badge>;
  if (stage === 'review') return <Badge className="bg-amber-500">{STAGE_LABELS[stage] ?? stage}</Badge>;
  if (stage === 'blocked' || stage === 'error') return <Badge variant="destructive">{STAGE_LABELS[stage] ?? stage}</Badge>;
  // Filtered is a routine, intended outcome — not a failure — so it stays
  // visually quiet rather than reading as something to fix.
  if (stage === 'filtered') return <Badge variant="outline" className="text-muted-foreground">{STAGE_LABELS[stage]}</Badge>;
  return <Badge variant="outline">{STAGE_LABELS[stage] ?? stage}</Badge>;
}

const EMPTY_SECTIONS = {
  whatHappened: '',
  whyItMatters: '',
  whoIsAffected: '',
  keyDetails: '',
  whatShouldYouDo: '',
  knowsiaAnalysis: '',
};

export default function EditorialDashboardPage() {
  const [view, setView] = useState<'pipeline' | 'review' | 'sources' | 'cost'>('review');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [jobs, setJobs] = useState<PipelineJobRow[]>([]);
  const [reviews, setReviews] = useState<PendingReviewRow[]>([]);
  const [sources, setSources] = useState<NewsSourceRow[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);

  const [reviewTarget, setReviewTarget] = useState<PendingReviewRow | null>(null);
  const [reviewMode, setReviewMode] = useState<'approved' | 'edited' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [editedHeadline, setEditedHeadline] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [editedSections, setEditedSections] = useState(EMPTY_SECTIONS);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', sourceUrl: '', sourceType: 'rss', tier: '2', defaultCategory: '' });
  const [savingSource, setSavingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const result = await apiFetch<{ jobs: PipelineJobRow[] }>('/api/news-pipeline/jobs');
      setJobs(result.jobs);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load pipeline jobs.');
    }
  }, []);

  const loadReviews = useCallback(async () => {
    try {
      const result = await apiFetch<{ reviews: PendingReviewRow[] }>('/api/news-pipeline/reviews');
      setReviews(result.reviews);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load the review queue.');
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const result = await apiFetch<{ sources: NewsSourceRow[] }>('/api/news-sources');
      setSources(result.sources);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sources.');
    }
  }, []);

  const loadCost = useCallback(async () => {
    try {
      const result = await apiFetch<CostSummary>('/api/news-pipeline/cost-summary');
      setCost(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load the cost summary.');
    }
  }, []);

  useEffect(() => {
    if (view === 'pipeline') void loadJobs();
    if (view === 'review') void loadReviews();
    if (view === 'sources') void loadSources();
    if (view === 'cost') void loadCost();
  }, [view, loadJobs, loadReviews, loadSources, loadCost]);

  function openReview(row: PendingReviewRow) {
    setReviewTarget(row);
    setReviewMode('approved');
    setReviewNote('');
    setEditedHeadline(row.draft.draftHeadline ?? '');
    setEditedSummary(row.draft.draftSummary ?? '');
    setEditedSections(row.draft.draftSections ?? EMPTY_SECTIONS);
    setReviewError(null);
  }

  async function submitReview() {
    if (!reviewTarget) return;
    setReviewSaving(true);
    setReviewError(null);
    try {
      await apiFetch(`/api/news-pipeline/reviews/${reviewTarget.review.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          decision: reviewMode,
          reviewNote: reviewNote.trim() || undefined,
          ...(reviewMode === 'edited'
            ? { editedHeadline, editedSummary, editedSections }
            : {}),
        }),
      });
      setReviewTarget(null);
      await loadReviews();
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Failed to submit this review.');
    } finally {
      setReviewSaving(false);
    }
  }

  async function createSource() {
    setSavingSource(true);
    setSourceError(null);
    try {
      await apiFetch('/api/news-sources', {
        method: 'POST',
        body: JSON.stringify({
          name: newSource.name.trim(),
          sourceUrl: newSource.sourceUrl.trim(),
          sourceType: newSource.sourceType,
          tier: Number(newSource.tier),
          defaultCategory: newSource.defaultCategory || null,
        }),
      });
      setAddSourceOpen(false);
      setNewSource({ name: '', sourceUrl: '', sourceType: 'rss', tier: '2', defaultCategory: '' });
      await loadSources();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Failed to add this source.');
    } finally {
      setSavingSource(false);
    }
  }

  async function toggleSourceStatus(source: NewsSourceRow) {
    try {
      await apiFetch(`/api/news-sources/${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: source.status === 'active' ? 'disabled' : 'active' }),
      });
      await loadSources();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update this source.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowsia Insights — Editorial Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Source registry, pipeline queues, and Level 2 human review for the news pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'review' ? 'default' : 'outline'} onClick={() => setView('review')}>
            Review Queue{reviews.length > 0 ? ` (${reviews.length})` : ''}
          </Button>
          <Button variant={view === 'pipeline' ? 'default' : 'outline'} onClick={() => setView('pipeline')}>
            Pipeline
          </Button>
          <Button variant={view === 'sources' ? 'default' : 'outline'} onClick={() => setView('sources')}>
            Sources
          </Button>
          <Button variant={view === 'cost' ? 'default' : 'outline'} onClick={() => setView('cost')}>
            Cost
          </Button>
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {view === 'review' && (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Headline</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Verification</TableHead>
                <TableHead>Risk reasons</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((row) => (
                <TableRow key={row.review.id}>
                  <TableCell>
                    <p className="font-medium">{row.draft.draftHeadline ?? row.story.canonicalTitle}</p>
                  </TableCell>
                  <TableCell>{row.story.category}</TableCell>
                  <TableCell>
                    {row.review.verificationPassed ? (
                      <Badge className="bg-emerald-600">Passed</Badge>
                    ) : (
                      <Badge variant="destructive">Did not pass</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-80 text-xs text-muted-foreground">
                    {row.review.riskReasons.join('; ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => openReview(row)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {reviews.length === 0 && <p className="text-muted-foreground">No stories awaiting Level 2 review.</p>}
        </div>
      )}

      {view === 'pipeline' && (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last advanced</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>{stageBadge(job.stage)}</TableCell>
                  <TableCell>{job.attempts}</TableCell>
                  <TableCell>{job.lastAdvancedAt ? new Date(job.lastAdvancedAt).toLocaleString() : '—'}</TableCell>
                  <TableCell className="max-w-80 text-xs text-destructive">{job.errorMessage ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {jobs.length === 0 && <p className="text-muted-foreground">No pipeline activity yet — add a Source to begin.</p>}
        </div>
      )}

      {view === 'sources' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setAddSourceOpen(true)}>Add source</Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Reliability</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last fetch</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium">{source.name}</TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">{source.sourceUrl}</TableCell>
                  <TableCell>{source.tier}</TableCell>
                  <TableCell>{source.reliabilityScore}</TableCell>
                  <TableCell>
                    {source.status === 'active' ? (
                      <Badge className="bg-emerald-600">Active</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {source.lastFetchedAt ? new Date(source.lastFetchedAt).toLocaleString() : 'Never'}
                    {source.lastFetchError && <p className="text-destructive">{source.lastFetchError}</p>}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => toggleSourceStatus(source)}>
                      {source.status === 'active' ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sources.length === 0 && (
            <p className="text-muted-foreground">
              No sources yet. Add a real source (an official RSS/press feed) to start the pipeline.
            </p>
          )}
        </div>
      )}

      {view === 'cost' && cost && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Last {cost.sinceDays} days — estimated total: <span className="font-medium text-foreground">${cost.totalCostUsd.toFixed(4)}</span> (planning estimate, not a billing figure — Section 10).
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Tokens in</TableHead>
                <TableHead>Tokens out</TableHead>
                <TableHead>Estimated cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(cost.byAgent).map(([agent, stats]) => (
                <TableRow key={agent}>
                  <TableCell>{agent}</TableCell>
                  <TableCell>{stats.calls}</TableCell>
                  <TableCell>{stats.tokensIn.toLocaleString()}</TableCell>
                  <TableCell>{stats.tokensOut.toLocaleString()}</TableCell>
                  <TableCell>${stats.estimatedCostUsd.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {Object.keys(cost.byAgent).length === 0 && <p className="text-muted-foreground">No agent activity yet.</p>}
        </div>
      )}

      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a news source</DialogTitle>
            <DialogDescription>A real, verifiable RSS feed or press page URL — nothing here is pre-filled.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sourceName">Name</Label>
              <Input id="sourceName" value={newSource.name} onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sourceUrl">Source URL (RSS feed or page)</Label>
              <Input
                id="sourceUrl"
                placeholder="https://…"
                value={newSource.sourceUrl}
                onChange={(e) => setNewSource((s) => ({ ...s, sourceUrl: e.target.value }))}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="sourceTier">Tier (1 = official, 4 = social/community)</Label>
                <select
                  id="sourceTier"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={newSource.tier}
                  onChange={(e) => setNewSource((s) => ({ ...s, tier: e.target.value }))}
                >
                  <option value="1">1 — Primary official</option>
                  <option value="2">2 — Established news</option>
                  <option value="3">3 — Specialist publication</option>
                  <option value="4">4 — Social/community</option>
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="sourceCategory">Default category (optional)</Label>
                <select
                  id="sourceCategory"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={newSource.defaultCategory}
                  onChange={(e) => setNewSource((s) => ({ ...s, defaultCategory: e.target.value }))}
                >
                  <option value="">None</option>
                  {NEWS_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {sourceError && (
              <p role="alert" className="text-sm text-destructive">
                {sourceError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSourceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSource} disabled={savingSource || !newSource.name.trim() || !newSource.sourceUrl.trim()}>
              {savingSource ? 'Saving…' : 'Add source'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewTarget !== null} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review: {reviewTarget?.draft.draftHeadline}</DialogTitle>
            <DialogDescription>
              {reviewTarget ? `${reviewTarget.story.category} — risk reasons: ${reviewTarget.review.riskReasons.join('; ') || 'none given'}` : ''}
            </DialogDescription>
          </DialogHeader>
          {reviewTarget && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant={reviewMode === 'approved' ? 'default' : 'outline'} size="sm" onClick={() => setReviewMode('approved')}>
                  Approve as-is
                </Button>
                <Button variant={reviewMode === 'edited' ? 'default' : 'outline'} size="sm" onClick={() => setReviewMode('edited')}>
                  Edit &amp; approve
                </Button>
                <Button variant={reviewMode === 'rejected' ? 'destructive' : 'outline'} size="sm" onClick={() => setReviewMode('rejected')}>
                  Reject
                </Button>
              </div>

              {reviewMode !== 'edited' && (
                <div className="space-y-2 rounded-md bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{reviewTarget.draft.draftHeadline}</p>
                  <p>{reviewTarget.draft.draftSummary}</p>
                </div>
              )}

              {reviewMode === 'edited' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="editedHeadline">Headline</Label>
                    <Input id="editedHeadline" value={editedHeadline} onChange={(e) => setEditedHeadline(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editedSummary">Summary</Label>
                    <textarea
                      id="editedSummary"
                      className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editedSummary}
                      onChange={(e) => setEditedSummary(e.target.value)}
                    />
                  </div>
                  {(Object.keys(EMPTY_SECTIONS) as (keyof typeof EMPTY_SECTIONS)[]).map((key) => (
                    <div className="space-y-2" key={key}>
                      <Label htmlFor={`section-${key}`}>{key}</Label>
                      <textarea
                        id={`section-${key}`}
                        className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={editedSections[key]}
                        onChange={(e) => setEditedSections((s) => ({ ...s, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="reviewNote">Review note (optional)</Label>
                <Input id="reviewNote" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              </div>

              {reviewError && (
                <p role="alert" className="text-sm text-destructive">
                  {reviewError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)} disabled={reviewSaving}>
              Cancel
            </Button>
            <Button onClick={submitReview} disabled={reviewSaving}>
              {reviewSaving ? 'Saving…' : reviewMode === 'rejected' ? 'Reject story' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
