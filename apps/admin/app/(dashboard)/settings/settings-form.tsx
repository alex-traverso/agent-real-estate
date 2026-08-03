"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { Tables } from "types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsFormState } from "./actions";

export type SettingsFormAction = (
  prevState: SettingsFormState,
  formData: FormData,
) => Promise<SettingsFormState>;

export function SettingsForm({
  action,
  agency,
}: {
  action: SettingsFormAction;
  agency: Tables<"agencies">;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const connected = Boolean(agency.whatsapp_phone_number_id);

  // Keyed on the save timestamp, not on a boolean: saving the same form twice
  // in a row must toast twice.
  useEffect(() => {
    if (state.savedAt) {
      toast.success("Cambios guardados.");
    }
  }, [state.savedAt]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la inmobiliaria</CardTitle>
          <CardDescription>
            Cómo se identifica tu inmobiliaria y dónde te llegan los avisos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={agency.name}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email de contacto</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={agency.email}
            />
            <p className="text-sm text-muted-foreground">
              Ahí te avisamos de cada lead nuevo.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              maxLength={50}
              defaultValue={agency.phone ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Conexión de WhatsApp</CardTitle>
              <CardDescription>
                Sin esto, Luca no recibe ni responde los mensajes que llegan a
                tu número.
              </CardDescription>
            </div>
            <Badge variant={connected ? "default" : "destructive"}>
              {connected ? "Conectado" : "No conectado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="whatsappPhoneNumberId">
            Phone Number ID de WhatsApp
          </Label>
          <Input
            id="whatsappPhoneNumberId"
            name="whatsappPhoneNumberId"
            inputMode="numeric"
            pattern="\d{5,20}"
            placeholder="123456789012345"
            autoComplete="off"
            defaultValue={agency.whatsapp_phone_number_id ?? ""}
            className="sm:max-w-xs"
          />
          <p className="text-sm text-muted-foreground">
            Lo encontrás en Meta for Developers → tu app → WhatsApp →
            Configuración de la API, como &quot;Identificador del número de
            teléfono&quot;. Son sólo números, no es tu número de teléfono.
            Dejalo vacío para desconectar.
          </p>
        </CardContent>
      </Card>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
