import { unstable_cache } from 'next/cache';

import { createAdmissionsClient } from '@/lib/supabase/admissions';
import {
  computeDelta,
  daysInRange,
  parseLocalDate,
  toISODate,
  type RangeInput,
  type RangeResult,
} from '@/lib/dashboard/range';

// Sprint 7 Part A — read-only admissions analytics.
//
// Every helper here runs against the shared Supabase project using the
// service-role client. Results are wrapped in unstable_cache with a 10-minute
// TTL and an `admissions-dashboard:${ayCode}` tag so we can manually
// invalidate per-AY later if Joann asks for a "refresh" button.
//
// Table-name derivation: ayCode "AY2026" → prefix "ay2026" → tables
// ay2026_enrolment_applications, ay2026_enrolment_status, ay2026_enrolment_documents.
// Never hardcode the year — Key Decision #14.

const CACHE_TTL_SECONDS = 600;

function prefixFor(ayCode: string): string {
  return `ay${ayCode.replace(/^AY/i, '').toLowerCase()}`;
}

function tag(ayCode: string): string[] {
  return ['admissions-dashboard', `admissions-dashboard:${ayCode}`];
}

// Canonical 7 statuses from the spec (08-admission-dashboard.md §1.1).
// Any other value returned by the admissions DB folds into "Other" and is
// surfaced to the user rather than silently dropped.
export const PIPELINE_STATUSES = [
  'Submitted',
  'Ongoing Verification',
  'Processing',
  'Enrolled',
  'Enrolled (Conditional)',
  'Withdrawn',
  'Cancelled',
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export type PipelineCounts = Record<PipelineStatus, number> & {
  Other: number;
  total: number;
};

type StatusLite = {
  enroleeNumber: string | null;
  applicationStatus: string | null;
  applicationUpdatedDate: string | null;
  classLevel: string | null;
  levelApplied: string | null;
  assessmentGradeMath: string | number | null;
  assessmentGradeEnglish: string | number | null;
};

type AppLite = {
  enroleeNumber: string | null;
  enroleeFullName: string | null;
  firstName: string | null;
  lastName: string | null;
  levelApplied: string | null;
  created_at: string | null;
  howDidYouKnowAboutHFSEIS: string | null;
};

// ──────────────────────────────────────────────────────────────────────────
// Shared fetch — every dashboard query needs the joined (apps × status) shape,
// so we fetch both tables once and memoize via unstable_cache. Downstream
// aggregators re-use the same cached payload.
//
// Column ownership reality (probed live 2026-04-17):
//   apps    — enroleeFullName, firstName, lastName, levelApplied, created_at,
//             howDidYouKnowAboutHFSEIS
//   status  — applicationStatus, applicationUpdatedDate, classLevel,
//             levelApplied, assessmentGradeMath, assessmentGradeEnglish
// The spec doc lists `a.applicationStatus` and `a.assessment...` in its SQL
// snippets, but those columns are actually on the status table. Selecting
// them from the apps table makes the whole query fail silently.
// ──────────────────────────────────────────────────────────────────────────

type JoinedRow = AppLite & {
  applicationStatus: string | null;
  applicationUpdatedDate: string | null;
  statusLevel: string | null;
  assessmentGradeMath: string | number | null;
  assessmentGradeEnglish: string | number | null;
};

async function loadJoinedRowsUncached(ayCode: string): Promise<JoinedRow[]> {
  const prefix = prefixFor(ayCode);
  const appsTable = `${prefix}_enrolment_applications`;
  const statusTable = `${prefix}_enrolment_status`;

  const supabase = createAdmissionsClient();

  const [appsRes, statusRes] = await Promise.all([
    supabase
      .from(appsTable)
      .select(
        'enroleeNumber, enroleeFullName, firstName, lastName, levelApplied, created_at, howDidYouKnowAboutHFSEIS',
      ),
    supabase
      .from(statusTable)
      .select(
        'enroleeNumber, applicationStatus, applicationUpdatedDate, classLevel, levelApplied, assessmentGradeMath, assessmentGradeEnglish',
      ),
  ]);

  if (appsRes.error) {
    console.error('[admissions-dashboard] apps fetch failed:', appsRes.error.message);
    return [];
  }
  if (statusRes.error) {
    console.error('[admissions-dashboard] status fetch failed:', statusRes.error.message);
    return [];
  }

  const apps = (appsRes.data ?? []) as AppLite[];
  const statuses = (statusRes.data ?? []) as StatusLite[];

  const statusByEnrolee = new Map<string, StatusLite>();
  for (const s of statuses) {
    if (s.enroleeNumber) statusByEnrolee.set(s.enroleeNumber, s);
  }

  const out: JoinedRow[] = [];
  for (const a of apps) {
    if (!a.enroleeNumber) continue;
    const s = statusByEnrolee.get(a.enroleeNumber);
    // Fallback: the admissions team never stamps `applicationUpdatedDate` in
    // practice (0/471 populated in AY2026 as of 2026-04-17), so staleness
    // against null would make every row "Never updated." Falling back to the
    // application's `created_at` gives the real-world meaning "days since
    // submission, if nobody has touched it." The RAG tiers and pipeline-age
    // column then produce meaningful red/amber/green signal instead of all
    // collapsing into the unknown bucket.
    out.push({
      ...a,
      applicationStatus: s?.applicationStatus ?? null,
      applicationUpdatedDate: s?.applicationUpdatedDate ?? a.created_at,
      statusLevel: s?.classLevel ?? s?.levelApplied ?? null,
      assessmentGradeMath: s?.assessmentGradeMath ?? null,
      assessmentGradeEnglish: s?.assessmentGradeEnglish ?? null,
    });
  }
  return out;
}

function loadJoinedRows(ayCode: string): Promise<JoinedRow[]> {
  return unstable_cache(
    () => loadJoinedRowsUncached(ayCode),
    ['admissions-joined', ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(ayCode) },
  )();
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregators — each takes rows from loadJoinedRows and reduces them.
// ──────────────────────────────────────────────────────────────────────────

export async function getPipelineCounts(ayCode: string): Promise<PipelineCounts> {
  const rows = await loadJoinedRows(ayCode);
  const counts: PipelineCounts = {
    Submitted: 0,
    'Ongoing Verification': 0,
    Processing: 0,
    Enrolled: 0,
    'Enrolled (Conditional)': 0,
    Withdrawn: 0,
    Cancelled: 0,
    Other: 0,
    total: 0,
  };
  for (const r of rows) {
    counts.total += 1;
    const s = (r.applicationStatus ?? '').trim();
    if ((PIPELINE_STATUSES as readonly string[]).includes(s)) {
      counts[s as PipelineStatus] += 1;
    } else {
      counts.Other += 1;
    }
  }
  return counts;
}

export type TimeToEnrollment = {
  avgDays: number;
  sampleSize: number;
};

export async function getAverageTimeToEnrollment(ayCode: string): Promise<TimeToEnrollment> {
  const rows = await loadJoinedRows(ayCode);
  let total = 0;
  let n = 0;
  for (const r of rows) {
    if (!r.created_at || !r.applicationUpdatedDate) continue;
    if (
      r.applicationStatus !== 'Enrolled' &&
      r.applicationStatus !== 'Enrolled (Conditional)'
    ) {
      continue;
    }
    const start = Date.parse(r.created_at);
    const end = Date.parse(r.applicationUpdatedDate);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (days < 0) continue;
    total += days;
    n += 1;
  }
  return { avgDays: n > 0 ? Math.round(total / n) : 0, sampleSize: n };
}

export type LevelBucket = {
  level: string;
  submitted: number;
  enrolled: number;
};

export async function getApplicationsByLevel(ayCode: string): Promise<LevelBucket[]> {
  const rows = await loadJoinedRows(ayCode);
  const buckets = new Map<string, LevelBucket>();
  for (const r of rows) {
    const level = (r.levelApplied ?? r.statusLevel ?? 'Unknown').trim() || 'Unknown';
    const b = buckets.get(level) ?? { level, submitted: 0, enrolled: 0 };
    b.submitted += 1;
    if (
      r.applicationStatus === 'Enrolled' ||
      r.applicationStatus === 'Enrolled (Conditional)'
    ) {
      b.enrolled += 1;
    }
    buckets.set(level, b);
  }
  return Array.from(buckets.values()).sort((a, b) => a.level.localeCompare(b.level));
}

export type FunnelStage = {
  stage: string;
  count: number;
  dropOffPct: number; // % drop from previous stage (0 on first stage)
};

// Funnel counts are cumulative: every enrolled application also passed
// through verification and processing, so we count a status as having reached
// every earlier stage. That's how the spec funnel reads in practice.
export async function getConversionFunnel(ayCode: string): Promise<FunnelStage[]> {
  const counts = await getPipelineCounts(ayCode);
  const stages = [
    { stage: 'Submitted', count: counts.total - counts.Cancelled - counts.Withdrawn },
    {
      stage: 'Ongoing Verification',
      count:
        counts['Ongoing Verification'] +
        counts.Processing +
        counts.Enrolled +
        counts['Enrolled (Conditional)'],
    },
    {
      stage: 'Processing',
      count: counts.Processing + counts.Enrolled + counts['Enrolled (Conditional)'],
    },
    { stage: 'Enrolled', count: counts.Enrolled + counts['Enrolled (Conditional)'] },
  ];
  const out: FunnelStage[] = [];
  for (let i = 0; i < stages.length; i++) {
    const prev = i === 0 ? stages[i].count : stages[i - 1].count;
    const dropOffPct =
      prev > 0 && i > 0 ? Math.round(((prev - stages[i].count) / prev) * 100) : 0;
    out.push({ ...stages[i], dropOffPct });
  }
  return out;
}

export type OutdatedRow = {
  enroleeNumber: string;
  fullName: string;
  status: string;
  levelApplied: string | null;
  lastUpdated: string | null; // ISO date
  daysSinceUpdate: number | null;
  daysInPipeline: number;
};

// Spec §1.2 uses a blocklist (`NOT IN ('Enrolled', 'Cancelled', 'Withdrawn')`)
// rather than an allowlist. This matters: rows with NULL applicationStatus
// and any future intermediate status (e.g. "Ready for Assessment") stay in
// scope automatically. The freshness cutoff of 7 days comes from the same
// section of the spec — this function only returns genuinely outdated rows.
const INACTIVE_STATUSES = new Set(['Enrolled', 'Cancelled', 'Withdrawn']);
const STALE_DAY_THRESHOLD = 7;

export async function getOutdatedApplications(ayCode: string): Promise<OutdatedRow[]> {
  const rows = await loadJoinedRows(ayCode);
  const today = new Date();
  const out: OutdatedRow[] = [];
  for (const r of rows) {
    if (!r.enroleeNumber) continue;
    const status = (r.applicationStatus ?? '').trim();
    if (INACTIVE_STATUSES.has(status)) continue;

    const created = r.created_at ? Date.parse(r.created_at) : NaN;
    const updated = r.applicationUpdatedDate ? Date.parse(r.applicationUpdatedDate) : NaN;

    const daysSinceUpdate = Number.isNaN(updated)
      ? null
      : Math.floor((today.getTime() - updated) / (1000 * 60 * 60 * 24));
    const daysInPipeline = Number.isNaN(created)
      ? 0
      : Math.floor((today.getTime() - created) / (1000 * 60 * 60 * 24));

    // Spec-faithful freshness cutoff: keep rows where applicationUpdatedDate
    // is NULL (most urgent) or ≥ 7 days old. Fresh rows are dropped.
    if (daysSinceUpdate !== null && daysSinceUpdate < STALE_DAY_THRESHOLD) continue;

    out.push({
      enroleeNumber: r.enroleeNumber,
      fullName:
        (r.enroleeFullName ?? '').trim() ||
        `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() ||
        r.enroleeNumber,
      status,
      levelApplied: r.levelApplied ?? r.statusLevel,
      lastUpdated: r.applicationUpdatedDate,
      daysSinceUpdate,
      daysInPipeline,
    });
  }
  // Null updates float to the top (never updated = most urgent).
  out.sort((a, b) => {
    if (a.daysSinceUpdate === null && b.daysSinceUpdate === null) return 0;
    if (a.daysSinceUpdate === null) return -1;
    if (b.daysSinceUpdate === null) return 1;
    return b.daysSinceUpdate - a.daysSinceUpdate;
  });
  return out;
}

export type AssessmentOutcomes = {
  mathPass: number;
  mathFail: number;
  mathUnknown: number;
  engPass: number;
  engFail: number;
  engUnknown: number;
};

// HFSE uses a 60% pass mark on the entrance assessment (confirmed by Joann in
// the AY2026 onboarding notes). Grades are stored as strings that may be
// numeric ("72"), letter ("B+"), or blank. Letter grades follow the standard
// A/B/C = pass, D/F = fail convention.
function classifyAssessment(raw: string | number | null): 'pass' | 'fail' | 'unknown' {
  if (raw === null || raw === undefined) return 'unknown';
  if (typeof raw === 'number') return raw >= 60 ? 'pass' : 'fail';
  const s = String(raw).trim();
  if (!s) return 'unknown';
  const n = Number(s);
  if (!Number.isNaN(n)) return n >= 60 ? 'pass' : 'fail';
  const letter = s.toUpperCase()[0];
  if (['A', 'B', 'C'].includes(letter)) return 'pass';
  if (['D', 'F'].includes(letter)) return 'fail';
  return 'unknown';
}

export async function getAssessmentOutcomes(ayCode: string): Promise<AssessmentOutcomes> {
  const rows = await loadJoinedRows(ayCode);
  const out: AssessmentOutcomes = {
    mathPass: 0,
    mathFail: 0,
    mathUnknown: 0,
    engPass: 0,
    engFail: 0,
    engUnknown: 0,
  };
  for (const r of rows) {
    const m = classifyAssessment(r.assessmentGradeMath);
    const e = classifyAssessment(r.assessmentGradeEnglish);
    if (m === 'pass') out.mathPass += 1;
    else if (m === 'fail') out.mathFail += 1;
    else out.mathUnknown += 1;
    if (e === 'pass') out.engPass += 1;
    else if (e === 'fail') out.engFail += 1;
    else out.engUnknown += 1;
  }
  return out;
}

export type ReferralSource = {
  source: string;
  count: number;
};

export async function getReferralSourceBreakdown(ayCode: string): Promise<ReferralSource[]> {
  const rows = await loadJoinedRows(ayCode);
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = (r.howDidYouKnowAboutHFSEIS ?? '').trim();
    const key = raw || 'Not specified';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = Array.from(counts.entries()).map(([source, count]) => ({ source, count }));
  all.sort((a, b) => b.count - a.count);
  const TOP = 8;
  if (all.length <= TOP) return all;
  const top = all.slice(0, TOP);
  const rest = all.slice(TOP);
  const otherTotal = rest.reduce((acc, r) => acc + r.count, 0);
  top.push({ source: 'Other', count: otherTotal });
  return top;
}

// Document completion — live query against ay{YY}_enrolment_documents.
// "Complete" = all 5 core docs have a non-null status value: medical,
// passport, birthCert, educCert, idPicture. form12 is excluded because it's
// always null in AY2026 (legacy column). Status values seen in practice are
// "Uploaded" / "Valid" — we treat any non-null as complete.
export type DocumentCompletion = {
  percent: number;
  withAll: number;
  total: number;
} | null;

const CORE_DOC_STATUS_COLUMNS = [
  'medicalStatus',
  'passportStatus',
  'birthCertStatus',
  'educCertStatus',
  'idPictureStatus',
] as const;

async function getDocumentCompletionUncached(
  ayCode: string,
): Promise<DocumentCompletion> {
  const prefix = prefixFor(ayCode);
  const docsTable = `${prefix}_enrolment_documents`;
  const supabase = createAdmissionsClient();

  const { data, error } = await supabase
    .from(docsTable)
    .select(CORE_DOC_STATUS_COLUMNS.join(','));
  if (error) {
    console.error('[admissions-dashboard] doc completion fetch failed:', error.message);
    return null;
  }
  const rows = (data ?? []) as unknown as Record<
    (typeof CORE_DOC_STATUS_COLUMNS)[number],
    string | null
  >[];
  const total = rows.length;
  if (total === 0) return { percent: 0, withAll: 0, total: 0 };
  let withAll = 0;
  for (const r of rows) {
    if (CORE_DOC_STATUS_COLUMNS.every((c) => (r[c] ?? '').toString().trim() !== '')) {
      withAll += 1;
    }
  }
  return {
    withAll,
    total,
    percent: Math.round((withAll / total) * 100),
  };
}

export function getDocumentCompletion(ayCode: string): Promise<DocumentCompletion> {
  return unstable_cache(
    () => getDocumentCompletionUncached(ayCode),
    ['admissions-doc-completion', ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(ayCode) },
  )();
}

// ──────────────────────────────────────────────────────────────────────────
// Range-aware siblings (new). Delegate to the existing `loadJoinedRows`
// cache (AY-scoped) and range-filter in memory — avoids stampede on per-
// (from,to) cache keys.
// ──────────────────────────────────────────────────────────────────────────

export type AdmissionsRangeKpis = {
  applicationsInRange: number;
  enrolledInRange: number;
  conversionPct: number;
  avgDaysToEnroll: number;
  sampleSize: number;
};

function inRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

function computeRangeKpis(rows: JoinedRow[], from: string, to: string): AdmissionsRangeKpis {
  let applications = 0;
  let enrolled = 0;
  let totalDays = 0;
  let samples = 0;

  for (const r of rows) {
    if (inRange(r.created_at, from, to)) applications += 1;
    const isEnrolled =
      r.applicationStatus === 'Enrolled' || r.applicationStatus === 'Enrolled (Conditional)';
    if (isEnrolled && inRange(r.applicationUpdatedDate, from, to)) {
      enrolled += 1;
      if (r.created_at && r.applicationUpdatedDate) {
        const start = Date.parse(r.created_at);
        const end = Date.parse(r.applicationUpdatedDate);
        if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
          totalDays += Math.round((end - start) / 86_400_000);
          samples += 1;
        }
      }
    }
  }

  return {
    applicationsInRange: applications,
    enrolledInRange: enrolled,
    conversionPct: applications > 0 ? (enrolled / applications) * 100 : 0,
    avgDaysToEnroll: samples > 0 ? Math.round(totalDays / samples) : 0,
    sampleSize: samples,
  };
}

async function loadAdmissionsKpisRangeUncached(
  input: RangeInput,
): Promise<RangeResult<AdmissionsRangeKpis>> {
  const rows = await loadJoinedRows(input.ayCode);
  const current = computeRangeKpis(rows, input.from, input.to);
  const comparison = computeRangeKpis(rows, input.cmpFrom, input.cmpTo);
  return {
    current,
    comparison,
    delta: computeDelta(current.applicationsInRange, comparison.applicationsInRange),
    range: { from: input.from, to: input.to },
    comparisonRange: { from: input.cmpFrom, to: input.cmpTo },
  };
}

export function getAdmissionsKpisRange(
  input: RangeInput,
): Promise<RangeResult<AdmissionsRangeKpis>> {
  return unstable_cache(
    loadAdmissionsKpisRangeUncached,
    ['admissions', 'kpis-range', input.ayCode, input.from, input.to, input.cmpFrom, input.cmpTo],
    { tags: tag(input.ayCode), revalidate: CACHE_TTL_SECONDS },
  )(input);
}

// Applications-per-day velocity.

export type VelocityPoint = { x: string; y: number };

function bucketByDay(dates: (string | null)[], from: string, to: string): VelocityPoint[] {
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);
  if (!fromDate || !toDate) return [];
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

async function loadApplicationsVelocityRangeUncached(
  input: RangeInput,
): Promise<RangeResult<VelocityPoint[]>> {
  const rows = await loadJoinedRows(input.ayCode);
  const createdDates = rows.map((r) => r.created_at);
  const current = bucketByDay(createdDates, input.from, input.to);
  const comparison = bucketByDay(createdDates, input.cmpFrom, input.cmpTo);
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

export function getApplicationsVelocityRange(
  input: RangeInput,
): Promise<RangeResult<VelocityPoint[]>> {
  return unstable_cache(
    loadApplicationsVelocityRangeUncached,
    ['admissions', 'apps-velocity', input.ayCode, input.from, input.to, input.cmpFrom, input.cmpTo],
    { tags: tag(input.ayCode), revalidate: CACHE_TTL_SECONDS },
  )(input);
}

// Time-to-enroll histogram — 7 day-buckets.

export type TimeToEnrollBucket = {
  label: string;
  loDays: number;
  hiDays: number | null;
  count: number;
};

const HISTOGRAM_BUCKETS = [
  { label: '0–7d', lo: 0, hi: 7 },
  { label: '8–14d', lo: 8, hi: 14 },
  { label: '15–30d', lo: 15, hi: 30 },
  { label: '31–60d', lo: 31, hi: 60 },
  { label: '61–90d', lo: 61, hi: 90 },
  { label: '91–180d', lo: 91, hi: 180 },
  { label: '>180d', lo: 181, hi: null as number | null },
] as const;

async function loadTimeToEnrollHistogramUncached(ayCode: string): Promise<TimeToEnrollBucket[]> {
  const rows = await loadJoinedRows(ayCode);
  const buckets: TimeToEnrollBucket[] = HISTOGRAM_BUCKETS.map((b) => ({
    label: b.label,
    loDays: b.lo,
    hiDays: b.hi,
    count: 0,
  }));
  for (const r of rows) {
    const isEnrolled =
      r.applicationStatus === 'Enrolled' || r.applicationStatus === 'Enrolled (Conditional)';
    if (!isEnrolled) continue;
    if (!r.created_at || !r.applicationUpdatedDate) continue;
    const start = Date.parse(r.created_at);
    const end = Date.parse(r.applicationUpdatedDate);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) continue;
    const days = Math.round((end - start) / 86_400_000);
    const idx = buckets.findIndex(
      (b) => days >= b.loDays && (b.hiDays === null || days <= b.hiDays),
    );
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}

export function getTimeToEnrollHistogram(ayCode: string): Promise<TimeToEnrollBucket[]> {
  return unstable_cache(
    () => loadTimeToEnrollHistogramUncached(ayCode),
    ['admissions', 'time-to-enroll-histogram', ayCode],
    { revalidate: CACHE_TTL_SECONDS, tags: tag(ayCode) },
  )();
}
