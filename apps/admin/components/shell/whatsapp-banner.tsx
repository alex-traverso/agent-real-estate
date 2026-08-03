"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TriangleAlert } from "lucide-react";

/**
 * An agency whose `whatsapp_phone_number_id` is unset never resolves as a
 * tenant on the inbound webhook, so Luca silently ignores every message sent
 * to the business number — a failure with no client-visible symptom at all.
 * This makes it visible on every dashboard page until it's fixed.
 *
 * Deliberately not a blocking gate: loading properties before connecting the
 * number is a perfectly reasonable order to work in. Hidden on /settings,
 * where the field itself is already on screen.
 */
export function WhatsAppBanner() {
  const pathname = usePathname();

  if (pathname === "/settings") {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm"
    >
      <TriangleAlert className="size-4 shrink-0 text-destructive" />
      <p className="text-foreground">
        <span className="font-medium">WhatsApp no conectado.</span> Luca
        todavía no puede responder los mensajes que llegan a tu número.
      </p>
      <Link
        href="/settings"
        className="ml-auto font-medium text-destructive underline-offset-4 hover:underline"
      >
        Conectar
      </Link>
    </div>
  );
}
