import type { Enums } from "types";

type PropertyType = Enums<"property_type">;
type OperationType = Enums<"operation_type">;

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Departamento",
  ph: "PH",
  office: "Oficina",
  land: "Terreno",
};

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  rent: "Alquiler",
  sale: "Venta",
  temporary: "Alquiler temporario",
};

const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

// Lowercases, trims, and strips accents (é -> e) so both accented and
// unaccented Spanish input match — reused for Excel header matching too.
export function normalizeText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "");
}

const normalize = normalizeText;

function buildReverseLookup<T extends string>(labels: Record<T, string>) {
  const map = new Map<string, T>();
  for (const [value, label] of Object.entries(labels) as [T, string][]) {
    map.set(normalize(value), value);
    map.set(normalize(label), value);
  }
  return map;
}

const PROPERTY_TYPE_LOOKUP = buildReverseLookup(PROPERTY_TYPE_LABELS);
const OPERATION_TYPE_LOOKUP = buildReverseLookup(OPERATION_TYPE_LABELS);

export function propertyTypeFromLabel(input: string): PropertyType | undefined {
  return PROPERTY_TYPE_LOOKUP.get(normalize(input));
}

export function operationTypeFromLabel(
  input: string,
): OperationType | undefined {
  return OPERATION_TYPE_LOOKUP.get(normalize(input));
}
