import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { apiGet } from "@/lib/api/client";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import type { Tables } from "types";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A user with no agency_users row (e.g. created directly in Supabase) has
  // nothing to see here — every dashboard route is agency-scoped and would
  // 403. Send them to onboarding instead of letting that 403 surface as the
  // generic error boundary.
  const { agency } = await apiGet<{ agency: Tables<"agencies"> | null }>(
    "/agencies/me",
  );
  if (!agency) {
    redirect("/onboarding");
  }

  // Resolved here rather than in a separate fetch: the agency is already
  // loaded for the check above, and the banner has to live above every
  // dashboard page anyway.
  return (
    <DashboardShell
      userEmail={user.email ?? ""}
      whatsappConnected={Boolean(agency.whatsapp_phone_number_id)}
    >
      {children}
    </DashboardShell>
  );
}
