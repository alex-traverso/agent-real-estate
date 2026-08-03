"use server";

import { revalidatePath } from "next/cache";
import type { Tables } from "types";
import { apiMutate } from "@/lib/api/client";

type Agency = Tables<"agencies">;

export type SettingsFormState = { error?: string; savedAt?: number };

/**
 * An empty input means "clear this column", sent as an explicit `null` — that
 * is how an agency disconnects its WhatsApp number. `undefined` would be
 * dropped by JSON.stringify and read by the API as "leave it alone".
 */
function nullableString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export async function updateAgency(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const result = await apiMutate<Agency>("/agencies/me", {
    method: "PATCH",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      phone: nullableString(formData.get("phone")),
      whatsappPhoneNumberId: nullableString(
        formData.get("whatsappPhoneNumberId"),
      ),
    }),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/settings");
  // The "WhatsApp no conectado" banner is resolved in (dashboard)/layout.tsx,
  // so the whole layout — not just this route — has to re-render for the
  // banner to appear or disappear right after saving.
  revalidatePath("/", "layout");

  return { savedAt: Date.now() };
}
