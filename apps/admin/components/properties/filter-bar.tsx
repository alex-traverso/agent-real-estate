"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Constants } from "types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/property-labels";

const { operation_type, property_type } = Constants.public.Enums;

// Radix Select reserves the empty string to mean "cleared" — this sentinel
// represents "no filter" for a param that should be omitted from the URL.
const ALL_VALUE = "all";

const SEARCH_DEBOUNCE_MS = 300;

type FilterBarProps = {
  zones: string[];
};

/**
 * URL-state filter bar for the properties table: free-text search (debounced
 * ~300ms) plus zone/operation/type/availability selects that commit
 * immediately. Every change resets `page` to 1 so a narrowed filter always
 * starts on the first page of results.
 */
export function FilterBar({ zones }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keeps the input in sync when the URL changes from elsewhere (e.g. the
  // "Limpiar filtros" link) without fighting the user's own debounced typing.
  // Adjusted during render (React's recommended pattern for "state derived
  // from a prop that changed") rather than in an effect, so this never
  // triggers a second, cascading render.
  const [syncedUrlSearch, setSyncedUrlSearch] = useState(urlSearch);
  if (urlSearch !== syncedUrlSearch) {
    setSyncedUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL_VALUE) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam("search", value || undefined);
    }, SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Buscar por título o dirección..."
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="w-full sm:w-56"
      />

      <Select
        value={searchParams.get("zone") ?? ALL_VALUE}
        onValueChange={(value) => setParam("zone", value)}
      >
        <SelectTrigger aria-label="Zona">
          <SelectValue placeholder="Zona" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las zonas</SelectItem>
          {zones.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("operation") ?? ALL_VALUE}
        onValueChange={(value) => setParam("operation", value)}
      >
        <SelectTrigger aria-label="Operación">
          <SelectValue placeholder="Operación" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las operaciones</SelectItem>
          {operation_type.map((value) => (
            <SelectItem key={value} value={value}>
              {OPERATION_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("type") ?? ALL_VALUE}
        onValueChange={(value) => setParam("type", value)}
      >
        <SelectTrigger aria-label="Tipo">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
          {property_type.map((value) => (
            <SelectItem key={value} value={value}>
              {PROPERTY_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("available") ?? ALL_VALUE}
        onValueChange={(value) => setParam("available", value)}
      >
        <SelectTrigger aria-label="Disponibilidad">
          <SelectValue placeholder="Disponibilidad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas</SelectItem>
          <SelectItem value="true">Disponibles</SelectItem>
          <SelectItem value="false">No disponibles</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
