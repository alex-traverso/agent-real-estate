"use server";

import { revalidatePath } from "next/cache";
import type { Enums, Tables } from "types";
import { apiMutate } from "@/lib/api/client";

type Lead = Tables<"leads">;
type LeadStatus = Enums<"lead_status">;

export async function updateLeadStatus(id: string, status: LeadStatus) {
  const result = await apiMutate<Lead>(`/leads/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}
