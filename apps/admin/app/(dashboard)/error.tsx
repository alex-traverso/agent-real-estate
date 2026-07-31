"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="type-subtitle text-foreground">Ocurrió un error</h2>
        <p className="text-sm text-muted-foreground">
          No pudimos completar la operación. Intentá de nuevo.
        </p>
      </div>
      <Button onClick={() => reset()} variant="outline">
        Reintentar
      </Button>
    </div>
  );
}
