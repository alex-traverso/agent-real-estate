import type { Enums } from "types";

type LeadStatus = Enums<"lead_status">;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  closed: "Cerrado",
};

export const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "contacted", "closed"];

export const LEAD_STATUS_BADGE_VARIANT: Record<
  LeadStatus,
  "default" | "secondary" | "outline"
> = {
  new: "default",
  contacted: "secondary",
  closed: "outline",
};

export function formatLeadBudget(
  budgetMin: number | null,
  budgetMax: number | null,
  currency: string | null,
): string {
  if (budgetMin === null && budgetMax === null) return "—";

  const formatter = new Intl.NumberFormat("es-AR");
  const prefix = currency ? `${currency} ` : "";

  if (budgetMin !== null && budgetMax !== null) {
    return `${prefix}${formatter.format(budgetMin)} – ${formatter.format(budgetMax)}`;
  }
  if (budgetMin !== null) {
    return `Desde ${prefix}${formatter.format(budgetMin)}`;
  }
  return `Hasta ${prefix}${formatter.format(budgetMax!)}`;
}
