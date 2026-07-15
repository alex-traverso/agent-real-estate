import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { PropertyForm } from "../property-form";
import { updateProperty } from "../actions";
import { AvailabilityToggle } from "../availability-toggle";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await apiGet<Tables<"properties">>(`/properties/${id}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-medium">{property.title}</h1>
        <AvailabilityToggle
          propertyId={property.id}
          initialAvailable={property.available ?? false}
        />
      </div>
      <PropertyForm
        action={updateProperty.bind(null, property.id)}
        submitLabel="Guardar cambios"
        defaultValues={property}
      />
    </div>
  );
}
