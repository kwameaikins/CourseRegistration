'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  status: 'draft' | 'queued' | 'sent';
  queuedAt: string | null;
  createdAt: string;
}

interface CampaignMember {
  id: string;
  campaignId: string;
  leadId: string;
  previewMessage: string;
  sentAt: string | null;
  sendError: string | null;
  createdAt: string;
}

interface CampaignPreview {
  matchedLeadCount: number;
  sample: { leadId: string; leadName: string; previewMessage: string }[];
}

interface CampaignSendSetting {
  channel: Campaign['channel'];
  liveEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

const CHANNELS: Campaign['channel'][] = ['email', 'whatsapp', 'sms'];
const LIVE_CHANNELS: Campaign['channel'][] = ['email', 'sms'];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [settings, setSettings] = useState<CampaignSendSetting[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
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
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [savingSetting, setSavingSetting] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    const result = await apiFetch<{ campaigns: Campaign[] }>('/api/campaigns');
    setCampaigns(result.campaigns);
  }, []);

  const loadSettings = useCallback(async () => {
    const result = await apiFetch<{ settings: CampaignSendSetting[] }>(
      '/api/campaigns/send-settings',
    );
    setSettings(result.settings);
  }, []);

  const reload = useCallback(async () => {
    try {
      await Promise.all([loadCampaigns(), loadSettings()]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load campaigns.');
    }
  }, [loadCampaigns, loadSettings]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function isLiveEnabled(campaignChannel: Campaign['channel']) {
    return settings.find((setting) => setting.channel === campaignChannel)?.liveEnabled ?? false;
  }

  async function updateSetting(setting: CampaignSendSetting, liveEnabled: boolean) {
    setSavingSetting(setting.channel);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await apiFetch('/api/campaigns/send-settings', {
        method: 'PATCH',
        body: JSON.stringify({ channel: setting.channel, liveEnabled }),
      });
      setStatusMessage(`${setting.channel} live sending ${liveEnabled ? 'enabled' : 'disabled'}.`);
      await loadSettings();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update send setting.');
    } finally {
      setSavingSetting(null);
    }
  }

  async function createCampaign() {
    if (!name.trim() || !messageBody.trim()) return;
    setCreating(true);
    setErrorMessage(null);
    setStatusMessage(null);
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
      setStatusMessage('Campaign saved as draft.');
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
    setStatusMessage(null);
    try {
      await apiFetch(`/api/campaigns/${campaignId}/queue`, { method: 'POST' });
      setStatusMessage('Campaign queued as a dry run. No message was sent.');
      await loadCampaigns();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to queue campaign.');
    } finally {
      setQueuingId(null);
    }
  }

  async function sendCampaign(campaign: Campaign) {
    setSendingId(campaign.id);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const detail = await apiFetch<{ campaign: Campaign; members: CampaignMember[] }>(
        `/api/campaigns/${campaign.id}`,
      );
      const recipientCount = detail.members.length;
      const confirmationText = window.prompt(
        `This will send a real ${campaign.channel} message to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}. Type SEND ${recipientCount} to continue.`,
      );
      if (confirmationText === null) return;
      const result = await apiFetch<{ attempted: number; sent: number; failed: number }>(
        `/api/campaigns/${campaign.id}/send`,
        {
          method: 'POST',
          body: JSON.stringify({ confirmedRecipientCount: recipientCount, confirmationText }),
        },
      );
      setStatusMessage(
        `Live ${campaign.channel} send complete: ${result.sent}/${result.attempted} sent, ${result.failed} failed.`,
      );
      await loadCampaigns();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send campaign.');
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Draft a message to a filtered slice of leads. Queueing is still a{' '}
          <strong>dry run</strong>; real dispatch only happens through the separate Send action.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {statusMessage && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{statusMessage}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live send settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {settings.map((setting) => (
            <div key={setting.channel} className="flex items-center gap-2">
              <Switch
                id={`live-${setting.channel}`}
                checked={setting.liveEnabled}
                disabled={savingSetting === setting.channel}
                onCheckedChange={(checked) => void updateSetting(setting, checked)}
              />
              <label htmlFor={`live-${setting.channel}`} className="text-sm capitalize">
                {setting.channel} live sending
                {!LIVE_CHANNELS.includes(setting.channel) && ' (not wired yet)'}
              </label>
            </div>
          ))}
          {settings.length === 0 && (
            <p className="text-sm text-muted-foreground">No send settings found.</p>
          )}
        </CardContent>
      </Card>

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
                {CHANNELS.map((channelOption) => (
                  <option key={channelOption} value={channelOption}>
                    {channelOption}
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
                <TableHead>Live</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.name}</TableCell>
                  <TableCell className="capitalize">{campaign.channel}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        campaign.status === 'sent'
                          ? 'default'
                          : campaign.status === 'queued'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {campaign.status === 'queued'
                        ? 'Queued (dry run)'
                        : campaign.status === 'sent'
                          ? 'Sent'
                          : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell>{isLiveEnabled(campaign.channel) ? 'Enabled' : 'Off'}</TableCell>
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
                    {campaign.status === 'queued' && LIVE_CHANNELS.includes(campaign.channel) && (
                      <Button
                        size="sm"
                        onClick={() => void sendCampaign(campaign)}
                        disabled={sendingId === campaign.id || !isLiveEnabled(campaign.channel)}
                      >
                        {sendingId === campaign.id ? 'Sending...' : `Send live ${campaign.channel}`}
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
              Preview - {preview.matchedLeadCount} matching lead
              {preview.matchedLeadCount === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.sample.map((item) => (
              <div key={item.leadId} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{item.leadName}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{item.previewMessage}</p>
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
