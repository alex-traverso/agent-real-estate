"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { Topbar } from "./topbar";

const COLLAPSED_STORAGE_KEY = "admin:sidebar-collapsed";

type DashboardShellProps = {
  userEmail: string;
  children: ReactNode;
};

/**
 * The authenticated app frame: sidebar + topbar + a centered content well.
 * Client-side because the sidebar's collapsed state is interactive and
 * persisted to localStorage; the auth check that guards this shell stays in
 * the server-rendered (dashboard)/layout.tsx above it.
 */
export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Reads the stored preference once, after mount — the server always
  // renders `collapsed = false`, so syncing during render would cause a
  // hydration mismatch for a returning user who had it collapsed.
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    // One-time sync from a client-only store after mount, not derived state —
    // the server always renders collapsed=false to avoid a hydration
    // mismatch, and this reads the real preference in right after.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh w-full">
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={userEmail} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
