import Link from 'next/link';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  InfoIcon,
  Sparkles,
  TrendingDownIcon,
  type LucideIcon,
} from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Insight, InsightSeverity } from '@/lib/dashboard/insights';

/**
 * InsightsPanel — narrative observations panel that conforms to the
 * `09a §8` card pattern (gradient icon tile in `CardAction`, serif title)
 * and the `§9.3` status-badge color recipes (mint / destructive / accent).
 *
 * Rendered as a single bordered Card with a divided list of insight rows
 * inside — matches the "Top missing documents" / "Recent activity feed"
 * shape already used across the dashboards.
 */

const SEVERITY_ICON: Record<InsightSeverity, LucideIcon> = {
  good: CheckCircle2Icon,
  warn: AlertTriangleIcon,
  bad: TrendingDownIcon,
  info: InfoIcon,
};

const SEVERITY_TILE: Record<InsightSeverity, string> = {
  good: 'border-brand-mint bg-brand-mint/30 text-ink',
  warn: 'border-brand-amber bg-brand-amber-light text-ink',
  bad: 'border-destructive/40 bg-destructive/10 text-destructive',
  info: 'border-brand-indigo-soft bg-accent text-brand-indigo-deep',
};

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  good: 'Good',
  warn: 'Watch',
  bad: 'Alert',
  info: 'Info',
};

export function InsightsPanel({
  insights,
  title = 'Insights',
}: {
  insights: Insight[];
  title?: string;
}) {
  if (insights.length === 0) return null;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Narrative · {insights.length} observation{insights.length === 1 ? '' : 's'}
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {title}
        </CardTitle>
        <CardAction>
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-indigo to-brand-navy text-white shadow-brand-tile">
            <Sparkles className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {insights.map((item, i) => (
            <InsightRow key={`${i}-${item.title}`} insight={item} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const Icon = SEVERITY_ICON[insight.severity];
  const inner = (
    <div className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-accent/40">
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg border',
          SEVERITY_TILE[insight.severity],
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline gap-2">
          <p className="truncate font-serif text-[15px] font-semibold leading-tight text-foreground">
            {insight.title}
          </p>
          <span
            className={cn(
              'shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider',
              SEVERITY_TILE[insight.severity],
            )}
          >
            {SEVERITY_LABEL[insight.severity]}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
        {insight.cta && (
          <p className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-brand-indigo-deep">
            {insight.cta.label}
            <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
          </p>
        )}
      </div>
    </div>
  );

  if (insight.cta?.href) {
    return (
      <li>
        <Link href={insight.cta.href} className="block">
          {inner}
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}
