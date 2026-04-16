'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { StudentCompleteness } from '@/lib/p-files/queries';
import type { DocumentStatus } from '@/lib/p-files/document-config';

type StatusFilter = 'all' | 'complete' | 'missing' | 'expired' | 'rejected' | 'uploaded';

function StatusDot({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'valid':
      return <span className="inline-block size-2.5 rounded-full bg-brand-mint" title="Valid" />;
    case 'uploaded':
      return <span className="inline-block size-2.5 rounded-full bg-primary" title="Uploaded" />;
    case 'expired':
      return <span className="inline-block size-2.5 rounded-full bg-brand-amber" title="Expired" />;
    case 'rejected':
      return <span className="inline-block size-2.5 rounded-full bg-destructive" title="Rejected" />;
    case 'missing':
      return <span className="inline-block size-2.5 rounded-full border border-border bg-muted" title="Missing" />;
    case 'na':
      return <span className="inline-block size-2.5 rounded-full bg-muted" title="N/A" />;
  }
}

function completenessPercent(s: StudentCompleteness): number {
  return s.total > 0 ? Math.round((s.complete / s.total) * 100) : 0;
}

export function CompletenessTable({ students }: { students: StudentCompleteness[] }) {
  const [search, setSearch] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('all');
  const [sectionFilter, setSectionFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(25);

  const levels = React.useMemo(
    () => [...new Set(students.map((s) => s.level).filter((l): l is string => !!l))].sort(),
    [students],
  );

  const sections = React.useMemo(() => {
    const base = levelFilter === 'all' ? students : students.filter((s) => s.level === levelFilter);
    return [...new Set(base.map((s) => s.section).filter((s): s is string => !!s))].sort();
  }, [students, levelFilter]);

  const filtered = React.useMemo(() => {
    return students.filter((s) => {
      if (levelFilter !== 'all' && s.level !== levelFilter) return false;
      if (sectionFilter !== 'all' && s.section !== sectionFilter) return false;
      if (search) {
        const needle = search.toLowerCase();
        const haystack = `${s.fullName} ${s.studentNumber ?? ''} ${s.enroleeNumber}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      switch (statusFilter) {
        case 'complete':
          if (s.complete !== s.total) return false;
          break;
        case 'missing':
          if (s.missing === 0) return false;
          break;
        case 'expired':
          if (s.expired === 0) return false;
          break;
        case 'rejected':
          if (s.rejected === 0) return false;
          break;
        case 'uploaded':
          if (s.uploaded === 0) return false;
          break;
      }
      return true;
    });
  }, [students, search, levelFilter, sectionFilter, statusFilter]);

  // Reset to page 0 when filters change
  React.useEffect(() => {
    setPageIndex(0);
  }, [search, levelFilter, sectionFilter, statusFilter]);

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const paged = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  const hasFilter =
    search.length > 0 || levelFilter !== 'all' || sectionFilter !== 'all' || statusFilter !== 'all';

  const slotHeaders = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of students) {
      for (const slot of s.slots) {
        if (!seen.has(slot.key)) seen.set(slot.key, slot.label);
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [students]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Document Completeness</CardTitle>
        <CardDescription>Per-student breakdown. Click a row to view details.</CardDescription>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto sm:min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or number…"
              className="pl-8"
            />
          </div>

          <Select
            value={levelFilter}
            onValueChange={(v) => {
              setLevelFilter(v);
              setSectionFilter('all');
            }}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="missing">Has missing</SelectItem>
              <SelectItem value="expired">Has expired</SelectItem>
              <SelectItem value="rejected">Has rejected</SelectItem>
              <SelectItem value="uploaded">Has pending</SelectItem>
            </SelectContent>
          </Select>

          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setLevelFilter('all');
                setSectionFilter('all');
                setStatusFilter('all');
              }}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}

          <div className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {filtered.length} of {students.length}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 bg-muted/40 px-4">Student</TableHead>
                <TableHead className="whitespace-nowrap px-2">Level</TableHead>
                <TableHead className="whitespace-nowrap px-2">Section</TableHead>
                {slotHeaders.map((h) => (
                  <TableHead key={h.key} className="px-1 text-center" title={h.label}>
                    <span className="inline-block max-w-[60px] truncate text-[10px]">
                      {h.label
                        .replace('Mother ', 'M/')
                        .replace('Father ', 'F/')
                        .replace('Guardian ', 'G/')
                        .replace('Passport', 'PP')
                        .replace('Student ', 'S/')}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="px-2 text-center">%</TableHead>
                <TableHead className="px-2 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={slotHeaders.length + 5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No students match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((s) => {
                  const pct = completenessPercent(s);
                  const slotMap = new Map(s.slots.map((sl) => [sl.key, sl.status]));
                  return (
                    <TableRow key={s.enroleeNumber}>
                      <TableCell className="sticky left-0 bg-background px-4">
                        <div className="text-sm font-medium">{s.fullName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {s.studentNumber ?? s.enroleeNumber}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-xs text-muted-foreground">
                        {s.level ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-2 text-xs text-muted-foreground">
                        {s.section ?? '—'}
                      </TableCell>
                      {slotHeaders.map((h) => {
                        const status = slotMap.get(h.key);
                        return (
                          <TableCell key={h.key} className="px-1 text-center">
                            {status ? (
                              <StatusDot status={status} />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-2 text-center">
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] tabular-nums ${
                            pct === 100
                              ? 'border-brand-mint bg-brand-mint/20 text-ink'
                              : pct >= 70
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : pct >= 40
                                  ? 'border-brand-amber/40 bg-brand-amber/10 text-brand-amber'
                                  : 'border-destructive/30 bg-destructive/10 text-destructive'
                          }`}
                        >
                          {pct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 text-right">
                        <Link
                          href={`/p-files/${s.enroleeNumber}`}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          View
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Pagination */}
      <div className="flex flex-col-reverse items-start gap-3 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'student' : 'students'}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Rows per page
            </span>
            <Select
              value={`${pageSize}`}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={`${n}`}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex(0)}
              disabled={pageIndex === 0}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPageIndex(pageCount - 1)}
              disabled={pageIndex >= pageCount - 1}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
