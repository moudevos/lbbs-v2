import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const branchId = new URL(request.url).searchParams.get("branchId")?.trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vw_product_stock")
    .select("branch_id, product_id, stock_quantity, product:products(sku,name,description,category:product_categories(name)), branch:branches(name)")
    .order("branch_id").order("product_id");
  if (error) return NextResponse.json({ error: "No se pudo preparar el inventario." }, { status: 500 });
  const rows = (data ?? []).filter((row) => !branchId || row.branch_id === branchId);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");
  sheet.columns = [
    { header: "Sede", key: "branch", width: 24 }, { header: "SKU", key: "sku", width: 16 },
    { header: "Producto", key: "product", width: 32 }, { header: "Descripción", key: "description", width: 38 },
    { header: "Categoría", key: "category", width: 22 }, { header: "Cantidad sistema", key: "system", width: 18 },
    { header: "Conteo físico", key: "physical", width: 18 }, { header: "Diferencia", key: "difference", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const branch = Array.isArray(row.branch) ? row.branch[0] : row.branch;
    const categoryValue = product && Array.isArray(product.category) ? product.category[0] : product?.category;
    const category = Array.isArray(categoryValue) ? categoryValue[0] : categoryValue;
    sheet.addRow({ branch: branch?.name ?? "", sku: product?.sku ?? "", product: product?.name ?? "", description: product?.description ?? "", category: category?.name ?? "", system: Number(row.stock_quantity ?? 0), physical: "", difference: "" });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename=inventario-${date}.xlsx` } });
}
