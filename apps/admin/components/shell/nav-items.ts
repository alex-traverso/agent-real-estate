import { Building, Home, Users } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

/** Shared between the sidebar and the mobile nav sheet, so they never drift. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/properties", label: "Propiedades", icon: Building },
  { href: "/leads", label: "Leads", icon: Users },
];

/**
 * `/` only matches itself (every route starts with `/`); every other entry
 * matches its own detail and sub-routes too, so `/properties/new` still
 * highlights "Propiedades".
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
