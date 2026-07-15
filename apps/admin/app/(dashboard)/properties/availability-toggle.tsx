"use client";

import { useState, useTransition } from "react";
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
      } catch {
        setAvailable(!checked);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Switch checked={available} disabled={pending} onCheckedChange={handleChange} />
      <Label>{available ? "Disponible" : "No disponible"}</Label>
    </div>
  );
}
