"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  confirmPropertiesUpload,
  parsePropertiesExcel,
  type ConfirmUploadResult,
  type ExcelParseState,
  type PropertyRowPayload,
} from "./actions";

const initialState: ExcelParseState = {};

export function ExcelUploadForm() {
  const [state, formAction, parsePending] = useActionState(
    parsePropertiesExcel,
    initialState,
  );
  const [confirmResult, setConfirmResult] = useState<ConfirmUploadResult | null>(
    null,
  );
  const [confirmPending, startConfirm] = useTransition();

  const validPayloads: PropertyRowPayload[] =
    state.rows?.flatMap((row) => (row.payload ? [row.payload] : [])) ?? [];

  function handleConfirm() {
    startConfirm(async () => {
      const result = await confirmPropertiesUpload(validPayloads);
      setConfirmResult(result);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="file">Carga masiva por Excel</Label>
        <p className="text-xs text-muted-foreground">
          Columnas: Título, Zona, Tipo, Operación, Precio, Moneda, Descripción,
          Ambientes, Dormitorios, Baños, Superficie cubierta, Superficie total,
          Expensas, Dirección, Cochera.{" "}
          <a href="/properties/template" download className="underline">
            Descargar plantilla
          </a>
        </p>
      </div>

      <form action={formAction} className="flex items-center gap-3">
        <Input id="file" name="file" type="file" accept=".xlsx" required />
        <Button type="submit" variant="outline" disabled={parsePending}>
          {parsePending ? "Validando..." : "Validar archivo"}
        </Button>
      </form>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      {state.rows && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.payload?.title ?? "—"}</TableCell>
                    <TableCell>{row.payload?.zone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.errors.length === 0 ? "default" : "destructive"}>
                        {row.errors.length === 0 ? "Válida" : "Error"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-sm">
            {validPayloads.length} de {state.rows.length} filas listas para crear.
          </p>

          {!confirmResult && validPayloads.length > 0 && (
            <div>
              <Button onClick={handleConfirm} disabled={confirmPending}>
                {confirmPending
                  ? "Creando..."
                  : `Confirmar carga (${validPayloads.length} propiedades)`}
              </Button>
            </div>
          )}

          {confirmResult && (
            <p className="text-sm">
              {confirmResult.created} de {confirmResult.total} propiedades creadas.
              {confirmResult.failures.length > 0 &&
                ` Errores: ${confirmResult.failures.join("; ")}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
