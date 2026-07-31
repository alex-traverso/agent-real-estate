"use client";

import { useActionState, useState } from "react";
import { Constants, type Tables } from "types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyFormSection } from "@/components/properties/property-form-section";
import { formatArea } from "@/lib/format";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/property-labels";

const { property_type, operation_type, currency_type } = Constants.public.Enums;

export type PropertyFormState = { error?: string };

export type PropertyFormAction = (
  prevState: PropertyFormState,
  formData: FormData,
) => Promise<PropertyFormState>;

/** Parses an area input's raw string into a number for the live preview, or undefined when blank/invalid. */
function parseAreaInput(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PropertyForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: PropertyFormAction;
  submitLabel: string;
  defaultValues?: Partial<Tables<"properties">>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [type, setType] = useState<string>(
    defaultValues?.type ?? property_type[0],
  );
  const [operation, setOperation] = useState<string>(
    defaultValues?.operation ?? operation_type[0],
  );
  const [currency, setCurrency] = useState<string>(
    defaultValues?.currency ?? currency_type[0],
  );
  const [parking, setParking] = useState(defaultValues?.parking ?? false);
  const [coveredAreaInput, setCoveredAreaInput] = useState(
    defaultValues?.covered_area != null ? String(defaultValues.covered_area) : "",
  );
  const [totalAreaInput, setTotalAreaInput] = useState(
    defaultValues?.total_area != null ? String(defaultValues.total_area) : "",
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <PropertyFormSection title="Identificación">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={defaultValues?.title}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {property_type.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROPERTY_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="type" value={type} />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Operación</Label>
          <Select value={operation} onValueChange={setOperation}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operation_type.map((value) => (
                <SelectItem key={value} value={value}>
                  {OPERATION_TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="operation" value={operation} />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={defaultValues?.description ?? ""}
          />
        </div>
      </PropertyFormSection>

      <PropertyFormSection title="Ubicación">
        <div className="flex flex-col gap-2">
          <Label htmlFor="zone">Zona</Label>
          <Input
            id="zone"
            name="zone"
            required
            defaultValue={defaultValues?.zone}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Dirección</Label>
          <Input
            id="address"
            name="address"
            defaultValue={defaultValues?.address ?? ""}
          />
        </div>
      </PropertyFormSection>

      <PropertyFormSection title="Superficies">
        <div className="flex flex-col gap-2">
          <Label htmlFor="coveredArea">Superficie cubierta (m²)</Label>
          <Input
            id="coveredArea"
            name="coveredArea"
            type="number"
            min="0"
            step="0.01"
            value={coveredAreaInput}
            onChange={(e) => setCoveredAreaInput(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="totalArea">Superficie total (m²)</Label>
          <Input
            id="totalArea"
            name="totalArea"
            type="number"
            min="0"
            step="0.01"
            value={totalAreaInput}
            onChange={(e) => setTotalAreaInput(e.target.value)}
          />
        </div>

        <div className="flex gap-6 sm:col-span-2">
          <div className="flex flex-col gap-1">
            <span className="type-eyebrow">Superficie cubierta</span>
            <span className="type-data text-foreground">
              {formatArea(parseAreaInput(coveredAreaInput))}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="type-eyebrow">Superficie total</span>
            <span className="type-data text-foreground">
              {formatArea(parseAreaInput(totalAreaInput))}
            </span>
          </div>
        </div>
      </PropertyFormSection>

      <PropertyFormSection title="Detalle">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rooms">Ambientes</Label>
          <Input
            id="rooms"
            name="rooms"
            type="number"
            min="0"
            defaultValue={defaultValues?.rooms ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bedrooms">Dormitorios</Label>
          <Input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min="0"
            defaultValue={defaultValues?.bedrooms ?? ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bathrooms">Baños</Label>
          <Input
            id="bathrooms"
            name="bathrooms"
            type="number"
            min="0"
            defaultValue={defaultValues?.bathrooms ?? ""}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={parking} onCheckedChange={setParking} />
          <Label>Cochera</Label>
          <input type="hidden" name="parking" value={String(parking)} />
        </div>
      </PropertyFormSection>

      <PropertyFormSection title="Precio">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">Precio</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={defaultValues?.price}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currency_type.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="currency" value={currency} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="hoaFees">Expensas</Label>
          <Input
            id="hoaFees"
            name="hoaFees"
            type="number"
            min="0"
            step="0.01"
            defaultValue={defaultValues?.hoa_fees ?? ""}
          />
        </div>
      </PropertyFormSection>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="surface-translucent sticky bottom-0 z-10 -mx-4 border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
