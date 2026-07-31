import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PropertyFormSectionProps = {
  title: string;
  children: ReactNode;
};

/**
 * Card wrapper for a group of related fields in PropertyForm, mirroring how
 * ChartPanel wraps a single chart on the dashboard home: one reusable shell,
 * five instances (Identificación, Ubicación, Superficies, Detalle, Precio).
 */
export function PropertyFormSection({ title, children }: PropertyFormSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}
