import type { ReactNode } from "react";

interface ChartPanelProps {
  title: string;
  children: ReactNode;
}

/**
 * Reusable card wrapper for a chart on the dashboard home, matching
 * `ChartPanelSkeleton`'s styling so there's no layout shift once the chart
 * mounts.
 */
export function ChartPanel({ title, children }: ChartPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <span className="type-eyebrow">{title}</span>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}
