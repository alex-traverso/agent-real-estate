import { notFound } from "next/navigation";
import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "./settings-form";
import { updateAgency } from "./actions";

export default async function SettingsPage() {
  const { agency } = await apiGet<{ agency: Tables<"agencies"> | null }>(
    "/agencies/me",
  );

  // (dashboard)/layout.tsx already sends an agency-less user to /onboarding,
  // so this only covers the agency disappearing mid-session.
  if (!agency) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cuenta"
        title="Configuración"
        description="Los datos de tu inmobiliaria y la conexión con WhatsApp."
      />
      <SettingsForm action={updateAgency} agency={agency} />
    </div>
  );
}
