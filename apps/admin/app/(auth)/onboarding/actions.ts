"use server";

import { redirect } from "next/navigation";
import type { Tables } from "types";
import { apiMutate } from "@/lib/api/client";

type Agency = Tables<"agencies">;

export type OnboardingFormState = { error?: string };

function stringOrUndefined(value: FormDataEntryValue | null) {
  if (value === null || value === "") return undefined;
  return String(value);
}

export async function createAgency(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const result = await apiMutate<Agency>("/agencies", {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: stringOrUndefined(formData.get("phone")),
    }),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect("/");
}
