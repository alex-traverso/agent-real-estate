import Link from "next/link";
import type { Enums, Tables } from "types";
import { apiGet } from "@/lib/api/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shell/page-header";
import { LeadsTabs } from "@/components/leads/leads-tabs";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { DataPagination } from "@/components/ui/data-pagination";
import { OPERATION_TYPE_LABELS } from "@/lib/property-labels";
import { LEAD_STATUS_ORDER } from "@/lib/lead-labels";
import { EMPTY_VALUE, formatBudget, formatDate, formatPhone } from "@/lib/format";
import type { AgencyStats } from "@/app/(dashboard)/stats.types";

type LeadStatus = Enums<"lead_status">;

const PAGE_SIZE = 12;

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

  const [{ data: leads, total }, stats] = await Promise.all([
    apiGet<{ data: Tables<"leads">[]; total: number }>(
      `/leads?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ""}`,
    ),
    apiGet<AgencyStats>("/stats"),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Prospectos" title="Leads" />

      <LeadsTabs activeStatus={status} stats={stats.leads} />

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
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  No hay leads todavía.
                </TableCell>
              </TableRow>
            )}
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.name || "Sin nombre"}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="type-data">{formatPhone(lead.phone)}</span>
                </TableCell>
                <TableCell>
                  {lead.operation_type
                    ? OPERATION_TYPE_LABELS[lead.operation_type]
                    : EMPTY_VALUE}
                </TableCell>
                <TableCell>{lead.preferred_zone || EMPTY_VALUE}</TableCell>
                <TableCell>
                  <span className="type-data">
                    {formatBudget(lead.budget_min, lead.budget_max, lead.currency)}
                  </span>
                </TableCell>
                <TableCell>
                  <LeadStatusMenu leadId={lead.id} initialStatus={lead.status ?? "new"} />
                </TableCell>
                <TableCell>
                  <span className="type-data">{formatDate(lead.created_at)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DataPagination
        page={page}
        totalPages={totalPages}
        searchParams={{ status }}
        basePath="/leads"
      />
    </div>
  );
}
