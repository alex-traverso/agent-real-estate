import Link from "next/link";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExcelUploadForm } from "./excel-upload-form";

const PAGE_SIZE = 20;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { data: properties, total } = await apiGet<{
    data: Tables<"properties">[];
    total: number;
  }>(`/properties?page=${page}&limit=${PAGE_SIZE}`);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-medium">Propiedades</h1>
        <Button asChild>
          <Link href="/properties/new">Nueva propiedad</Link>
        </Button>
      </div>

      <ExcelUploadForm />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Operación</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay propiedades cargadas todavía.
                </TableCell>
              </TableRow>
            )}
            {properties.map((property) => (
              <TableRow key={property.id}>
                <TableCell>
                  <Link
                    href={`/properties/${property.id}`}
                    className="hover:underline"
                  >
                    {property.title}
                  </Link>
                </TableCell>
                <TableCell>{property.zone}</TableCell>
                <TableCell>{property.type}</TableCell>
                <TableCell>{property.operation}</TableCell>
                <TableCell>
                  {property.currency} {property.price}
                </TableCell>
                <TableCell>
                  <Badge variant={property.available ? "default" : "secondary"}>
                    {property.available ? "Disponible" : "No disponible"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/properties?page=${page - 1}`}>Anterior</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Anterior
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline">
              <Link href={`/properties?page=${page + 1}`}>Siguiente</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Siguiente
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
