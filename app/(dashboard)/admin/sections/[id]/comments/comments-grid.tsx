"use client";

import { CheckCircle2, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Row = {
  enrolment_id: string;
  index_number: number;
  withdrawn: boolean;
  student_id: string;
  student_number: string;
  student_name: string;
  comment: string | null;
};

type Status = "all" | "pending" | "written" | "withdrawn";

function rowStatus(r: Row): Exclude<Status, "all"> {
  if (r.withdrawn) return "withdrawn";
  if (r.comment && r.comment.trim().length > 0) return "written";
  return "pending";
}

function pickInitialSelection(rows: Row[]): string | null {
  const firstPending = rows.find((r) => rowStatus(r) === "pending");
  if (firstPending) return firstPending.student_id;
  const firstActive = rows.find((r) => !r.withdrawn);
  if (firstActive) return firstActive.student_id;
  return rows[0]?.student_id ?? null;
}

export function CommentsGrid({
  sectionId,
  termId,
  rows: initialRows,
}: {
  sectionId: string;
  termId: string;
  rows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [selectedId, setSelectedId] = useState<string | null>(() => pickInitialSelection(initialRows));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selected = useMemo(() => rows.find((r) => r.student_id === selectedId) ?? null, [rows, selectedId]);

  // Reset the draft whenever the selected student changes (or their stored comment changes).
  useEffect(() => {
    setDraft(selected?.comment ?? "");
  }, [selected?.student_id, selected?.comment]);

  const counts = useMemo(() => {
    let pending = 0;
    let written = 0;
    let withdrawn = 0;
    for (const r of rows) {
      const s = rowStatus(r);
      if (s === "pending") pending += 1;
      else if (s === "written") written += 1;
      else withdrawn += 1;
    }
    return { all: rows.length, pending, written, withdrawn };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && rowStatus(r) !== status) return false;
      if (!needle) return true;
      const hay = `${r.index_number} ${r.student_name} ${r.student_number}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, query, status]);

  async function save(row: Row, nextComment: string): Promise<boolean> {
    if ((row.comment ?? "") === nextComment) return true;
    setSavingId(row.student_id);
    try {
      const res = await fetch(`/api/sections/${sectionId}/comments`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          term_id: termId,
          student_id: row.student_id,
          comment: nextComment || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "save failed");
      setRows((current) =>
        current.map((r) => (r.student_id === row.student_id ? { ...r, comment: nextComment || null } : r)),
      );
      setSavedId(row.student_id);
      setTimeout(() => setSavedId((id) => (id === row.student_id ? null : id)), 1500);
      toast.success(`Saved comment for ${row.student_name}`);
      return true;
    } catch (e) {
      toast.error(
        `Failed to save comment for #${row.index_number} ${row.student_name}: ${
          e instanceof Error ? e.message : "error"
        }`,
      );
      return false;
    } finally {
      setSavingId((s) => (s === row.student_id ? null : s));
    }
  }

  function findNextPending(afterId: string): Row | null {
    const idx = filtered.findIndex((r) => r.student_id === afterId);
    for (let i = idx + 1; i < filtered.length; i += 1) {
      if (rowStatus(filtered[i]) === "pending") return filtered[i];
    }
    return null;
  }

  const nextPending = selected ? findNextPending(selected.student_id) : null;

  async function saveCurrent() {
    if (!selected || selected.withdrawn) return;
    await save(selected, draft.trim());
  }

  async function saveAndNext() {
    if (!selected || selected.withdrawn) return;
    const ok = await save(selected, draft.trim());
    if (!ok) return;
    if (nextPending) {
      setSelectedId(nextPending.student_id);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function handleListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((r) => r.student_id === selectedId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = filtered[Math.min(filtered.length - 1, idx < 0 ? 0 : idx + 1)];
      if (next) setSelectedId(next.student_id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = filtered[Math.max(0, idx < 0 ? 0 : idx - 1)];
      if (prev) setSelectedId(prev.student_id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedId(filtered[0].student_id);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedId(filtered[filtered.length - 1].student_id);
    }
  }

  function handleEditorKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (nextPending) void saveAndNext();
      else void saveCurrent();
    }
  }

  if (rows.length === 0) {
    return (
      <Card className="items-center py-12 text-center">
        <CardContent className="flex flex-col items-center gap-3">
          <div className="font-serif text-lg font-semibold text-foreground">No students enrolled</div>
          <div className="text-sm text-muted-foreground">
            Sync from admissions or add a student to this section first.
          </div>
        </CardContent>
      </Card>
    );
  }

  const saving = selected ? savingId === selected.student_id : false;
  const justSaved = selected ? savedId === selected.student_id : false;
  const selectedStatus = selected ? rowStatus(selected) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
      {/* Left pane — student list */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, number…"
              className="h-9 pl-8"
            />
          </div>
          <Tabs value={status} onValueChange={(v) => setStatus(v as Status)} className="mt-3">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                All
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex-1">
                Pending
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.pending}</span>
              </TabsTrigger>
              <TabsTrigger value="written" className="flex-1">
                Written
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.written}</span>
              </TabsTrigger>
              <TabsTrigger value="withdrawn" className="flex-1">
                W/D
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">{counts.withdrawn}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div
          className="max-h-[70vh] overflow-y-auto"
          tabIndex={0}
          onKeyDown={handleListKey}
          role="listbox"
          aria-label="Students">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No students match the current filter.</div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const s = rowStatus(r);
                const isSelected = r.student_id === selectedId;
                return (
                  <li key={r.enrolment_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.student_id)}
                      aria-current={isSelected ? "true" : undefined}
                      className={
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors " +
                        (isSelected
                          ? "bg-accent border-l-2 border-primary"
                          : "border-l-2 border-transparent hover:bg-muted/50")
                      }>
                      <StatusDot status={s} />
                      <span className="w-8 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        #{r.index_number}
                      </span>
                      <span
                        className={
                          "flex-1 truncate text-sm " +
                          (r.withdrawn ? "text-muted-foreground line-through" : "text-foreground")
                        }>
                        {r.student_name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* Right pane — editor */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                <span className="tabular-nums">#{selected.index_number}</span>
                <span className="text-hairline-strong">·</span>
                <span className="tabular-nums">{selected.student_number}</span>
              </CardDescription>
              <div className="flex items-start justify-between gap-3">
                <CardTitle
                  className={
                    "font-serif text-2xl font-semibold leading-snug tracking-tight " +
                    (selected.withdrawn ? "line-through text-muted-foreground" : "text-foreground")
                  }>
                  {selected.student_name}
                </CardTitle>
                {selectedStatus === "withdrawn" ? (
                  <Badge
                    variant="outline"
                    className="h-6 border-destructive/40 bg-destructive/10 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
                    Withdrawn
                  </Badge>
                ) : selectedStatus === "written" ? (
                  <Badge
                    variant="outline"
                    className="h-6 border-brand-mint bg-brand-mint/30 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink">
                    <CheckCircle2 className="h-3 w-3" />
                    Written
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="h-6 border-brand-indigo-soft/60 bg-accent px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-indigo-deep">
                    Pending
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                ref={textareaRef}
                value={draft}
                disabled={selected.withdrawn}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (!selected.withdrawn) void save(selected, draft.trim());
                }}
                onKeyDown={handleEditorKey}
                rows={12}
                placeholder="Write adviser's comment for this term…"
                className="min-h-[280px] resize-y disabled:cursor-not-allowed disabled:bg-muted/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-h-5 text-xs text-muted-foreground">
                  {saving && (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </span>
                  )}
                  {justSaved && !saving && (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <CheckCircle2 className="h-3 w-3" />
                      Saved
                    </span>
                  )}
                  {!saving && !justSaved && (
                    <span>
                      Auto-saves on blur. <kbd className="font-mono">Ctrl</kbd>+<kbd className="font-mono">Enter</kbd>{" "}
                      to save & next pending.
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void saveCurrent()}
                    disabled={selected.withdrawn || saving}>
                    Save comment
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveAndNext()}
                    disabled={selected.withdrawn || saving || !nextPending}>
                    Save & next pending
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="items-center py-16 text-center">
            <CardContent className="text-sm text-muted-foreground">
              Select a student from the list to write a comment.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Exclude<Status, "all"> }) {
  const cls =
    status === "written" ? "bg-brand-mint" : status === "withdrawn" ? "bg-destructive/60" : "bg-brand-indigo-soft";
  return <span className={"inline-block size-2 shrink-0 rounded-full " + cls} aria-hidden />;
}
