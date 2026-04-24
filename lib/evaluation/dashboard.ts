import { unstable_cache } from 'next/cache';

import { createServiceClient } from '@/lib/supabase/service';
import {
  computeDelta,
  daysInRange,
  parseLocalDate,
  toISODate,
  type RangeInput,
  type RangeResult,
} from '@/lib/dashboard/range';

// Evaluation dashboard aggregators — read-only view over
// `evaluation_writeups`. The Evaluation module is the sole writer
// (KD #49); we just summarise submission progress here.

const CACHE_TTL_SECONDS = 300;

function tag(ayCode: string): string[] {
  return ['evaluation-dashboard', `evaluation-dashboard:${ayCode}`];
}

type WriteupRow = {
  id: string;
  section_student_id: string;
  term_id: string;
  submitted: boolean;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

async function loadWriteupsUncached(ayCode: string): Promise<{
  writeups: WriteupRow[];
  termIdsByNumber: Map<number, string>;
  totalStudents: number;
}> {
  const service = createServiceClient();
  const { data: ayRow } = await service
    .from('academic_years')
    .select('id')
    .eq('ay_code', ayCode)
    .maybeSingle();
  const ayId = ayRow?.id as string | undefined;
  if (!ayId) return { writeups: [], termIdsByNumber: new Map(), totalStudents: 0 };

  const { data: termRows } = await service
    .from('terms')
    .select('id, term_number')
    .eq('academic_year_id', ayId)
    .neq('term_number', 4);
  const termIds = (termRows ?? []).map((r) => r.id as string);
  const termIdsByNumber = new Map<number, string>();
  for (const row of (termRows ?? []) as Array<{ id: string; term_number: number }>) {
    termIdsByNumber.set(row.term_number, row.id);
  }
  if (termIds.length === 0) return { writeups: [], termIdsByNumber, totalStudents: 0 };

  const { data: sectionRows } = await service
    .from('sections')
    .select('id')
    .eq('academic_year_id', ayId);
  const sectionIds = (sectionRows ?? []).map((r) => r.id as string);

  const { count: studentCount } =
    sectionIds.length > 0
      ? await service
          .from('section_students')
          .select('id', { count: 'exact', head: true })
          .in('section_id', sectionIds)
          .eq('enrollment_status', 'active')
      : { count: 0 };

  const { data: rows } = await service
    .from('evaluation_writeups')
    .select('id, section_student_id, term_id, submitted, submitted_at, created_at, updated_at')
    .in('term_id', termIds);

  return {
    writeups: (rows ?? []) as WriteupRow[],
    termIdsByNumber,
    totalStudents: studentCount ?? 0,
  };
}

function loadWriteups(ayCode: string) {
  return unstable_cache(
    () => loadWriteupsUncached(ayCode),
    ['evaluation', 'writeups-raw', ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(ayCode) },
  )();
}

// ──────────────────────────────────────────────────────────────────────────
// KPIs: submission %, advisers complete (inferred as submissions within term),
// avg time-to-submit, late submissions.
// ──────────────────────────────────────────────────────────────────────────

export type EvaluationKpis = {
  submissionPct: number;
  submitted: number;
  expected: number; // total students × T1-T3 terms
  medianTimeToSubmitDays: number | null;
  lateSubmissions: number;
};

function medianDays(samples: number[]): number | null {
  if (!samples.length) return null;
  const s = samples.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function kpisFrom(
  writeups: WriteupRow[],
  from: string,
  to: string,
  totalStudents: number,
  termCount: number,
): EvaluationKpis {
  const inRange = writeups.filter((w) => {
    const ref = w.submitted_at ?? w.updated_at ?? w.created_at;
    const day = ref.slice(0, 10);
    return day >= from && day <= to;
  });

  const submitted = inRange.filter((w) => w.submitted).length;
  const expected = totalStudents * termCount;
  const submissionPct = expected > 0 ? (submitted / expected) * 100 : 0;

  const samples: number[] = [];
  let late = 0;
  for (const w of inRange) {
    if (!w.submitted || !w.submitted_at) continue;
    const start = Date.parse(w.created_at);
    const end = Date.parse(w.submitted_at);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    const days = Math.round((end - start) / 86_400_000);
    samples.push(days);
    if (days > 14) late += 1;
  }

  return {
    submissionPct,
    submitted,
    expected,
    medianTimeToSubmitDays: medianDays(samples),
    lateSubmissions: late,
  };
}

async function loadEvaluationKpisRangeUncached(
  input: RangeInput,
): Promise<RangeResult<EvaluationKpis>> {
  const { writeups, termIdsByNumber, totalStudents } = await loadWriteups(input.ayCode);
  const termCount = termIdsByNumber.size || 3;
  const current = kpisFrom(writeups, input.from, input.to, totalStudents, termCount);
  const comparison = kpisFrom(writeups, input.cmpFrom, input.cmpTo, totalStudents, termCount);
  return {
    current,
    comparison,
    delta: computeDelta(current.submissionPct, comparison.submissionPct),
    range: { from: input.from, to: input.to },
    comparisonRange: { from: input.cmpFrom, to: input.cmpTo },
  };
}

export function getEvaluationKpisRange(
  input: RangeInput,
): Promise<RangeResult<EvaluationKpis>> {
  return unstable_cache(
    loadEvaluationKpisRangeUncached,
    ['evaluation', 'kpis-range', input.ayCode, input.from, input.to, input.cmpFrom, input.cmpTo],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(input.ayCode) },
  )(input);
}

// Submission velocity — daily counts of new submissions.

export type VelocityPoint = { x: string; y: number };

function bucketByDay(dates: (string | null)[], from: string, to: string): VelocityPoint[] {
  const fromDate = parseLocalDate(from);
  if (!fromDate) return [];
  const length = daysInRange({ from, to });
  const labels: string[] = [];
  for (let i = 0; i < length; i += 1) {
    const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
    labels.push(toISODate(d));
  }
  const buckets = new Array(length).fill(0) as number[];
  for (const iso of dates) {
    if (!iso) continue;
    const day = iso.slice(0, 10);
    const idx = labels.indexOf(day);
    if (idx >= 0) buckets[idx] += 1;
  }
  return labels.map((x, i) => ({ x, y: buckets[i] }));
}

async function loadSubmissionVelocityRangeUncached(
  input: RangeInput,
): Promise<RangeResult<VelocityPoint[]>> {
  const { writeups } = await loadWriteups(input.ayCode);
  const submittedAtDates = writeups.filter((w) => w.submitted).map((w) => w.submitted_at);
  const current = bucketByDay(submittedAtDates, input.from, input.to);
  const comparison = bucketByDay(submittedAtDates, input.cmpFrom, input.cmpTo);
  const currentTotal = current.reduce((s, p) => s + p.y, 0);
  const comparisonTotal = comparison.reduce((s, p) => s + p.y, 0);
  return {
    current,
    comparison,
    delta: computeDelta(currentTotal, comparisonTotal),
    range: { from: input.from, to: input.to },
    comparisonRange: { from: input.cmpFrom, to: input.cmpTo },
  };
}

export function getSubmissionVelocityRange(
  input: RangeInput,
): Promise<RangeResult<VelocityPoint[]>> {
  return unstable_cache(
    loadSubmissionVelocityRangeUncached,
    ['evaluation', 'velocity', input.ayCode, input.from, input.to, input.cmpFrom, input.cmpTo],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(input.ayCode) },
  )(input);
}
