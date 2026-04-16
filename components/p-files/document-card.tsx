'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
};

const STATUS_STRIP: Record<DocumentStatus, string> = {
  valid: 'bg-brand-mint',
  uploaded: 'bg-primary',
  expired: 'bg-brand-amber',
  rejected: 'bg-destructive',
  missing: 'bg-border',
  na: 'bg-border',
};

function StatusBadge({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'valid':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-brand-mint bg-brand-mint/20 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
          <CheckCircle2 className="size-3" /> Valid
        </Badge>
      );
    case 'uploaded':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-primary/30 bg-primary/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
          <Upload className="size-3" /> Pending Review
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="outline" className="h-6 gap-1 border-brand-amber/40 bg-brand-amber/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-amber">
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
}: DocumentCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const canApprove = status === 'uploaded';
  const canReject = status === 'uploaded' || status === 'valid';
  const canUpload = status === 'missing' || status === 'rejected' || status === 'expired';
  const expLabel = expires ? expiryLabel(expiryDate ?? null) : null;
  const isOverdue = expLabel?.includes('overdue') ?? false;

  async function handleAction(action: 'approve' | 'reject') {
    setBusy(true);
    try {
      const res = await fetch(`/api/p-files/${enroleeNumber}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slotKey, action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `${action} failed`);
      toast.success(`Document ${action === 'approve' ? 'approved' : 'rejected'}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  return (
    <>
      <div className="group overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs transition-shadow hover:shadow-sm">
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
            {canApprove && (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => setConfirmAction('approve')}
              >
                {busy && <Loader2 className="size-3 animate-spin" />}
                Approve
              </Button>
            )}
            {canReject && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => setConfirmAction('reject')}
              >
                Reject
              </Button>
            )}
            {canUpload && (
              <UploadDialog
                enroleeNumber={enroleeNumber}
                slotKey={slotKey}
                label={label}
                expires={expires}
                meta={meta}
              />
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(v) => { if (!v) setConfirmAction(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif tracking-tight">
              {confirmAction === 'approve' ? 'Approve this document?' : 'Reject this document?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-relaxed">
              {confirmAction === 'approve'
                ? `Mark "${label}" as valid. The document status will change to Valid.`
                : `Mark "${label}" as rejected. The parent may need to re-upload this document.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
              onClick={() => {
                if (confirmAction) handleAction(confirmAction);
              }}
            >
              {confirmAction === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
