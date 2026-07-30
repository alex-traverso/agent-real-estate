import { formatNumber, formatPrice } from "@/lib/format";
import type { AgencyStats } from "@/app/(dashboard)/stats.types";

interface StatTilesProps {
  stats: AgencyStats;
}

interface Tile {
  label: string;
  value: string;
}

/**
 * The KPI row on the dashboard home. Markup mirrors `StatTilesSkeleton`
 * (`rounded-xl bg-card ring-1 ring-foreground/10`, same grid) so the page
 * doesn't shift layout between `loading.tsx` and the data-loaded state.
 */
export function StatTiles({ stats }: StatTilesProps) {
  const leadsLast30Days = stats.leads.last30Days.reduce(
    (sum, day) => sum + day.count,
    0,
  );

  const tiles: Tile[] = [
    {
      label: "Propiedades disponibles",
      value: `${formatNumber(stats.properties.available)} / ${formatNumber(stats.properties.total)}`,
    },
    {
      label: "Leads (30 días)",
      value: formatNumber(leadsLast30Days),
    },
    {
      label: "Leads nuevos",
      value: formatNumber(stats.leads.byStatus.new),
    },
    {
      label: "Precio mediano (USD)",
      value: formatPrice(stats.properties.medianPrice.USD, "USD"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col gap-2 rounded-xl bg-card p-5 ring-1 ring-foreground/10"
        >
          <span className="type-eyebrow">{tile.label}</span>
          <span className="type-subtitle text-foreground">{tile.value}</span>
        </div>
      ))}
    </div>
  );
}
