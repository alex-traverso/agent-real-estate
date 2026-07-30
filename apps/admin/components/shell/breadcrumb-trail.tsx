"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";

type Crumb = { label: string; href?: string };

const SECTION_LABELS: Record<string, string> = Object.fromEntries(
  NAV_ITEMS.filter((item) => item.href !== "/").map((item) => [
    item.href.slice(1),
    item.label,
  ]),
);

/**
 * Builds crumbs from the URL segments rather than page-supplied titles: every
 * route under (dashboard) is either a list (`/properties`), a create form
 * (`/properties/new`) or a detail (`/properties/:id`), so the shape is generic
 * enough that no page has to declare its own breadcrumb.
 */
function buildTrail(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Inicio" }];

  const [section, ...rest] = segments;
  const sectionLabel = SECTION_LABELS[section] ?? section;
  const trail: Crumb[] = [
    { label: sectionLabel, href: rest.length > 0 ? `/${section}` : undefined },
  ];

  if (rest.length > 0) {
    trail.push({ label: rest[0] === "new" ? "Nueva propiedad" : "Detalle" });
  }

  return trail;
}

export function BreadcrumbTrail() {
  const pathname = usePathname();
  const trail = buildTrail(pathname);

  return (
    <nav aria-label="Ruta de navegación" className="flex min-w-0 items-center">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className="truncate text-foreground"
                aria-current={index === trail.length - 1 ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
