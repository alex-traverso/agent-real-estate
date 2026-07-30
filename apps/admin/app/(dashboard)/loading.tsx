import { PageHeader } from "@/components/shell/page-header";
import { StatTilesSkeleton } from "@/components/skeletons/stat-tiles-skeleton";
import { ChartPanelSkeleton } from "@/components/skeletons/chart-panel-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardHomeLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Agent Real Estate" title="Inicio" />
      <StatTilesSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanelSkeleton />
        <ChartPanelSkeleton />
      </div>
      <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <Skeleton className="h-3 w-32" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
