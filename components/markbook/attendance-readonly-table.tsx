import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';

export type ReadOnlyRow = {
  enrolmentId: string;
  indexNumber: number;
  studentNumber: string;
  studentName: string;
  withdrawn: boolean;
  schoolDays: number | null;
  daysPresent: number | null;
  daysLate: number | null;
  daysExcused: number | null;
  daysAbsent: number | null;
  attendancePct: number | null;
};

// Read-only per-student attendance table for /markbook/sections/[id]/attendance.
// All data is written by the Attendance module (KD #47 sole-writer contract);
// this component only renders. Empty rows (no daily marks yet for this term)
// show a subdued "Unmarked" chip instead of zeros, to distinguish "nobody
// marked it" from "marked, all zero".
export function AttendanceReadOnlyTable({ rows }: { rows: ReadOnlyRow[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-14 text-right">#</TableHead>
            <TableHead>Student</TableHead>
            <TableHead className="w-[100px] text-right">School days</TableHead>
            <TableHead className="w-[90px] text-right">Present</TableHead>
            <TableHead className="w-[80px] text-right">Late</TableHead>
            <TableHead className="w-[90px] text-right">Excused</TableHead>
            <TableHead className="w-[90px] text-right">Absent</TableHead>
            <TableHead className="w-[80px] text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="font-serif text-base font-semibold text-foreground">
                    No students enrolled
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Sync from admissions or add a student to this section first.
                  </div>
                </div>
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const unmarked = r.schoolDays == null;
            return (
              <TableRow
                key={r.enrolmentId}
                className={r.withdrawn ? 'text-muted-foreground' : ''}
              >
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {r.indexNumber}
                </TableCell>
                <TableCell>
                  <div
                    className={
                      'font-medium ' +
                      (r.withdrawn
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground')
                    }
                  >
                    {r.studentName}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {r.studentNumber}
                  </div>
                </TableCell>
                {unmarked ? (
                  <TableCell colSpan={6} className="text-right">
                    <span className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/30 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Unmarked
                    </span>
                  </TableCell>
                ) : (
                  <>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmt(r.schoolDays)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmt(r.daysPresent)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmt(r.daysLate)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmt(r.daysExcused)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {fmt(r.daysAbsent)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-semibold">
                      {r.attendancePct != null ? `${r.attendancePct.toFixed(1)}%` : '—'}
                    </TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function fmt(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('en-SG');
}
