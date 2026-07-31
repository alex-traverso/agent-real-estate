import Link from "next/link";
import type { Tables } from "types";
import { Stagger, RevealItem } from "@/components/motion/reveal";
import { LEAD_STATUS_LABELS } from "@/lib/lead-labels";
import { formatDate } from "@/lib/format";

interface RecentLeadsListProps {
  leads: Tables<"leads">[];
}

/** The most recent leads on the dashboard home, each linking to its detail page. */
export function RecentLeadsList({ leads }: RecentLeadsListProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <span className="type-eyebrow">Últimos leads</span>
      {leads.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Todavía no hay leads.
        </p>
      ) : (
        <Stagger as="ul" className="flex flex-col divide-y divide-border">
          {leads.map((lead) => (
            <RevealItem key={lead.id} as="li">
              <Link
                href={`/leads/${lead.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0 truncate font-medium text-foreground">
                  {lead.name || "Sin nombre"}
                </span>
                <span className="text-center text-muted-foreground">
                  {lead.status ? LEAD_STATUS_LABELS[lead.status] : "—"}
                </span>
                <span className="type-data min-w-0 truncate text-right text-muted-foreground">
                  {formatDate(lead.created_at)}
                </span>
              </Link>
            </RevealItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
