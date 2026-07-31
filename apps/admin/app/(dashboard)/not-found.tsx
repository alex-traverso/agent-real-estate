import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Rendered inside the authenticated shell — the (dashboard) layout's auth
 * guard still runs first — for a property or lead id that doesn't exist
 * (apiGet calls notFound() on a 404 from the API) or an unmatched dashboard
 * route.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="type-subtitle text-foreground">No encontramos esto</h2>
        <p className="text-sm text-muted-foreground">
          El registro que buscás no existe o fue eliminado.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
