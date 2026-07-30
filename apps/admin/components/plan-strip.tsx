import { formatArea } from "@/lib/format";
import { cn } from "@/lib/utils";

type PlanStripProps = {
  covered: number | null | undefined;
  total: number | null | undefined;
  /** Hidden on dense surfaces like a table row, where the bar alone reads. */
  showLabels?: boolean;
  className?: string;
};

/**
 * The dimension bar from a floor plan: covered area drawn inside total area,
 * annotated in monospace between two end ticks.
 *
 * This is the panel's signature element. It exists because `covered_area` and
 * `total_area` are the two numbers an advisor actually compares when sizing up
 * a listing, and neither was surfaced anywhere in the product before.
 *
 * It renders nothing when either figure is missing — a listing with no areas
 * loaded gets no strip rather than an invented placeholder.
 */
export function PlanStrip({
  covered,
  total,
  showLabels = true,
  className,
}: PlanStripProps) {
  if (
    covered === null ||
    covered === undefined ||
    total === null ||
    total === undefined ||
    total <= 0
  ) {
    return null;
  }

  // Bad data (covered above total) is clamped so the bar stays inside its
  // track, but both figures are still printed — the labels expose the
  // discrepancy instead of the drawing hiding it.
  const ratio = Math.min(covered / total, 1);
  const coveredPercent = `${(ratio * 100).toFixed(2)}%`;

  return (
    <div
      className={cn("flex w-full flex-col gap-1.5", className)}
      role="img"
      aria-label={`${formatArea(covered)} cubiertos sobre ${formatArea(total)} totales`}
    >
      {showLabels && (
        <div className="type-data flex items-baseline justify-between">
          <span className="text-foreground">{formatArea(covered)}</span>
          <span className="text-muted-foreground">{formatArea(total)}</span>
        </div>
      )}

      <div className="relative h-2.5" aria-hidden="true">
        {/* Baseline: the full extent of the plot. It has to stay legible past
            the covered boundary — that remaining run is the whole point of the
            drawing, so it uses the border tone, not the fainter rule. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />

        {/* Covered run, drawn over the baseline. */}
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-primary"
          style={{ width: coveredPercent }}
        />

        {/* Dimension ticks: start, the covered boundary, and the far end. */}
        <div className="absolute left-0 top-0 h-full w-px bg-primary" />
        <div
          className="absolute top-0 h-full w-px bg-primary"
          style={{ left: coveredPercent }}
        />
        <div className="absolute right-0 top-0 h-full w-px bg-muted-foreground/60" />
      </div>

      {showLabels && (
        <div className="type-eyebrow flex items-baseline justify-between">
          <span>Cubiertos</span>
          <span>Totales</span>
        </div>
      )}
    </div>
  );
}
