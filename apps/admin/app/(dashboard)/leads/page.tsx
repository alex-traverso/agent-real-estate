import Link from "next/link";
import type { Enums, Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OPERATION_TYPE_LABELS } from "@/lib/property-labels";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER, formatLeadBudget } from "@/lib/lead-labels";
import { LeadStatusControl } from "./lead-status-control";

type LeadStatus = Enums<"lead_status">;

const PAGE_SIZE = 20;

function isLeadStatus(value: string | undefined): value is LeadStatus {
  return LEAD_STATUS_ORDER.includes(value as LeadStatus);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageParam, status: statusParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const status = isLeadStatus(statusParam) ? statusParam : undefined;

  const { data: leads, total } = await apiGet<{
    data: Tables<"leads">[];
    total: number;
  }>(`/leads?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ""}`);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs: { label: string; status?: LeadStatus }[] = [
    { label: "Todos" },
    ...LEAD_STATUS_ORDER.map((value) => ({ label: LEAD_STATUS_LABELS[value], status: value })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Leads</h1>

      <div className="flex items-center gap-4 border-b">
        {tabs.map((tab) => {
          const active = tab.status === status;
          return (
            <Link
              key={tab.label}
              href={tab.status ? `/leads?status=${tab.status}` : "/leads"}
              className={
                active
                  ? "border-b-2 border-foreground pb-2 text-sm font-medium text-foreground"
                  : "border-b-2 border-transparent pb-2 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Operación</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Presupuesto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay leads todavía.
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="hover:underline">
                    {lead.name || "Sin nombre"}
                  </Link>
                </TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell>
                  {lead.operation_type ? OPERATION_TYPE_LABELS[lead.operation_type] : "—"}
                </TableCell>
                <TableCell>{lead.preferred_zone || "—"}</TableCell>
                <TableCell>
                  {formatLeadBudget(lead.budget_min, lead.budget_max, lead.currency)}
                </TableCell>
                <TableCell>
                  <LeadStatusControl leadId={lead.id} initialStatus={lead.status ?? "new"} />
                </TableCell>
                <TableCell>
                  {lead.created_at
                    ? new Date(lead.created_at).toLocaleDateString("es-AR")
                    : "—"}
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
              <Link href={`/leads?page=${page - 1}${status ? `&status=${status}` : ""}`}>
                Anterior
              </Link>
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
              <Link href={`/leads?page=${page + 1}${status ? `&status=${status}` : ""}`}>
                Siguiente
              </Link>
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
