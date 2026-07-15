"use server";

import { Workbook } from "exceljs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Constants, type Tables } from "types";
import { apiMutate } from "@/lib/api/client";
import type { PropertyFormState } from "./property-form";

type Property = Tables<"properties">;

function numberOrUndefined(value: FormDataEntryValue | null) {
  if (value === null || value === "") return undefined;
  return Number(value);
}

function parsePropertyFormData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    description: formData.get("description")
      ? String(formData.get("description"))
      : undefined,
    zone: String(formData.get("zone") ?? ""),
    type: String(formData.get("type")),
    operation: String(formData.get("operation")),
    price: numberOrUndefined(formData.get("price")),
    currency: String(formData.get("currency")),
    rooms: numberOrUndefined(formData.get("rooms")),
    bedrooms: numberOrUndefined(formData.get("bedrooms")),
    bathrooms: numberOrUndefined(formData.get("bathrooms")),
    coveredArea: numberOrUndefined(formData.get("coveredArea")),
    totalArea: numberOrUndefined(formData.get("totalArea")),
    hoaFees: numberOrUndefined(formData.get("hoaFees")),
    address: formData.get("address") ? String(formData.get("address")) : undefined,
    parking: formData.get("parking") === "true",
  };
}

export async function createProperty(
  _prevState: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const result = await apiMutate<Property>("/properties", {
    method: "POST",
    body: JSON.stringify(parsePropertyFormData(formData)),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/properties");
  redirect(`/properties/${result.data.id}`);
}

export async function updateProperty(
  id: string,
  _prevState: PropertyFormState,
  formData: FormData,
): Promise<PropertyFormState> {
  const result = await apiMutate<Property>(`/properties/${id}`, {
    method: "PATCH",
    body: JSON.stringify(parsePropertyFormData(formData)),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function setPropertyAvailability(id: string, available: boolean) {
  const result = await apiMutate<Property>(`/properties/${id}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ available }),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
}

const { property_type, operation_type, currency_type } = Constants.public.Enums;

export type PropertyRowPayload = {
  rowNumber: number;
  title: string;
  description?: string;
  zone: string;
  type: string;
  operation: string;
  price: number;
  currency?: string;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  coveredArea?: number;
  totalArea?: number;
  hoaFees?: number;
  address?: string;
  parking?: boolean;
};

export type ParsedRow = {
  rowNumber: number;
  errors: string[];
  payload?: PropertyRowPayload;
};

export type ExcelParseState = {
  rows?: ParsedRow[];
  error?: string;
};

export type ConfirmUploadResult = {
  created: number;
  total: number;
  failures: string[];
};

type PropertyField = Exclude<keyof PropertyRowPayload, "rowNumber">;

// Header text (lowercased) -> canonical PropertyRowPayload field.
const COLUMN_ALIASES: Record<string, PropertyField> = {
  title: "title",
  description: "description",
  zone: "zone",
  type: "type",
  operation: "operation",
  price: "price",
  currency: "currency",
  rooms: "rooms",
  bedrooms: "bedrooms",
  bathrooms: "bathrooms",
  coveredarea: "coveredArea",
  totalarea: "totalArea",
  hoafees: "hoaFees",
  address: "address",
  parking: "parking",
};

const REQUIRED_FIELDS: PropertyField[] = ["title", "zone", "type", "operation", "price"];

const NUMERIC_FIELDS: { field: PropertyField; label: string }[] = [
  { field: "price", label: "precio" },
  { field: "rooms", label: "ambientes" },
  { field: "bedrooms", label: "dormitorios" },
  { field: "bathrooms", label: "baños" },
  { field: "coveredArea", label: "superficie cubierta" },
  { field: "totalArea", label: "superficie total" },
  { field: "hoaFees", label: "expensas" },
];

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (typeof v.text === "string") return v.text.trim();
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (v.result !== undefined) return cellToString(v.result);
  }
  return String(value).trim();
}

function numberFromCell(value: unknown): { ok: boolean; value?: number } {
  if (value === null || value === undefined || value === "") return { ok: true };
  if (typeof value === "object" && value !== null && "result" in value) {
    return numberFromCell((value as { result: unknown }).result);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  const text = cellToString(value);
  if (text === "") return { ok: true };
  let parsed = Number(text);
  if (Number.isNaN(parsed) && text.includes(",") && !text.includes(".")) {
    parsed = Number(text.replace(",", "."));
  }
  return Number.isNaN(parsed) ? { ok: false } : { ok: true, value: parsed };
}

function booleanFromCell(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = cellToString(value).toLowerCase();
  if (["true", "sí", "si", "1"].includes(text)) return true;
  if (["false", "no", "0"].includes(text)) return false;
  return undefined;
}

/**
 * Parses and validates an uploaded Excel file against CreatePropertyDto's
 * rules, but never calls apps/api — this is a read-only preview step so the
 * caller can review what would be created before anything is written.
 */
export async function parsePropertiesExcel(
  _prevState: ExcelParseState,
  formData: FormData,
): Promise<ExcelParseState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elegí un archivo Excel (.xlsx)." };
  }

  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "No se pudo leer el archivo. Verificá que sea un .xlsx válido." };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    return { error: "El archivo no tiene filas de datos." };
  }

  const columnMap = new Map<number, PropertyField>();
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const field = COLUMN_ALIASES[cellToString(cell.value).toLowerCase()];
    if (field) columnMap.set(colNumber, field);
  });

  const foundFields = new Set(columnMap.values());
  const missing = REQUIRED_FIELDS.filter((field) => !foundFields.has(field));
  if (missing.length > 0) {
    return { error: `Al archivo le faltan estas columnas: ${missing.join(", ")}.` };
  }

  const rows: ParsedRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells: Partial<Record<PropertyField, unknown>> = {};
    columnMap.forEach((field, colNumber) => {
      cells[field] = row.getCell(colNumber).value;
    });

    const isBlank = Object.values(cells).every((v) => v === null || v === undefined || v === "");
    if (isBlank) continue;

    const errors: string[] = [];

    const title = cellToString(cells.title);
    if (!title) errors.push("title es obligatorio");

    const zone = cellToString(cells.zone);
    if (!zone) errors.push("zone es obligatorio");

    const type = cellToString(cells.type);
    if (!property_type.includes(type as (typeof property_type)[number])) {
      errors.push(`type debe ser uno de: ${property_type.join(", ")}`);
    }

    const operation = cellToString(cells.operation);
    if (!operation_type.includes(operation as (typeof operation_type)[number])) {
      errors.push(`operation debe ser uno de: ${operation_type.join(", ")}`);
    }

    const currency = cellToString(cells.currency);
    if (currency && !currency_type.includes(currency as (typeof currency_type)[number])) {
      errors.push(`currency debe ser uno de: ${currency_type.join(", ")}`);
    }

    const numbers: Partial<Record<PropertyField, number>> = {};
    for (const { field, label } of NUMERIC_FIELDS) {
      const result = numberFromCell(cells[field]);
      if (!result.ok) {
        errors.push(`${label} inválido ("${cellToString(cells[field])}")`);
      } else if (field === "price" && (result.value === undefined || result.value <= 0)) {
        errors.push(`${label} debe ser un número positivo`);
      } else if (result.value !== undefined && result.value < 0) {
        errors.push(`${label} no puede ser negativo`);
      } else {
        numbers[field] = result.value;
      }
    }

    if (errors.length > 0) {
      rows.push({ rowNumber, errors });
      continue;
    }

    rows.push({
      rowNumber,
      errors: [],
      payload: {
        rowNumber,
        title,
        description: cellToString(cells.description) || undefined,
        zone,
        type,
        operation,
        price: numbers.price!,
        currency: currency || undefined,
        rooms: numbers.rooms,
        bedrooms: numbers.bedrooms,
        bathrooms: numbers.bathrooms,
        coveredArea: numbers.coveredArea,
        totalArea: numbers.totalArea,
        hoaFees: numbers.hoaFees,
        address: cellToString(cells.address) || undefined,
        parking: booleanFromCell(cells.parking),
      },
    });
  }

  if (rows.length === 0) {
    return { error: "El archivo no tiene filas de datos." };
  }

  return { rows };
}

/**
 * Creates the properties the caller already reviewed via
 * parsePropertiesExcel. Called directly from the client (not a bound form
 * action), same pattern as setPropertyAvailability.
 */
export async function confirmPropertiesUpload(
  payloads: PropertyRowPayload[],
): Promise<ConfirmUploadResult> {
  let created = 0;
  const failures: string[] = [];

  for (const { rowNumber, ...payload } of payloads) {
    const result = await apiMutate<Property>("/properties", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (result.ok) {
      created += 1;
    } else {
      failures.push(`fila ${rowNumber}: ${result.error}`);
    }
  }

  revalidatePath("/properties");

  return { created, total: payloads.length, failures };
}
