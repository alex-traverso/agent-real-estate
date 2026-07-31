"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/(dashboard)/actions";

type UserMenuProps = {
  email: string;
};

export function UserMenu({ email }: UserMenuProps) {
  const initial = email.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Menú de usuario"
        >
          <Avatar size="sm">
            <AvatarFallback className="bg-primary-subtle text-primary">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm text-muted-foreground sm:inline">
            {email}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground sm:hidden">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="sm:hidden" />
        {/* logout() is a "use server" action; Next.js supports calling it
            directly from a client event handler and handles the redirect()
            it throws — no <form> wrapper needed. */}
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
