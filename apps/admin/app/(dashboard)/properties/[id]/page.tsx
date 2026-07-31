import type { Tables } from "types";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatArea } from "@/lib/format";
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

  const hasCoveredArea = property.covered_area != null;
  const hasTotalArea = property.total_area != null;
  const hasAreas = hasCoveredArea || hasTotalArea;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catálogo"
        title={property.title}
        actions={
          <AvailabilityToggle
            propertyId={property.id}
            initialAvailable={property.available ?? false}
          />
        }
      />

      {hasAreas && (
        <Card>
          <CardContent className="flex flex-wrap gap-6">
            {hasCoveredArea && (
              <div className="flex flex-col gap-1">
                <span className="type-eyebrow">Superficie cubierta</span>
                <span className="type-subtitle text-foreground">
                  {formatArea(property.covered_area)}
                </span>
              </div>
            )}
            {hasTotalArea && (
              <div className="flex flex-col gap-1">
                <span className="type-eyebrow">Superficie total</span>
                <span className="type-subtitle text-foreground">
                  {formatArea(property.total_area)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PropertyForm
        action={updateProperty.bind(null, property.id)}
        submitLabel="Guardar cambios"
        defaultValues={property}
      />
    </div>
  );
}
