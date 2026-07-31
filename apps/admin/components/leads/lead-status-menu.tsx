"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { Enums } from "types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LEAD_STATUS_BADGE_VARIANT, LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/lead-labels";
import { updateLeadStatus } from "@/app/(dashboard)/leads/actions";

type LeadStatus = Enums<"lead_status">;

type LeadStatusMenuProps = {
  leadId: string;
  initialStatus: LeadStatus;
};

/**
 * A Badge that opens a dropdown of the other statuses. Same optimistic
 * update + toast pattern as `AvailabilityToggle`: update local state
 * immediately, revert and toast an error if the request fails. Used both in
 * the leads table's Estado cell and the detail page header.
 */
export function LeadStatusMenu({ leadId, initialStatus }: LeadStatusMenuProps) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  function handleSelect(next: LeadStatus) {
    if (next === status) return;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, next);
        toast.success(`Estado actualizado a "${LEAD_STATUS_LABELS[next]}".`);
      } catch {
        setStatus(previous);
        toast.error("No se pudo actualizar el estado. Intentá de nuevo.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Badge variant={LEAD_STATUS_BADGE_VARIANT[status]} className="cursor-pointer">
            {LEAD_STATUS_LABELS[status]}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LEAD_STATUS_ORDER.map((value) => (
          <DropdownMenuItem key={value} onSelect={() => handleSelect(value)}>
            <Check
              className={value === status ? "opacity-100" : "opacity-0"}
            />
            {LEAD_STATUS_LABELS[value]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
