import { Skeleton } from "@/components/ui/skeleton";

/** A chart card on the dashboard home (PR D). */
export function ChartPanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
