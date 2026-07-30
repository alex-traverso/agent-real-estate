import { Brand } from "@/components/shell/brand";

/**
 * Split shell: a quiet decorative column carrying the brand on large
 * screens, and the auth card in a centered right column. Below `lg` the
 * decorative column disappears and its brand mark moves above the card, so
 * the identity never vanishes, it just relocates.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1">
      <div
        className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex lg:w-[42%]"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <Brand />
        <p className="type-subtitle max-w-sm text-foreground">
          El agente que califica tus leads mientras vos cerrás operaciones.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-background p-6 sm:p-10">
        <div className="w-full max-w-sm lg:hidden">
          <Brand />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
