import { Card } from '@/components/ui/card';
import { gradeDescriptor } from '@/lib/compute/annual';
import type {
  AttendanceRecord,
  Cell,
  CommentRecord,
  ReportCardPayload,
} from '@/lib/report-card/build-report-card';

// Pure render component for a single report card. Staff preview + parent
// view both render this same component. Print CSS lives here; consumers
// must NOT wrap this in another card/surface or the print layout will
// regress.
export function ReportCardDocument({ payload }: { payload: ReportCardPayload }) {
  const { ay, terms, student, section, level, enrollment_status, subjects, attendance, comments } =
    payload;

  return (
    <Card className="mx-auto max-w-[8.5in] space-y-6 p-8 shadow-sm print:border-0 print:shadow-none">
      <header className="border-b border-border pb-4 text-center">
        <h1 className="text-lg font-bold tracking-wide">HFSE INTERNATIONAL SCHOOL</h1>
        <div className="text-xs text-muted-foreground">Singapore</div>
        <h2 className="mt-2 text-base font-semibold uppercase">Student Progress Report</h2>
        <div className="text-xs text-muted-foreground">{ay.label}</div>
      </header>

      {/* Student info */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <InfoRow label="Name" value={student.full_name} />
        <InfoRow label="Student No." value={student.student_number} />
        <InfoRow label="Course" value={level.label} />
        <InfoRow label="Class" value={section.name} />
        <InfoRow label="Form Class Adviser" value={section.form_class_adviser ?? '—'} />
        <InfoRow label="Status" value={enrollment_status} />
      </section>

      {/* Academic grades */}
      <section>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Academic Grades
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-1 pr-2">Subject</th>
              {terms.map((t) => (
                <th key={t.id} className="w-14 py-1 text-center">
                  T{t.term_number}
                </th>
              ))}
              <th className="w-16 py-1 text-center">Final</th>
              <th className="py-1 pl-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((row) => (
              <tr key={row.subject.id} className="border-b border-border last:border-b-0">
                <td className="py-1 pr-2">{row.subject.name}</td>
                <td className="py-1 text-center tabular-nums">
                  {cellText(row.t1, row.subject.is_examinable)}
                </td>
                <td className="py-1 text-center tabular-nums">
                  {cellText(row.t2, row.subject.is_examinable)}
                </td>
                <td className="py-1 text-center tabular-nums">
                  {cellText(row.t3, row.subject.is_examinable)}
                </td>
                <td className="py-1 text-center tabular-nums">
                  {cellText(row.t4, row.subject.is_examinable)}
                </td>
                <td className="py-1 text-center font-semibold tabular-nums">
                  {row.subject.is_examinable ? row.annual ?? '—' : '—'}
                </td>
                <td className="py-1 pl-2 text-xs text-muted-foreground">
                  {row.subject.is_examinable ? gradeDescriptor(row.annual) : 'Letter'}
                </td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr>
                <td
                  colSpan={terms.length + 3}
                  className="py-3 text-center text-muted-foreground"
                >
                  No subjects configured for {level.label}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Grading legend */}
      <section className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
        <div className="font-semibold uppercase">Grading Legend</div>
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
          <div>90–100 · Outstanding</div>
          <div>A — Outstanding (90–100)</div>
          <div>85–89 · Very Satisfactory</div>
          <div>B — Very Satisfactory (85–89)</div>
          <div>80–84 · Satisfactory</div>
          <div>C — Satisfactory (80–84)</div>
          <div>75–79 · Fairly Satisfactory</div>
          <div>IP — In Progress (&lt; 80)</div>
          <div>&lt; 75 · Below Minimum</div>
          <div>NA / UG / INC / CO / E — special codes</div>
        </div>
      </section>

      {/* Attendance */}
      <section>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Attendance
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="py-1 pr-2"></th>
              {terms.map((t) => (
                <th key={t.id} className="py-1 text-center">
                  T{t.term_number}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['school_days', 'days_present', 'days_late'] as const).map((field) => (
              <tr key={field} className="border-b border-border last:border-b-0">
                <td className="py-1 pr-2 capitalize text-muted-foreground">
                  {field.replace('_', ' ')}
                </td>
                {terms.map((t) => {
                  const rec = attendance.find((a: AttendanceRecord) => a.term_id === t.id);
                  const val = rec?.[field] ?? null;
                  return (
                    <td key={t.id} className="py-1 text-center tabular-nums">
                      {val ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Adviser comments */}
      <section>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Form Class Adviser&apos;s Comments
        </div>
        <div className="space-y-2">
          {terms.map((t) => {
            const comment =
              comments.find((c: CommentRecord) => c.term_id === t.id)?.comment ?? null;
            return (
              <div key={t.id} className="rounded-md border border-border p-2 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {t.label}
                </div>
                <div className="mt-1 whitespace-pre-wrap">
                  {comment ?? (
                    <span className="italic text-muted-foreground">No comment yet.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer / signature line */}
      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        <div className="flex items-end justify-between">
          <div>
            <div className="mb-6">_________________________</div>
            <div>{section.form_class_adviser ?? 'Form Class Adviser'}</div>
          </div>
          <div className="text-right">
            <div className="mb-6">_________________________</div>
            <div>Parent / Guardian Signature</div>
          </div>
        </div>
        <div className="mt-4 text-center text-[10px] text-muted-foreground">
          HFSE International School · PEI Registration No. 2014xxxxx
        </div>
      </footer>
    </Card>
  );
}

function cellText(cell: Cell, examinable: boolean): string {
  if (cell.is_na) return 'N/A';
  if (!examinable) return cell.letter ?? '—';
  return cell.quarterly != null ? String(cell.quarterly) : '—';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <div className="w-36 text-muted-foreground">{label}:</div>
      <div className="flex-1 font-medium">{value}</div>
    </div>
  );
}
