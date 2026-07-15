import { Workbook } from "exceljs";
import { NextResponse } from "next/server";
import { Constants } from "types";
import { createClient } from "@/lib/supabase/server";
import { OPERATION_TYPE_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/property-labels";

const { property_type, operation_type, currency_type } = Constants.public.Enums;

const HEADERS = [
  "Título",
  "Zona",
  "Tipo",
  "Operación",
  "Precio",
  "Moneda",
  "Descripción",
  "Ambientes",
  "Dormitorios",
  "Baños",
  "Superficie cubierta",
  "Superficie total",
  "Expensas",
  "Dirección",
  "Cochera",
] as const;

const EXAMPLE_ROW = [
  "Casa 3 ambientes con jardín",
  "Palermo",
  PROPERTY_TYPE_LABELS[property_type[0]],
  OPERATION_TYPE_LABELS[operation_type[0]],
  150000,
  currency_type[0],
  "Luminosa, a metros del subte",
  3,
  2,
  1,
  80,
  100,
  25000,
  "Av. Santa Fe 1234",
  "Sí",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Propiedades");
  worksheet.addRow([...HEADERS]);
  worksheet.addRow(EXAMPLE_ROW);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns.forEach((column) => {
    column.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="plantilla-propiedades.xlsx"',
    },
  });
}
