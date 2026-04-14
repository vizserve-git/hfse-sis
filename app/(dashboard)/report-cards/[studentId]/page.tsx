import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { buildReportCard } from '@/lib/report-card/build-report-card';
import { ReportCardDocument } from '@/components/report-card/report-card-document';
import { PublicationStatus } from '@/components/admin/publication-status';
import { PrintButton } from './print-button';

export default async function ReportCardPreview({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const result = await buildReportCard(supabase, studentId);
  if (!result.ok) {
    if (result.error.kind === 'student_not_found' || result.error.kind === 'level_not_found') {
      notFound();
    }
    if (result.error.kind === 'no_current_ay') {
      return <div className="text-destructive">No current academic year.</div>;
    }
    if (result.error.kind === 'not_enrolled_this_ay') {
      return (
        <div className="text-sm text-muted-foreground">
          Student is not enrolled in the current academic year ({result.error.ayLabel}).
        </div>
      );
    }
  }
  if (!result.ok) notFound();
  const payload = result.payload;

  return (
    <div className="space-y-6">
      {/* Registrar controls — hidden from the "paper" preview below. */}
      <div className="mx-auto w-full max-w-[8.5in] print:hidden">
        <Link
          href="/report-cards"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All report cards
        </Link>
        <div className="mt-4">
          <PageHeader
            eyebrow="Report Card"
            title={payload.student.full_name}
            description={`${payload.level.label} · ${payload.section.name} · ${payload.ay.label}`}
            actions={<PrintButton />}
          />
        </div>
        <div className="mt-4">
          <PublicationStatus sectionId={payload.section.id} terms={payload.terms} />
        </div>
      </div>

      {/* --- Report card "paper" --- */}
      <ReportCardDocument payload={payload} />
    </div>
  );
}
