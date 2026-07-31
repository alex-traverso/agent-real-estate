import Link from "next/link";
import { Building } from "lucide-react";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { ChartPanel } from "@/components/dashboard/chart-panel";
import { LeadsTrendChart } from "@/components/dashboard/leads-trend-chart";
import { TopZonesChart } from "@/components/dashboard/top-zones-chart";
import { RecentLeadsList } from "@/components/dashboard/recent-leads-list";
import type { AgencyStats } from "./stats.types";

const RECENT_LEADS_LIMIT = 5;

export default async function DashboardHomePage() {
  const [stats, { data: recentLeads }] = await Promise.all([
    apiGet<AgencyStats>("/stats"),
    apiGet<{ data: Tables<"leads">[]; total: number }>(
      `/leads?page=1&limit=${RECENT_LEADS_LIMIT}`,
    ),
  ]);

  if (stats.properties.total === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Agent Real Estate" title="Inicio" />
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
              empezar a ver métricas acá.
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
      <PageHeader eyebrow="Agent Real Estate" title="Inicio" />
      <StatTiles stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Leads por día (30 días)">
          <LeadsTrendChart data={stats.leads.last30Days} />
        </ChartPanel>
        <ChartPanel title="Top zonas">
          <TopZonesChart data={stats.properties.byZone} />
        </ChartPanel>
      </div>
      <RecentLeadsList leads={recentLeads} />
    </div>
  );
}
