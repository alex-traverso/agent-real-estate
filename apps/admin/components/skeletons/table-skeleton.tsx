import { Skeleton } from "@/components/ui/skeleton";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

/** Approximates a header row plus data rows — shared by every list page. */
export function TableSkeleton({ rows = 6, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, column) => (
              <Skeleton key={column} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
