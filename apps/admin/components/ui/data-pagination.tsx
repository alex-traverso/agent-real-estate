import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type DataPaginationProps = {
  page: number;
  totalPages: number;
  /** Every filter param except `page`, preserved on every page link. */
  searchParams: Record<string, string | undefined>;
  /** The list route this pagination belongs to, e.g. `/properties`, `/leads`. */
  basePath: string;
};

const SIBLING_COUNT = 1;

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page") params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

/** Page numbers to render, condensed with ellipses once there are many pages. */
function buildPageItems(page: number, totalPages: number): (number | "ellipsis")[] {
  const kept = new Set<number>([1, totalPages]);
  for (let i = page - SIBLING_COUNT; i <= page + SIBLING_COUNT; i += 1) {
    if (i >= 1 && i <= totalPages) kept.add(i);
  }
  const sorted = Array.from(kept).sort((a, b) => a - b);

  const items: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) items.push("ellipsis");
    items.push(value);
    previous = value;
  }
  return items;
}

/**
 * Page-number pagination for a server-driven list, built on the shadcn
 * `Pagination` primitives. A Server Component: the current filters are
 * already known to the caller (they come from `searchParams`), so building
 * hrefs needs no client-side URL state of its own. Shared by every list page
 * (properties, leads) via the `basePath` prop.
 */
export function DataPagination({
  page,
  totalPages,
  searchParams,
  basePath,
}: DataPaginationProps) {
  if (totalPages <= 1) return null;

  const pageItems = buildPageItems(page, totalPages);

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            text="Anterior"
            href={buildHref(basePath, searchParams, Math.max(1, page - 1))}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
        {pageItems.map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                href={buildHref(basePath, searchParams, item)}
                isActive={item === page}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationNext
            text="Siguiente"
            href={buildHref(basePath, searchParams, Math.min(totalPages, page + 1))}
            aria-disabled={page === totalPages}
            className={
              page === totalPages ? "pointer-events-none opacity-50" : undefined
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
