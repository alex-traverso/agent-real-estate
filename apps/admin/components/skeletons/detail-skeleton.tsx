import { Skeleton } from "@/components/ui/skeleton";

/** A grid of label/value fields — property and lead detail pages. */
export function DetailSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}
