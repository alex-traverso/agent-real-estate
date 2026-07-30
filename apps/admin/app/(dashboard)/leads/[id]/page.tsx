import Link from "next/link";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { OPERATION_TYPE_LABELS } from "@/lib/property-labels";
import { formatBudget } from "@/lib/format";
import { LeadStatusControl } from "../lead-status-control";

type Lead = Tables<"leads">;
type Conversation = Tables<"conversations">;

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  whatsapp_message_id?: string;
};

function LeadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lead, conversation] = await Promise.all([
    apiGet<Lead>(`/leads/${id}`),
    apiGet<Conversation | null>(`/leads/${id}/conversation`),
  ]);

  const messages = (conversation?.messages as StoredMessage[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-medium">{lead.name || "Sin nombre"}</h1>
        <LeadStatusControl leadId={lead.id} initialStatus={lead.status ?? "new"} />
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <LeadField label="Teléfono" value={lead.phone} />
            <LeadField
              label="Operación"
              value={lead.operation_type ? OPERATION_TYPE_LABELS[lead.operation_type] : "—"}
            />
            <LeadField label="Zona" value={lead.preferred_zone || "—"} />
            <LeadField
              label="Presupuesto"
              value={formatBudget(lead.budget_min, lead.budget_max, lead.currency)}
            />
            <LeadField label="Ambientes" value={lead.rooms ? String(lead.rooms) : "—"} />
            <LeadField
              label="Fecha"
              value={
                lead.created_at
                  ? new Date(lead.created_at).toLocaleString("es-AR")
                  : "—"
              }
            />
            {lead.property_id && (
              <div>
                <dt className="text-xs text-muted-foreground">Propiedad vinculada</dt>
                <dd className="text-sm">
                  <Link
                    href={`/properties/${lead.property_id}`}
                    className="hover:underline"
                  >
                    Ver propiedad
                  </Link>
                </dd>
              </div>
            )}
            {lead.notes && (
              <div className="sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notas</dt>
                <dd className="text-sm">{lead.notes}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Conversación de WhatsApp</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este lead no proviene de una conversación de WhatsApp.
          </p>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "flex flex-col items-end gap-1"
                    : "flex flex-col items-start gap-1"
                }
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[75%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[75%] rounded-xl bg-muted px-3 py-2 text-sm"
                  }
                >
                  {message.content}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.timestamp).toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
