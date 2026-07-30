import { PageHeader } from "@/components/shell/page-header";
import { DetailSkeleton } from "@/components/skeletons/detail-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function PropertyDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Propiedades" title="Detalle" />
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <DetailSkeleton fields={9} />
      </div>
      <Skeleton className="h-10 w-40" />
    </div>
  );
}
