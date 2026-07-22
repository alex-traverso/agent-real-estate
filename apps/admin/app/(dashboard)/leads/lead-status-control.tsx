"use client";

import { useState, useTransition } from "react";
import type { Enums } from "types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/lead-labels";
import { updateLeadStatus } from "./actions";

type LeadStatus = Enums<"lead_status">;

export function LeadStatusControl({
  leadId,
  initialStatus,
}: {
  leadId: string;
  initialStatus: LeadStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    const previous = status;
    const nextStatus = next as LeadStatus;
    setStatus(nextStatus);
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, nextStatus);
      } catch {
        setStatus(previous);
      }
    });
  }

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Select value={status} disabled={pending} onValueChange={handleChange}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEAD_STATUS_ORDER.map((value) => (
            <SelectItem key={value} value={value}>
              {LEAD_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
