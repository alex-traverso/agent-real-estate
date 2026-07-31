"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import type { OnboardingFormState } from "./actions";

export type OnboardingFormAction = (
  prevState: OnboardingFormState,
  formData: FormData,
) => Promise<OnboardingFormState>;

export function OnboardingForm({
  action,
  defaultEmail,
}: {
  action: OnboardingFormAction;
  defaultEmail: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">
          Creá tu inmobiliaria
        </CardTitle>
        <CardDescription>
          Todavía no tenés una inmobiliaria vinculada a tu cuenta. Completá
          estos datos para empezar a usar el panel.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre de la inmobiliaria</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email de contacto</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={defaultEmail}
            />
            <p className="text-sm text-muted-foreground">
              Ahí te avisamos de cada lead nuevo.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="mt-4 flex flex-col items-stretch gap-3">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creando..." : "Crear inmobiliaria"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
