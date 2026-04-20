import { PageShell } from '@/components/ui/page-shell';
import { ReportCardSkeleton } from '@/components/report-card/report-card-skeleton';

export default function Loading() {
  return (
    <PageShell>
      <ReportCardSkeleton />
    </PageShell>
  );
}
