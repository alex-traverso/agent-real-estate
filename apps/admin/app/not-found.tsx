import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Catches any path that doesn't match a route at all (outside both the
 * (auth) and (dashboard) groups), so it renders without the dashboard shell
 * or an auth check — the visitor may not even have a session.
 */
export default function RootNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span className="type-eyebrow">404</span>
      <h1 className="type-title text-foreground">Página no encontrada</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        Esta dirección no existe en el panel.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
