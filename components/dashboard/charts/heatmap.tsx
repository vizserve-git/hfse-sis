import { cn } from '@/lib/utils';

export type HeatmapCell = {
  /** 0–1 intensity (clamped). Negative values color destructive. */
  value: number | null;
  /** Hover label. */
  label?: string;
};

export type HeatmapRow = {
  label: string;
  cells: HeatmapCell[];
};

export type HeatmapProps = {
  columns: string[];
  rows: HeatmapRow[];
  /** "good" = higher is better → mint; "bad" = higher is worse → destructive tint. */
  polarity?: 'good' | 'bad';
  emptyLabel?: string;
};

function intensityClass(value: number | null, polarity: 'good' | 'bad'): string {
  if (value === null) return 'bg-muted';
  const clamped = Math.min(1, Math.max(0, value));
  if (clamped === 0) return 'bg-muted';
  const mintSteps = ['bg-brand-mint/20', 'bg-brand-mint/40', 'bg-brand-mint/60', 'bg-brand-mint/80'];
  const destSteps = ['bg-destructive/10', 'bg-destructive/25', 'bg-destructive/40', 'bg-destructive/60'];
  const steps = polarity === 'good' ? mintSteps : destSteps;
  const idx = Math.min(steps.length - 1, Math.floor(clamped * steps.length));
  return steps[idx];
}

export function Heatmap({
  columns,
  rows,
  polarity = 'good',
  emptyLabel = 'No data',
}: HeatmapProps) {
  if (!rows.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-xs text-ink-4">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background pr-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-4" />
            {columns.map((c) => (
              <th
                key={c}
                className="px-1 pb-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-4"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className="sticky left-0 bg-background pr-2 text-left font-mono text-[11px] text-foreground"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  title={cell.label}
                  className={cn(
                    'h-6 w-6 rounded text-center align-middle font-mono text-[10px] leading-none tabular-nums text-foreground/80',
                    intensityClass(cell.value, polarity),
                  )}
                >
                  {cell.value === null
                    ? ''
                    : Math.round(Math.min(1, Math.max(0, cell.value)) * 100)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
