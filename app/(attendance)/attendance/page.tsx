import Link from 'next/link';
import {
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  School,
  Users,
} from 'lucide-react';

import { createClient, getSessionUser } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageShell } from '@/components/ui/page-shell';

type LevelLite = { id: string; code: string; label: string; level_type: 'primary' | 'secondary' };
type SectionCard = {
  id: string;
  name: string;
  level_label: string;
  level_code: string;
  active: number;
};

export default async function AttendanceSectionsListPage() {
  const session = await getSessionUser();
  const role = session?.role ?? null;
  const isTeacherOnly = role === 'teacher';

  const supabase = await createClient();

  const { data: ay } = await supabase
    .from('academic_years')
    .select('id, ay_code, label')
    .eq('is_current', true)
    .single();

  const { data: currentTerm } = await supabase
    .from('terms')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle();

  // For teachers, narrow to sections they form-advise. For registrar+, show all.
  let allowedSectionIds: Set<string> | null = null;
  if (isTeacherOnly && session?.id && ay) {
    const service = createServiceClient();
    const { data: assignments } = await service
      .from('teacher_assignments')
      .select('section_id, sections!inner(academic_year_id)')
      .eq('teacher_user_id', session.id)
      .eq('role', 'form_adviser')
      .eq('sections.academic_year_id', ay.id);
    allowedSectionIds = new Set(
      ((assignments ?? []) as Array<{ section_id: string }>).map((a) => a.section_id),
    );
  }

  const { data: sections } = ay
    ? await supabase
        .from('sections')
        .select('id, name, level:levels(id, code, label, level_type)')
        .eq('academic_year_id', ay.id)
    : { data: [] as Array<{ id: string; name: string; level: LevelLite | LevelLite[] | null }> };

  const ids = (sections ?? []).map((s) => s.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: enrolments } = await supabase
      .from('section_students')
      .select('section_id, enrollment_status')
      .in('section_id', ids);
    for (const row of enrolments ?? []) {
      if (row.enrollment_status !== 'withdrawn') {
        counts[row.section_id] = (counts[row.section_id] ?? 0) + 1;
      }
    }
  }

  const getLevel = (l: LevelLite | LevelLite[] | null): LevelLite | null =>
    Array.isArray(l) ? l[0] ?? null : l;

  const cards: SectionCard[] = (sections ?? [])
    .filter((s) => !allowedSectionIds || allowedSectionIds.has(s.id))
    .map((s) => {
      const lvl = getLevel(s.level as LevelLite | LevelLite[] | null);
      return {
        id: s.id,
        name: s.name,
        level_label: lvl?.label ?? 'Unknown',
        level_code: lvl?.code ?? '',
        active: counts[s.id] ?? 0,
      };
    });

  const grouped = new Map<string, SectionCard[]>();
  for (const c of cards) {
    if (!grouped.has(c.level_label)) grouped.set(c.level_label, []);
    grouped.get(c.level_label)!.push(c);
  }
  const sortedLevels = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  const totalSections = cards.length;
  const totalActive = cards.reduce((n, c) => n + c.active, 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell>
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Attendance · Daily entry
          </p>
          <h1 className="font-serif text-[38px] font-semibold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
            {isTeacherOnly ? 'Your sections.' : 'Pick a section.'}
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {isTeacherOnly
              ? 'The sections you form-advise. Click through to mark daily attendance for the chosen date.'
              : 'Every section in the current academic year. Click through to mark or review daily attendance.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ay && (
            <Badge
              variant="outline"
              className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
            >
              {ay.ay_code}
            </Badge>
          )}
          {currentTerm && (
            <Badge
              variant="outline"
              className="h-7 border-border bg-white px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground"
            >
              {currentTerm.label}
            </Badge>
          )}
        </div>
      </header>

      <div className="@container/main">
        <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2">
          <SummaryCard
            description={isTeacherOnly ? 'Your sections' : 'Total sections'}
            value={totalSections}
            icon={School}
            footerTitle={`${sortedLevels.length} ${sortedLevels.length === 1 ? 'level' : 'levels'}`}
            footerDetail={ay?.label ?? 'No current AY'}
          />
          <SummaryCard
            description="Students covered"
            value={totalActive}
            icon={Users}
            footerTitle="Currently enrolled"
            footerDetail="Across the sections above"
          />
        </div>
      </div>

      {sortedLevels.length === 0 && (
        <Card className="items-center py-12 text-center">
          <CardContent className="flex flex-col items-center gap-3">
            <div className="font-serif text-lg font-semibold text-foreground">
              {isTeacherOnly ? 'No sections assigned' : 'No sections yet'}
            </div>
            <div className="text-sm text-muted-foreground">
              {isTeacherOnly
                ? 'The registrar has not assigned you as a form adviser for any section yet.'
                : 'Run the seed SQL or ask the registrar to create sections for the current AY.'}
            </div>
          </CardContent>
        </Card>
      )}

      {sortedLevels.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            By level
          </h2>
          <div className="space-y-5">
            {sortedLevels.map(([level, sects]) => {
              const sorted = sects.slice().sort((a, b) => a.name.localeCompare(b.name));
              return (
                <Card key={level} className="@container/card gap-0 py-0">
                  <CardHeader className="border-b border-border py-5">
                    <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                      Level
                    </CardDescription>
                    <CardTitle className="font-serif text-[22px] font-semibold tracking-tight text-foreground">
                      {level}
                    </CardTitle>
                    <CardAction>
                      <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                        <CalendarCheck className="size-5" />
                      </div>
                    </CardAction>
                  </CardHeader>
                  <ul className="divide-y divide-border">
                    {sorted.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/attendance/${s.id}?date=${today}`}
                          className="group flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
                            <GraduationCap className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-serif text-[17px] font-semibold leading-snug tracking-tight text-foreground">
                              {s.name}
                            </div>
                            <div className="mt-0.5 text-xs">
                              <span className="font-mono tabular-nums text-foreground">
                                {s.active}
                                <span className="ml-1 text-muted-foreground">active</span>
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SummaryCard({
  description,
  value,
  icon: Icon,
  footerTitle,
  footerDetail,
}: {
  description: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  footerTitle: string;
  footerDetail: string;
}) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {description}
        </CardDescription>
        <CardTitle className="font-serif text-[32px] font-semibold leading-none tabular-nums text-foreground @[240px]/card:text-[38px]">
          {value.toLocaleString('en-SG')}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1 text-sm">
        <p className="font-medium text-foreground">{footerTitle}</p>
        <p className="text-xs text-muted-foreground">{footerDetail}</p>
      </CardFooter>
    </Card>
  );
}
