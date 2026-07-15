import { PropertyForm } from "../property-form";
import { createProperty } from "../actions";

export default function NewPropertyPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-medium">Nueva propiedad</h1>
      <PropertyForm action={createProperty} submitLabel="Crear propiedad" />
    </div>
  );
}
