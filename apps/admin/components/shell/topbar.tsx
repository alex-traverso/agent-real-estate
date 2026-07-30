import { MobileNav } from "./mobile-nav";
import { BreadcrumbTrail } from "./breadcrumb-trail";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type TopbarProps = {
  userEmail: string;
};

/**
 * Translucent chrome: a floating layer over the content rather than an
 * opaque strip, per the Apple materials guidance — content scrolls under it.
 * `surface-translucent` (globals.css) solidifies it under
 * prefers-reduced-transparency.
 */
export function Topbar({ userEmail }: TopbarProps) {
  return (
    <header className="surface-translucent sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/75 px-4 backdrop-blur-md sm:px-6">
      <MobileNav />
      <BreadcrumbTrail />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={userEmail} />
      </div>
    </header>
  );
}
