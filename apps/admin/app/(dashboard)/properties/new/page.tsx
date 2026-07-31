import { PageHeader } from "@/components/shell/page-header";
import { PropertyForm } from "../property-form";
import { createProperty } from "../actions";

export default function NewPropertyPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Catálogo" title="Nueva propiedad" />
      <PropertyForm action={createProperty} submitLabel="Crear propiedad" />
    </div>
  );
}
