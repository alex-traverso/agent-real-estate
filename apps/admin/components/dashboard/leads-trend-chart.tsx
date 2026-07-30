"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCount } from "@/app/(dashboard)/stats.types";

interface LeadsTrendChartProps {
  data: DailyCount[];
}

const tickDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
});

function formatTick(date: string): string {
  return tickDateFormatter.format(new Date(date));
}

/**
 * Area chart of leads created per day, last 30 days. Client component:
 * Recharts measures the DOM to lay out its SVG, so it can't render on the
 * server. Data is fetched server-side and passed down as a prop.
 */
export function LeadsTrendChart({ data }: LeadsTrendChartProps) {
  const hasLeads = data.some((day) => day.count > 0);

  if (!hasLeads) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
        Todavía no hay leads en los últimos 30 días.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
      >
        <defs>
          <linearGradient id="leadsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={24}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value) => [value, "Leads"]}
          labelFormatter={(label) => formatTick(String(label))}
          contentStyle={{
            borderRadius: 8,
            borderColor: "var(--border)",
            backgroundColor: "var(--popover)",
            color: "var(--popover-foreground)",
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#leadsTrendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
