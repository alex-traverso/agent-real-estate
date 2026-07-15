"use client";

import { useEffect } from "react";
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div>
        <h2 className="text-lg font-medium">Ocurrió un error</h2>
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
