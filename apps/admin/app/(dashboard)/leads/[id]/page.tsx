import Link from "next/link";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/shell/page-header";
import { LeadStatusMenu } from "@/components/leads/lead-status-menu";
import { OPERATION_TYPE_LABELS } from "@/lib/property-labels";
import {
  EMPTY_VALUE,
  formatBudget,
  formatDate,
  formatDayHeading,
  formatNumber,
  formatPhone,
  formatPrice,
  formatTime,
  getLocalDateKey,
} from "@/lib/format";

type Lead = Tables<"leads">;
type Property = Tables<"properties">;
type Conversation = Tables<"conversations">;

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  whatsapp_message_id?: string;
};

type DayGroup = {
  dateKey: string;
  messages: StoredMessage[];
};

/** Groups consecutive messages by calendar date, for the transcript's day separators. */
function groupMessagesByDay(messages: StoredMessage[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const message of messages) {
    const dateKey = getLocalDateKey(message.timestamp);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.dateKey === dateKey) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ dateKey, messages: [message] });
    }
  }
  return groups;
}

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

  const property = lead.property_id
    ? await apiGet<Property>(`/properties/${lead.property_id}`)
    : null;

  const messages = (conversation?.messages as StoredMessage[] | null) ?? [];
  const dayGroups = groupMessagesByDay(messages);

  return (
    // lg:h-... caps this page to the viewport so the panels below scroll
    // internally instead of the whole document: 4rem = topbar's h-16
    // (topbar.tsx), 3rem = <main>'s py-6 top+bottom (dashboard-shell.tsx).
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-4rem-3rem)]">
      <PageHeader
        eyebrow="Leads"
        title={lead.name || "Sin nombre"}
        actions={
          <LeadStatusMenu
            leadId={lead.id}
            initialStatus={lead.status ?? "new"}
          />
        }
      />

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 lg:min-h-0 lg:overflow-y-auto">
          <dl className="grid gap-4 sm:grid-cols-3">
            <LeadField label="Teléfono" value={formatPhone(lead.phone)} />
            <LeadField
              label="Operación"
              value={
                lead.operation_type
                  ? OPERATION_TYPE_LABELS[lead.operation_type]
                  : EMPTY_VALUE
              }
            />
            <LeadField
              label="Zona"
              value={lead.preferred_zone || EMPTY_VALUE}
            />
            <LeadField
              label="Presupuesto"
              value={formatBudget(
                lead.budget_min,
                lead.budget_max,
                lead.currency,
              )}
            />
            <LeadField label="Ambientes" value={formatNumber(lead.rooms)} />
            <LeadField label="Fecha" value={formatDate(lead.created_at)} />
          </dl>

          {property && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <dt className="text-xs text-muted-foreground">
                Propiedad vinculada
              </dt>
              <Link
                href={`/properties/${property.id}`}
                className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 hover:bg-muted"
              >
                <span className="text-sm font-medium">{property.title}</span>
                <span className="text-xs text-muted-foreground">
                  {property.zone} ·{" "}
                  {formatPrice(property.price, property.currency)}
                </span>
              </Link>
            </div>
          )}

          {lead.notes && (
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <dt className="text-xs text-muted-foreground">Notas</dt>
              <dd className="text-sm">{lead.notes}</dd>
            </div>
          )}
        </div>

        <div className="flex flex-col rounded-xl bg-card p-6 ring-1 ring-foreground/10 lg:min-h-0 lg:overflow-y-auto">
          <h2 className="type-subtitle mb-4 text-foreground">
            Conversación de WhatsApp
          </h2>
          {dayGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este lead no proviene de una conversación de WhatsApp.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {dayGroups.map((group) => (
                <div key={group.dateKey} className="flex flex-col gap-3">
                  <div className="flex justify-center">
                    <span className="type-eyebrow text-muted-foreground">
                      {formatDayHeading(group.messages[0].timestamp)}
                    </span>
                  </div>
                  {group.messages.map((message, index) => (
                    <div
                      key={
                        message.whatsapp_message_id ??
                        `${group.dateKey}-${index}`
                      }
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
                      <span className="type-data text-xs text-muted-foreground">
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
