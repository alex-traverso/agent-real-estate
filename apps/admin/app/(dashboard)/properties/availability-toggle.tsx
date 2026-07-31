"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setPropertyAvailability } from "./actions";

export function AvailabilityToggle({
  propertyId,
  initialAvailable,
}: {
  propertyId: string;
  initialAvailable: boolean;
}) {
  const [available, setAvailable] = useState(initialAvailable);
  const [pending, startTransition] = useTransition();

  function handleChange(checked: boolean) {
    setAvailable(checked);
    startTransition(async () => {
      try {
        await setPropertyAvailability(propertyId, checked);
        toast.success(
          checked ? "Propiedad marcada como disponible." : "Propiedad marcada como no disponible.",
        );
      } catch {
        setAvailable(!checked);
        toast.error("No se pudo actualizar la disponibilidad. Intentá de nuevo.");
      }
    });
  }

  const switchId = `available-switch-${propertyId}`;

  return (
    <div className="flex items-center gap-3">
      <Switch
        id={switchId}
        checked={available}
        disabled={pending}
        onCheckedChange={handleChange}
      />
      <Label htmlFor={switchId}>{available ? "Disponible" : "No disponible"}</Label>
    </div>
  );
}
