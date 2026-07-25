'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Campaign {
  id: string;
  name: string;
  channel: 'email' | 'whatsapp' | 'sms';
  messageSubject: string | null;
  messageBody: string;
  filterLeadSource: string | null;
  filterStatus: string | null;
  filterMinScore: number | null;
  status: 'draft' | 'queued';
  queuedAt: string | null;
  createdAt: string;
}

interface CampaignPreview {
  matchedLeadCount: number;
  sample: { leadId: string; leadName: string; previewMessage: string }[];
}

const CHANNELS: Campaign['channel'][] = ['email', 'whatsapp', 'sms'];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Campaign['channel']>('email');
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [filterLeadSource, setFilterLeadSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMinScore, setFilterMinScore] = useState('');
  const [creating, setCreating] = useState(false);

  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [queuingId, setQueuingId] = useState<string | null>(null);

  async function loadCampaigns() {
    try {
      const result = await apiFetch<{ campaigns: Campaign[] }>('/api/campaigns');
      setCampaigns(result.campaigns);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load campaigns.');
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  async function createCampaign() {
    if (!name.trim() || !messageBody.trim()) return;
    setCreating(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          channel,
          messageSubject: messageSubject.trim() || null,
          messageBody: messageBody.trim(),
          filterLeadSource: filterLeadSource.trim() || null,
          filterStatus: filterStatus.trim() || null,
          filterMinScore: filterMinScore ? Number(filterMinScore) : null,
        }),
      });
      setName('');
      setMessageSubject('');
      setMessageBody('');
      setFilterLeadSource('');
      setFilterStatus('');
      setFilterMinScore('');
      await loadCampaigns();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create campaign.');
    } finally {
      setCreating(false);
    }
  }

  async function loadPreview(campaignId: string) {
    setPreviewFor(campaignId);
    setPreview(null);
    setErrorMessage(null);
    try {
      const result = await apiFetch<CampaignPreview>(`/api/campaigns/${campaignId}/preview`);
      setPreview(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load preview.');
    }
  }

  async function queueCampaign(campaignId: string) {
    setQueuingId(campaignId);
    setErrorMessage(null);
    try {
      await apiFetch(`/api/campaigns/${campaignId}/queue`, { method: 'POST' });
      await loadCampaigns();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to queue campaign.');
    } finally {
      setQueuingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Draft a message to a filtered slice of leads. Queueing a campaign is a{' '}
          <strong>dry run</strong> — it logs the leads that would be contacted and a preview of
          each message, but does not send anything.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New campaign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Channel</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={channel}
                onChange={(event) => setChannel(event.target.value as Campaign['channel'])}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {channel === 'email' && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Subject</label>
              <Input
                value={messageSubject}
                onChange={(event) => setMessageSubject(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Message (use {'{{firstName}}'}, {'{{fullName}}'}, {'{{company}}'})
            </label>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Filter: lead source</label>
              <Input
                value={filterLeadSource}
                onChange={(event) => setFilterLeadSource(event.target.value)}
                placeholder="e.g. Website"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Filter: status</label>
              <Input
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                placeholder="e.g. New"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Filter: min score</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={filterMinScore}
                onChange={(event) => setFilterMinScore(event.target.value)}
              />
            </div>
          </div>

          <Button
            onClick={() => void createCampaign()}
            disabled={creating || !name.trim() || !messageBody.trim()}
          >
            Save as draft
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.name}</TableCell>
                  <TableCell className="capitalize">{campaign.channel}</TableCell>
                  <TableCell>
                    <Badge variant={campaign.status === 'queued' ? 'outline' : 'secondary'}>
                      {campaign.status === 'queued' ? 'Queued (dry run)' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => void loadPreview(campaign.id)}>
                      Preview
                    </Button>
                    {campaign.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => void queueCampaign(campaign.id)}
                        disabled={queuingId === campaign.id}
                      >
                        Queue (dry run)
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          )}
        </CardContent>
      </Card>

      {previewFor && preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview — {preview.matchedLeadCount} matching lead
              {preview.matchedLeadCount === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.sample.map((item) => (
              <div key={item.leadId} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{item.leadName}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {item.previewMessage}
                </p>
              </div>
            ))}
            {preview.sample.length === 0 && (
              <p className="text-sm text-muted-foreground">No leads match this campaign.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
