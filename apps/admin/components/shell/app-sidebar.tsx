"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "./brand";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeOnly, springDefault } from "@/lib/motion";

const WIDTH_EXPANDED = 232;
const WIDTH_COLLAPSED = 64;

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * Desktop navigation rail. Hidden below `md` — MobileNav (a Sheet) covers
 * small screens instead, sharing the same NAV_ITEMS so the two never list
 * different routes.
 */
export function AppSidebar({ collapsed, onToggleCollapsed }: AppSidebarProps) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  return (
    <motion.aside
      animate={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED }}
      transition={reduced ? fadeOnly : springDefault}
      className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar md:flex"
    >
      <div className="flex h-16 shrink-0 items-center px-4">
        <Link href="/" className="flex items-center overflow-hidden">
          {collapsed ? (
            <>
              <span
                className="type-title flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-base text-primary-foreground"
                aria-hidden="true"
              >
                L
              </span>
              <span className="sr-only">Luca</span>
            </>
          ) : (
            <Brand />
          )}
        </Link>
      </div>

      <nav
        aria-label="Principal"
        className="flex flex-1 flex-col gap-1 overflow-hidden px-3 py-2"
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className={cn("whitespace-nowrap", collapsed && "sr-only")}>
                {item.label}
              </span>
            </Link>
          );

          if (!collapsed) return link;

          return (
            <Tooltip key={item.href} delayDuration={300}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {(() => {
          const toggleButton = (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapsed}
              className="w-full justify-start gap-3 px-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              aria-label={collapsed ? "Expandir panel" : "Colapsar panel"}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4 shrink-0" />
              ) : (
                <PanelLeftClose className="size-4 shrink-0" />
              )}
              <span className={cn(collapsed && "sr-only")}>Colapsar</span>
            </Button>
          );

          if (!collapsed) return toggleButton;

          return (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
              <TooltipContent side="right">Expandir panel</TooltipContent>
            </Tooltip>
          );
        })()}
      </div>
    </motion.aside>
  );
}
