import { Workbook } from "exceljs";
import { NextResponse } from "next/server";
import { Constants } from "types";
import { createClient } from "@/lib/supabase/server";

const { property_type, operation_type, currency_type } = Constants.public.Enums;

const HEADERS = [
  "title",
  "zone",
  "type",
  "operation",
  "price",
  "currency",
  "description",
  "rooms",
  "bedrooms",
  "bathrooms",
  "coveredArea",
  "totalArea",
  "hoaFees",
  "address",
  "parking",
] as const;

const EXAMPLE_ROW = [
  "Casa 3 ambientes con jardín",
  "Palermo",
  property_type[0],
  operation_type[0],
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
  true,
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
