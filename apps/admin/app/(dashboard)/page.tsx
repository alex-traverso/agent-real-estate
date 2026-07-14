import { createClient } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl font-medium">
        Bienvenido{user?.email ? `, ${user.email}` : ""}
      </h1>
      <p className="text-muted-foreground">
        Este es el panel de administración de Agent Real Estate.
      </p>
    </div>
  );
}
