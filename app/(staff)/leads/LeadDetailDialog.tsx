'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LeadDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string | null;
  jobTitle: string | null;
  leadSource: string;
  status: string;
  score: number;
  assignedTo: string | null;
  notes: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadActivity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export function LeadDetailDialog({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      setActivities([]);
      return;
    }
    void (async () => {
      try {
        const result = await apiFetch<{ lead: LeadDetail; activities: LeadActivity[] }>(
          `/api/leads/${leadId}`,
        );
        setLead(result.lead);
        setActivities(result.activities);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load lead.');
      }
    })();
  }, [leadId]);

  return (
    <Dialog open={leadId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lead detail</DialogTitle>
        </DialogHeader>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        {lead && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{lead.fullName}</p>
              <p className="text-muted-foreground">{lead.email}</p>
              <p className="text-muted-foreground">{lead.phone}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{lead.status}</Badge>
              <Badge variant="secondary">Score {lead.score}</Badge>
              <Badge variant="outline">{lead.leadSource}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Company</p>
              <p>{lead.company ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Job title</p>
              <p>{lead.jobTitle ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{lead.notes ?? 'No notes yet.'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Next follow-up</p>
              <p>
                {lead.nextFollowUpAt
                  ? new Date(lead.nextFollowUpAt).toLocaleDateString()
                  : 'Not scheduled'}
              </p>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Created {new Date(lead.createdAt).toLocaleString()}</span>
              <span>Updated {new Date(lead.updatedAt).toLocaleString()}</span>
            </div>
            <div>
              <p className="mb-2 text-muted-foreground">Activity</p>
              {activities.length === 0 ? (
                <p className="text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto border-l pl-3">
                  {activities.map((activity) => (
                    <li key={activity.id}>
                      <p>{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
