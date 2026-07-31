"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

/**
 * Cycles through light / dark / system rather than a plain two-state switch,
 * so a user can also opt back into following the OS. next-themes persists the
 * choice to localStorage on its own.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // Avoids rendering the resolved icon before hydration, which would flash
  // the wrong one for a user whose OS theme differs from the SSR default.
  const [mounted, setMounted] = useState(false);
  // next-themes' own documented fix for the SSR/client theme mismatch: a
  // one-time mount flag, not derived state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const ActiveIcon =
    (mounted ? resolvedTheme : undefined) === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Cambiar tema">
          <ActiveIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
            >
              <Icon className="size-4" />
              {option.label}
              {active && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
