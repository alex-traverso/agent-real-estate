import Link from "next/link";
import { Building } from "lucide-react";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar } from "@/components/properties/filter-bar";
import { PropertiesTable } from "@/components/properties/properties-table";
import { DataPagination } from "@/components/ui/data-pagination";
import { ExcelUploadDialog } from "@/components/properties/excel-upload-dialog";

const PAGE_SIZE = 12;

const SORT_COLUMNS = ["created_at", "price", "title"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return (SORT_COLUMNS as readonly string[]).includes(value ?? "");
}

function isSortOrder(value: string | undefined): value is "asc" | "desc" {
  return value === "asc" || value === "desc";
}

function isAvailableFilter(value: string | undefined): value is "true" | "false" {
  return value === "true" || value === "false";
}

type PropertiesSearchParams = {
  page?: string;
  search?: string;
  zone?: string;
  operation?: string;
  type?: string;
  available?: string;
  sort?: string;
  order?: string;
};

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<PropertiesSearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const hasActiveFilters = Boolean(
    params.search ||
      params.zone ||
      params.operation ||
      params.type ||
      isAvailableFilter(params.available),
  );

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("limit", String(PAGE_SIZE));
  if (params.search) query.set("search", params.search);
  if (params.zone) query.set("zone", params.zone);
  if (params.operation) query.set("operation", params.operation);
  if (params.type) query.set("type", params.type);
  if (isAvailableFilter(params.available)) query.set("available", params.available);
  if (isSortColumn(params.sort)) query.set("sort", params.sort);
  if (isSortOrder(params.order)) query.set("order", params.order);

  const [{ data: properties, total }, zones] = await Promise.all([
    apiGet<{ data: Tables<"properties">[]; total: number }>(
      `/properties?${query.toString()}`,
    ),
    apiGet<string[]>("/properties/zones"),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Totally empty catalog, no filters in play: the PR D dashboard-home empty
  // state, not the "filters matched nothing" one below.
  if (total === 0 && !hasActiveFilters) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Catálogo" title="Propiedades" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl bg-card py-24 text-center ring-1 ring-foreground/10">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Building className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="type-subtitle text-foreground">
              Cargá tu primera propiedad
            </h2>
            <p className="text-sm text-muted-foreground">
              Todavía no hay propiedades cargadas — sumá la primera para
              empezar a armar el catálogo.
            </p>
          </div>
          <Button asChild>
            <Link href="/properties/new">Cargar propiedad</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Propiedades"
        actions={
          <>
            <ExcelUploadDialog />
            <Button asChild>
              <Link href="/properties/new">Nueva propiedad</Link>
            </Button>
          </>
        }
      />

      <FilterBar zones={zones} />

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ninguna propiedad coincide con los filtros aplicados.
          </p>
          <Link
            href="/properties"
            className="text-sm underline underline-offset-4 hover:text-foreground"
          >
            Limpiar filtros
          </Link>
        </div>
      ) : (
        <>
          <PropertiesTable properties={properties} />
          <DataPagination
            page={page}
            totalPages={totalPages}
            searchParams={params}
            basePath="/properties"
          />
        </>
      )}
    </div>
  );
}
