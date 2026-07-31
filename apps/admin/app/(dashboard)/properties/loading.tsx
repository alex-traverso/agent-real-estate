import { PageHeader } from "@/components/shell/page-header";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function PropertiesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Catálogo" title="Propiedades" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28" />
        ))}
      </div>
      <TableSkeleton columns={8} rows={8} />
    </div>
  );
}
