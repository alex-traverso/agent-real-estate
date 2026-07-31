"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import type { Tables } from "types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EMPTY_VALUE, formatArea, formatDate, formatNumber, formatPrice } from "@/lib/format";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/property-labels";

type Property = Tables<"properties">;

// Mirrors ADMIN_PROPERTY_SORT_COLUMNS (apps/api) — the only columns the
// backend accepts in `sort`, so only these headers get a click handler.
const SORTABLE_COLUMNS = new Set(["title", "price", "created_at"]);

type PropertiesTableProps = {
  properties: Property[];
};

function SortIcon({ direction }: { direction: "asc" | "desc" | false }) {
  if (direction === "asc") return <ArrowUp className="size-3.5" />;
  if (direction === "desc") return <ArrowDown className="size-3.5" />;
  return <ArrowUpDown className="size-3.5 text-muted-foreground/60" />;
}

/**
 * The properties catalog table: manual (server-driven) sort and pagination —
 * `useReactTable` only owns column visibility and rendering, never the data
 * itself. Sorting and pagination state both live in the URL, read by the
 * parent Server Component to build the `/properties` API request.
 */
export function PropertiesTable({ properties }: PropertiesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort = searchParams.get("sort") ?? "created_at";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  const sorting: SortingState = [{ id: sort, desc: order === "desc" }];

  // Fecha starts hidden — the other 8 columns are the "reasonable default"
  // view; Ambientes and Fecha are the dense columns callable out as
  // hideable, and hiding Fecha by default is what keeps the initial table
  // at 8 visible columns instead of 9.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    created_at: false,
  });

  function handleSort(columnId: string) {
    if (!SORTABLE_COLUMNS.has(columnId)) return;
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder = sort === columnId && order === "desc" ? "asc" : "desc";
    params.set("sort", columnId);
    params.set("order", nextOrder);
    router.push(`${pathname}?${params.toString()}`);
  }

  const columns = useMemo<ColumnDef<Property>[]>(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Título",
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            href={`/properties/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: "zone",
        accessorKey: "zone",
        header: "Zona",
      },
      {
        id: "type",
        header: "Tipo",
        cell: ({ row }) => PROPERTY_TYPE_LABELS[row.original.type],
      },
      {
        id: "operation",
        header: "Operación",
        cell: ({ row }) => OPERATION_TYPE_LABELS[row.original.operation],
      },
      {
        id: "area",
        header: "Superficie",
        cell: ({ row }) => {
          const { covered_area, total_area } = row.original;
          if (covered_area == null && total_area == null) {
            return <span className="type-data text-muted-foreground">{EMPTY_VALUE}</span>;
          }
          return (
            <span className="type-data">
              {formatArea(covered_area)} / {formatArea(total_area)}
            </span>
          );
        },
      },
      {
        id: "rooms",
        header: "Ambientes",
        cell: ({ row }) => (
          <span className="type-data">{formatNumber(row.original.rooms)}</span>
        ),
      },
      {
        id: "price",
        accessorKey: "price",
        header: "Precio",
        enableHiding: false,
        cell: ({ row }) => (
          <span className="type-data">
            {formatPrice(row.original.price, row.original.currency)}
          </span>
        ),
      },
      {
        id: "available",
        header: "Estado",
        enableHiding: false,
        cell: ({ row }) => (
          <Badge variant={row.original.available ? "default" : "secondary"}>
            {row.original.available ? "Disponible" : "No disponible"}
          </Badge>
        ),
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Fecha",
        cell: ({ row }) => (
          <span className="type-data">{formatDate(row.original.created_at)}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: properties,
    columns,
    state: { sorting, columnVisibility },
    manualSorting: true,
    manualPagination: true,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columnas
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = SORTABLE_COLUMNS.has(header.column.id);
                  return (
                    <TableHead key={header.id}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(header.column.id)}
                          className="flex items-center gap-1 text-foreground hover:text-foreground/80"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <SortIcon
                            direction={sort === header.column.id ? order : false}
                          />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
