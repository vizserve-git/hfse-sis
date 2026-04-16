import { AySwitcher } from "@/components/admissions/ay-switcher";
import { CompletenessTable } from "@/components/p-files/completeness-table";
import { SummaryCards } from "@/components/p-files/summary-cards";
import { PageShell } from "@/components/ui/page-shell";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import { getDocumentDashboardData } from "@/lib/p-files/queries";
import { getSessionUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { redirect } from "next/navigation";

export default async function PFilesDashboard({ searchParams }: { searchParams: Promise<{ ay?: string }> }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");
  if (sessionUser.role !== "p-file" && sessionUser.role !== "superadmin") redirect("/");

  const service = createServiceClient();
  const currentAy = await getCurrentAcademicYear(service);
  if (!currentAy) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No current academic year configured.</div>
      </PageShell>
    );
  }

  // AY switcher: use searchParam or default to current
  const { ay: ayParam } = await searchParams;
  const { data: allAys } = await service
    .from("academic_years")
    .select("id, ay_code, label")
    .order("ay_code", { ascending: false });
  const ayList = (allAys ?? []) as { id: string; ay_code: string; label: string }[];
  const selectedAy = ayParam && ayList.some((a) => a.ay_code === ayParam) ? ayParam : currentAy.ay_code;

  const { students, summary } = await getDocumentDashboardData(selectedAy);

  return (
    <PageShell>
      <header className="space-y-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          P-Files · Document Tracking
        </p>
        <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
          Student document completeness.
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Track enrollment document status for all students. Review, approve, or upload documents on behalf of parents.
        </p>
      </header>

      <SummaryCards summary={summary} />

      <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
        <section className="max-w-xl rounded-xl border border-hairline bg-accent/50 p-4 text-xs text-muted-foreground">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-indigo-deep">
            Document Status Legend
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-brand-mint" /> Valid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-primary" /> Uploaded (pending review)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-brand-amber" /> Expired
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-destructive" /> Rejected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full border border-border bg-muted" /> Missing
            </span>
          </div>
        </section>

        <div className="w-full md:w-80 md:shrink-0">
          <AySwitcher current={selectedAy} options={ayList.map((a) => ({ code: a.ay_code, label: a.label }))} />
        </div>
      </div>

      <CompletenessTable students={students} />
    </PageShell>
  );
}
