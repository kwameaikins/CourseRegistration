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
  full_name: string;
  email: string;
  phone: string;
  company: string | null;
  job_title: string | null;
  lead_source: string;
  status: string;
  score: number;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function LeadDetailDialog({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      return;
    }
    void (async () => {
      try {
        const result = await apiFetch<{ lead: LeadDetail }>(`/api/leads/${leadId}`);
        setLead(result.lead);
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
              <p className="font-medium">{lead.full_name}</p>
              <p className="text-muted-foreground">{lead.email}</p>
              <p className="text-muted-foreground">{lead.phone}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{lead.status}</Badge>
              <Badge variant="secondary">Score {lead.score}</Badge>
              <Badge variant="outline">{lead.lead_source}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Company</p>
              <p>{lead.company ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Job title</p>
              <p>{lead.job_title ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap">{lead.notes ?? 'No notes yet.'}</p>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Created {new Date(lead.created_at).toLocaleString()}</span>
              <span>Updated {new Date(lead.updated_at).toLocaleString()}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
