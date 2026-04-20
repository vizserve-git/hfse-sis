'use client';

import { CheckCircle2, Clock, Download, Upload, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HistoryDialog } from '@/components/p-files/history-dialog';
import { UploadDialog } from '@/components/p-files/upload-dialog';
import type { DocumentStatus, SlotMeta } from '@/lib/p-files/document-config';

type DocumentCardProps = {
  enroleeNumber: string;
  slotKey: string;
  label: string;
  status: DocumentStatus;
  url?: string | null;
  expiryDate?: string | null;
  expires: boolean;
  meta: SlotMeta | null;
  /** Whether the viewing role can upload / replace. Admin viewers read-only. */
  canWrite?: boolean;
};

const STATUS_STRIP: Record<DocumentStatus, string> = {
  valid: 'bg-brand-mint',
  uploaded: 'bg-brand-amber',
  expired: 'bg-destructive',
  rejected: 'bg-destructive',
  missing: 'bg-border',
  na: 'bg-border',
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'valid':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-brand-mint bg-brand-mint/20 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
          <CheckCircle2 className="size-3" /> On file
        </Badge>
      );
    case 'uploaded':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-brand-amber/40 bg-brand-amber/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-amber">
          <Upload className="size-3" /> Pending review
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-destructive/30 bg-destructive/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
          <Clock className="size-3" /> Expired
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-destructive/30 bg-destructive/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
          <XCircle className="size-3" /> Rejected
        </Badge>
      );
    case 'missing':
      return (
        <Badge variant="outline" className="h-6 border-dashed border-border bg-muted px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Missing
        </Badge>
      );
    case 'na':
      return (
        <Badge variant="outline" className="h-6 border-border bg-muted px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          N/A
        </Badge>
      );
  }
}

function expiryLabel(expiryDate: string | null): string | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
  if (diff === 0) return 'Expires today';
  return `${diff} day${diff === 1 ? '' : 's'} remaining`;
}

export function DocumentCard({
  enroleeNumber,
  slotKey,
  label,
  status,
  url,
  expiryDate,
  expires,
  meta,
  canWrite = false,
}: DocumentCardProps) {
  const expLabel = expires ? expiryLabel(expiryDate ?? null) : null;
  const isOverdue = expLabel?.includes('overdue') ?? false;
  const hasFile = status !== 'missing' && status !== 'na';
  const canUpload = canWrite && status !== 'na';

  return (
    <div
      id={`slot-${slotKey}`}
      className="group scroll-mt-20 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs transition-shadow hover:shadow-sm target:ring-2 target:ring-brand-indigo/40"
    >
      {/* Status color strip */}
      <div className={`h-1 ${STATUS_STRIP[status]}`} />

      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-sm font-semibold tracking-tight text-foreground">
              {label}
            </p>
            {expires && expiryDate && (
              <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                Expires {new Date(expiryDate).toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })}
                {expLabel && ` · ${expLabel}`}
              </p>
            )}
            {expires && !expiryDate && status !== 'missing' && status !== 'na' && (
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">No expiry date set</p>
            )}
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {url && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Download className="size-3" />
                View file
              </a>
            </Button>
          )}
          {canUpload && (
            <UploadDialog
              enroleeNumber={enroleeNumber}
              slotKey={slotKey}
              label={label}
              expires={expires}
              meta={meta}
              isReplacement={hasFile}
            />
          )}
          {hasFile && (
            <HistoryDialog
              enroleeNumber={enroleeNumber}
              slotKey={slotKey}
              label={label}
            />
          )}
        </div>
      </div>
    </div>
  );
}
