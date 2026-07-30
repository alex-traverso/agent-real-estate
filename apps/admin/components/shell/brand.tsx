import { cn } from "@/lib/utils";

type BrandProps = {
  /** `full` shows the eyebrow above the wordmark; `mark` is the wordmark alone. */
  variant?: "full" | "mark";
  className?: string;
};

/**
 * The product identity: "Agent Real Estate" as the small label, "Luca" — the
 * agent advisors are actually managing leads for — as the wordmark. Reused by
 * the sidebar, the mobile nav sheet and the auth layout, so the two never
 * drift out of sync.
 */
export function Brand({ variant = "full", className }: BrandProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {variant === "full" && (
        <span className="type-eyebrow">Agent Real Estate</span>
      )}
      <span className="type-title text-foreground">Luca</span>
    </div>
  );
}
