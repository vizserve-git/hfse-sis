import { ArrowRight, CalendarCheck, Clock, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DonutChart } from "@/components/dashboard/charts/donut-chart";
import { TrendChart } from "@/components/dashboard/charts/trend-chart";
import { ComparisonToolbar } from "@/components/dashboard/comparison-toolbar";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import {
  getAttendanceKpisRange,
  getDailyAttendanceRange,
  getDayTypeDistributionRange,
  getExReasonMixRange,
  getTopAbsentRange,
} from "@/lib/attendance/dashboard";
import { attendanceInsights } from "@/lib/dashboard/insights";
import { formatRangeLabel, resolveRange, type DashboardSearchParams } from "@/lib/dashboard/range";
import { getDashboardWindows } from "@/lib/dashboard/windows";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export default async function AttendanceDashboard({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  // Teachers should still land on the section picker — the dashboard is
  // registrar+.
  if (session.role === "teacher") redirect("/attendance/sections");

  const supabase = await createClient();
  const { data: ay } = await supabase
    .from("academic_years")
    .select("id, ay_code, label")
    .eq("is_current", true)
    .single();
  if (!ay) {
    return (
      <PageShell>
        <div className="text-sm text-destructive">No current academic year configured.</div>
      </PageShell>
    );
  }

  const resolvedSearch = await searchParams;
  const selectedAy = typeof resolvedSearch.ay === "string" ? resolvedSearch.ay : ay.ay_code;
  const windows = await getDashboardWindows(selectedAy);
  const rangeInput = resolveRange(resolvedSearch, windows, selectedAy);
  const ayCodes = [ay.ay_code];

  const [kpisResult, dailySeries, exMix, topAbsent, dayTypes] = await Promise.all([
    getAttendanceKpisRange(rangeInput),
    getDailyAttendanceRange(rangeInput),
    getExReasonMixRange(rangeInput),
    getTopAbsentRange(rangeInput, 10),
    getDayTypeDistributionRange(rangeInput),
  ]);

  const comparisonLabel = `vs ${formatRangeLabel({ from: rangeInput.cmpFrom, to: rangeInput.cmpTo })}`;

  const insights = attendanceInsights({
    attendancePct: kpisResult.current.attendancePct,
    attendancePctPrior: kpisResult.comparison.attendancePct,
    late: kpisResult.current.late,
    latePrior: kpisResult.comparison.late,
    excused: kpisResult.current.excused,
    absent: kpisResult.current.absent,
    absentPrior: kpisResult.comparison.absent,
    encodedDays: kpisResult.current.encodedDays,
  });

  return (
    <PageShell>
      <DashboardHero
        eyebrow="Attendance · Dashboard"
        title="Attendance at a glance"
        description="Daily attendance, absence patterns, day-type mix, top-absent students. Section picker for marking today's attendance is one click away."
        badges={[{ label: selectedAy }]}
        actions={
          <Button asChild size="sm">
            <Link href="/attendance/sections">
              Mark attendance
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <ComparisonToolbar
        ayCode={selectedAy}
        ayCodes={ayCodes}
        range={{ from: rangeInput.from, to: rangeInput.to }}
        comparison={{ from: rangeInput.cmpFrom, to: rangeInput.cmpTo }}
        termWindows={windows.term}
        ayWindows={windows.ay}
        showAySwitcher={false}
      />

      <InsightsPanel insights={insights} />

      {/* KPIs */}
      <section className="grid gap-4 xl:grid-cols-4">
        <MetricCard
          label="Attendance rate"
          value={kpisResult.current.attendancePct}
          format="percent"
          icon={UserCheck}
          intent={kpisResult.current.attendancePct >= 95 ? "good" : "warning"}
          delta={kpisResult.delta}
          deltaGoodWhen="up"
          comparisonLabel={comparisonLabel}
          sparkline={dailySeries.current.slice(-14)}
        />
        <MetricCard
          label="Late incidents"
          value={kpisResult.current.late}
          icon={Clock}
          intent={kpisResult.current.late > kpisResult.comparison.late ? "warning" : "default"}
          deltaGoodWhen="down"
          subtext={`${kpisResult.comparison.late} prior`}
        />
        <MetricCard
          label="Excused"
          value={kpisResult.current.excused}
          icon={CalendarCheck}
          intent="default"
          subtext={`${kpisResult.comparison.excused} prior`}
        />
        <MetricCard
          label="Absences"
          value={kpisResult.current.absent}
          icon={UserX}
          intent={kpisResult.current.absent > 0 ? "bad" : "good"}
          deltaGoodWhen="down"
          subtext={`${kpisResult.comparison.absent} prior`}
        />
      </section>

      {/* Daily attendance % trend */}
      {dailySeries.current.length > 1 && (
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Daily attendance
            </CardDescription>
            <CardTitle className="font-serif text-xl">% attended per day</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              label="Attendance %"
              current={dailySeries.current}
              comparison={dailySeries.comparison}
              yFormat="percent"
            />
          </CardContent>
        </Card>
      )}

      {/* EX reason + Day type donuts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Excused reason mix
            </CardDescription>
            <CardTitle className="font-serif text-xl">Why absences are excused</CardTitle>
          </CardHeader>
          <CardContent>
            {exMix.length > 0 ? (
              <DonutChart data={exMix} centerValue={exMix.reduce((s, d) => s + d.value, 0)} centerLabel="Total EX" />
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-ink-4">
                No excused absences in range.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
              Day-type distribution
            </CardDescription>
            <CardTitle className="font-serif text-xl">Calendar make-up of range</CardTitle>
          </CardHeader>
          <CardContent>
            {dayTypes.length > 0 ? (
              <DonutChart data={dayTypes} centerValue={dayTypes.reduce((s, d) => s + d.value, 0)} centerLabel="Days" />
            ) : (
              <div className="flex h-40 items-center justify-center text-xs text-ink-4">No calendar data in range.</div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Top-absent students table */}
      <Card>
        <CardHeader>
          <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
            Needs attention
          </CardDescription>
          <CardTitle className="font-serif text-xl">Top-absent students</CardTitle>
        </CardHeader>
        <CardContent>
          {topAbsent.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-ink-4">
              No absences in range. {String.fromCodePoint(0x1f389)}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-ink-4">
                  <th className="py-2">Student</th>
                  <th className="py-2">Section</th>
                  <th className="py-2 text-right">Absences</th>
                  <th className="py-2 text-right">Lates</th>
                </tr>
              </thead>
              <tbody>
                {topAbsent.map((r) => (
                  <tr key={r.sectionStudentId} className="border-b border-border/60">
                    <td className="py-2 font-medium text-foreground">{r.studentName}</td>
                    <td className="py-2 text-ink-4">{r.sectionName}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{r.absences}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-ink-4">{r.lates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Trust strip */}
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <CalendarCheck className="size-3" strokeWidth={2.25} />
        <span>{selectedAy}</span>
        <span className="text-border">·</span>
        <span>{kpisResult.current.encodedDays.toLocaleString("en-SG")} encoded days</span>
        <span className="text-border">·</span>
        <span>Cache 5m</span>
        <span className="text-border">·</span>
        <span>Audit-logged</span>
      </div>
    </PageShell>
  );
}
