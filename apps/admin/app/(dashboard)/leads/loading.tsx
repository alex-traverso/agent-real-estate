import { PageHeader } from "@/components/shell/page-header";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Prospectos" title="Leads" />
      <div className="flex gap-4 border-b border-border pb-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-20" />
        ))}
      </div>
      <TableSkeleton columns={7} rows={8} />
    </div>
  );
}
