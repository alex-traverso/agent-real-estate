"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ZoneCount } from "@/app/(dashboard)/stats.types";

interface TopZonesChartProps {
  data: ZoneCount[];
}

/**
 * Horizontal bar chart of the busiest zones by property count (already
 * top-8 from the backend). Client component: Recharts measures the DOM to
 * lay out its SVG, so it can't render on the server. Bars share a single
 * solid color — zones are already axis-labeled, so color here should track
 * emphasis, not act as a categorical key.
 */
export function TopZonesChart({ data }: TopZonesChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
        Todavía no hay propiedades con zona cargada.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          type="category"
          dataKey="zone"
          tickLine={false}
          axisLine={false}
          width={88}
          interval={0}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value) => [value, "Propiedades"]}
          contentStyle={{
            borderRadius: 8,
            borderColor: "var(--border)",
            backgroundColor: "var(--popover)",
            color: "var(--popover-foreground)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="count" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
