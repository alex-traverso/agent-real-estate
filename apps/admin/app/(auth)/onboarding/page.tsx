import { redirect } from "next/navigation";
import type { Tables } from "types";
import { createClient } from "@/lib/supabase/server";
import { apiGet } from "@/lib/api/client";
import { OnboardingForm } from "./onboarding-form";
import { createAgency } from "./actions";

/**
 * Lives in the (auth) group to reuse its split-screen shell — that group is
 * "pages outside the dashboard shell", not "public pages": this page still
 * requires a session, it just isn't dashboard chrome.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Already has an agency — nothing to onboard, and creating a second one
  // isn't a thing this form supports. Back to the dashboard.
  const { agency } = await apiGet<{ agency: Tables<"agencies"> | null }>(
    "/agencies/me",
  );
  if (agency) {
    redirect("/");
  }

  return <OnboardingForm action={createAgency} defaultEmail={user.email ?? ""} />;
}
