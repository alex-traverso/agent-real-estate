import Link from "next/link";
import type { Enums } from "types";
import type { LeadStats } from "@/app/(dashboard)/stats.types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/lead-labels";
import { cn } from "@/lib/utils";

type LeadStatus = Enums<"lead_status">;

type LeadsTabsProps = {
  activeStatus?: LeadStatus;
  stats: LeadStats;
};

/**
 * Status filter tabs for the leads list, with real counts from `GET /stats`.
 * A Server Component: the active tab comes from the page's own `searchParams`
 * (passed down as `activeStatus`), so no client-side URL hook is needed here.
 * Active-item treatment mirrors the sidebar nav's filled-pill active state.
 */
export function LeadsTabs({ activeStatus, stats }: LeadsTabsProps) {
  const tabs: { label: string; href: string; count: number; active: boolean }[] = [
    {
      label: "Todos",
      href: "/leads",
      count: stats.total,
      active: activeStatus === undefined,
    },
    ...LEAD_STATUS_ORDER.map((value) => ({
      label: LEAD_STATUS_LABELS[value],
      href: `/leads?status=${value}`,
      count: stats.byStatus[value],
      active: activeStatus === value,
    })),
  ];

  return (
    <nav aria-label="Filtrar por estado" className="flex flex-wrap items-center gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors",
            tab.active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
          )}
        >
          {tab.label}
          <span className="type-data text-xs text-muted-foreground">{tab.count}</span>
        </Link>
      ))}
    </nav>
  );
}
