import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { requireTeamBranchSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Relation = { name?: string; full_name?: string } | Array<{ name?: string; full_name?: string }> | null;
type ProductionRow = {
  employee_id: string;
  branch_id: string;
  sale_id: string;
  accounting_date: string;
  production_source: string;
  quantity: number | string;
  original_line_total: number | string;
  commercial_discount_amount: number | string;
  reward_discount_amount: number | string;
  courtesy_discount_amount: number | string;
  collected_amount: number | string;
  operational_contribution_amount: number | string;
  commissionable_amount: number | string;
  fixed_commission_amount: number | string;
  status: string;
  employee: Relation;
  branch: Relation;
  service: Relation;
};
type BonusRow = {
  employee_id: string | null;
  branch_id: string;
  sale_id: string;
  accounting_date: string;
  quantity: number | string;
  unit_bonus_amount: number | string;
  total_bonus_amount: number | string;
  status: string;
  employee: Relation;
  branch: Relation;
  product: Relation;
  sale_item: { description_snapshot?: string; total?: number | string } | Array<{ description_snapshot?: string; total?: number | string }> | null;
};
type DebtRow = {
  employee_id: string;
  debt_type: string;
  original_amount: number | string;
  outstanding_amount: number | string;
  status: string;
  description: string | null;
  created_at: string;
  employee: Relation;
  branch: Relation;
};
type SettlementRow = {
  employee_id: string;
  commission_rate: number | string;
  percentage_commission_total: number | string;
  reward_fixed_commission_total: number | string;
  courtesy_fixed_commission_total: number | string;
  product_bonus_total: number | string;
  debt_deduction_total: number | string;
  gross_pay_amount: number | string;
  net_pay_amount: number | string;
  status: string;
};

const money = (value: number | string | null | undefined) => Number(value ?? 0);
const relationLabel = (value: Relation, key: "name" | "full_name") =>
  (Array.isArray(value) ? value[0]?.[key] : value?.[key]) ?? "Sin registro";
const single = <T,>(value: T | T[] | null) => Array.isArray(value) ? (value[0] ?? null) : value;
const sourceLabel: Record<string, string> = {
  normal: "Normal",
  reward: "Reward",
  courtesy: "Cortesía",
  commercial_discount: "Descuento comercial",
  employee_benefit: "Beneficio interno",
};
const debtTypeLabel: Record<string, string> = {
  loan: "Préstamo",
  advance: "Adelanto",
  supply: "Insumo",
  internal_credit: "Crédito interno",
  other: "Otro",
};
const moneyFormat = 'S/ #,##0.00;[Red]-S/ #,##0.00';

function addSheetTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, headers: string[]) {
  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, headers.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { italic: true, color: { argb: "FF475569" } };
  sheet.getRow(2).height = 20;

  const headerRow = sheet.getRow(4);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 30;
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
}

function formatDataRows(sheet: ExcelJS.Worksheet, moneyColumns: number[], dateColumns: number[]) {
  for (let rowIndex = 5; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.alignment = { vertical: "top" };
    if (rowIndex % 2 === 1) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    }
    for (const column of moneyColumns) row.getCell(column).numFmt = moneyFormat;
    for (const column of dateColumns) row.getCell(column).numFmt = "dd/mm/yyyy";
  }
}

function toDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

export async function GET(request: Request) {
  const auth = await requireTeamBranchSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId")?.trim() ?? "";
  if (!periodId) return NextResponse.json({ error: "Selecciona un período para exportar." }, { status: 400 });

  const requestedBranchId = searchParams.get("branchId")?.trim() ?? "";
  const branchId = auth.role === "reception" ? (auth.branchId ?? "") : requestedBranchId;
  if (auth.role === "reception" && !branchId) {
    return NextResponse.json({ error: "La cuenta de recepción no tiene una sede asignada." }, { status: 403 });
  }
  const employeeId = searchParams.get("employeeId")?.trim() ?? "";
  const source = searchParams.get("source")?.trim() ?? "";
  const status = searchParams.get("status") === "reversed" ? "reversed" : searchParams.get("status") === "all" ? "all" : "active";
  const supabase = await createClient();

  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .select("id,start_date,end_date")
    .eq("id", periodId)
    .maybeSingle();
  if (periodError || !period) return NextResponse.json({ error: "El período seleccionado no está disponible." }, { status: 404 });

  let productionQuery = supabase
    .from("employee_service_production")
    .select("employee_id,branch_id,sale_id,accounting_date,production_source,quantity,original_line_total,commercial_discount_amount,reward_discount_amount,courtesy_discount_amount,collected_amount,operational_contribution_amount,commissionable_amount,fixed_commission_amount,status,employee:employees(full_name),branch:branches(name),service:services(name),sale:sales!inner(pos_session:pos_sessions!inner(status))")
    .eq("payroll_period_id", periodId)
    .eq("sale.pos_session.status", "closed")
    .order("accounting_date", { ascending: true });
  if (branchId) productionQuery = productionQuery.eq("branch_id", branchId);
  if (employeeId) productionQuery = productionQuery.eq("employee_id", employeeId);
  if (source) productionQuery = productionQuery.eq("production_source", source);
  if (status !== "all") productionQuery = productionQuery.eq("status", status);

  let bonusesQuery = supabase
    .from("employee_product_bonus_entries")
    .select("employee_id,branch_id,sale_id,accounting_date,quantity,unit_bonus_amount,total_bonus_amount,status,employee:employees(full_name),branch:branches(name),product:products(name),sale_item:sale_items(description_snapshot,total),sale:sales!inner(pos_session:pos_sessions!inner(status))")
    .eq("payroll_period_id", periodId)
    .order("accounting_date", { ascending: true });
  bonusesQuery = bonusesQuery.eq("sale.pos_session.status", "closed");
  if (branchId) bonusesQuery = bonusesQuery.eq("branch_id", branchId);
  if (employeeId) bonusesQuery = bonusesQuery.eq("employee_id", employeeId);
  if (status === "active") bonusesQuery = bonusesQuery.in("status", ["active", "pending_review"]);
  if (status === "reversed") bonusesQuery = bonusesQuery.eq("status", "reversed");

  let debtsQuery = supabase
    .from("employee_debts")
    .select("employee_id,debt_type,original_amount,outstanding_amount,status,description,created_at,employee:employees!employee_debts_employee_id_fkey(full_name),branch:branches(name)")
    .in("status", ["pending", "partial"])
    .order("created_at", { ascending: true });
  if (branchId) debtsQuery = debtsQuery.eq("branch_id", branchId);
  if (employeeId) debtsQuery = debtsQuery.eq("employee_id", employeeId);

  let settlementsQuery = supabase
    .from("employee_settlements")
    .select("employee_id,commission_rate,percentage_commission_total,reward_fixed_commission_total,courtesy_fixed_commission_total,product_bonus_total,debt_deduction_total,gross_pay_amount,net_pay_amount,status")
    .eq("payroll_period_id", periodId)
    .neq("status", "cancelled");
  if (employeeId) settlementsQuery = settlementsQuery.eq("employee_id", employeeId);

  const [productionResult, bonusesResult, debtsResult, settlementsResult] = await Promise.all([
    productionQuery,
    bonusesQuery,
    debtsQuery,
    settlementsQuery,
  ]);
  const error = productionResult.error ?? bonusesResult.error ?? debtsResult.error ?? settlementsResult.error;
  if (error) {
    console.error("[production/export] Error al cargar datos", { message: error.message, code: error.code });
    return NextResponse.json({ error: "No se pudo preparar la exportación." }, { status: 500 });
  }

  const rows = (productionResult.data ?? []) as unknown as ProductionRow[];
  const bonuses = (bonusesResult.data ?? []) as unknown as BonusRow[];
  const debts = (debtsResult.data ?? []) as unknown as DebtRow[];
  const settlements = (settlementsResult.data ?? []) as unknown as SettlementRow[];
  const summary = new Map<string, Record<string, string | number>>();
  const createSummary = (id: string, employee: string, branch: string) => ({
    employee, branch, services: 0, serviceGross: 0, discounts: 0, collected: 0, contribution: 0,
    base: 0, products: 0, productGross: 0, bonuses: 0, rewards: 0, fixedRewards: 0,
    fixedPay: 0, commissionRate: 0, debtDeductions: 0, debtRemaining: 0, grossPay: 0, netPay: 0, settlementStatus: "Pendiente",
  });
  for (const row of rows) {
    const current = summary.get(row.employee_id) ?? createSummary(row.employee_id, relationLabel(row.employee, "full_name"), relationLabel(row.branch, "name"));
    current.services = Number(current.services) + money(row.quantity);
    current.serviceGross = Number(current.serviceGross) + money(row.original_line_total);
    current.discounts = Number(current.discounts) + money(row.commercial_discount_amount) + money(row.reward_discount_amount) + money(row.courtesy_discount_amount);
    current.collected = Number(current.collected) + money(row.collected_amount);
    current.contribution = Number(current.contribution) + money(row.operational_contribution_amount);
    current.base = Number(current.base) + money(row.commissionable_amount);
    current.fixedPay = Number(current.fixedPay) + money(row.fixed_commission_amount);
    if (row.production_source === "reward") {
      current.rewards = Number(current.rewards) + money(row.quantity);
      current.fixedRewards = Number(current.fixedRewards) + money(row.fixed_commission_amount);
    }
    summary.set(row.employee_id, current);
  }
  for (const bonus of bonuses) {
    if (!bonus.employee_id) continue;
    const current = summary.get(bonus.employee_id) ?? createSummary(bonus.employee_id, relationLabel(bonus.employee, "full_name"), relationLabel(bonus.branch, "name"));
    current.products = Number(current.products) + money(bonus.quantity);
    current.productGross = Number(current.productGross) + money(single(bonus.sale_item)?.total);
    current.bonuses = Number(current.bonuses) + money(bonus.total_bonus_amount);
    summary.set(bonus.employee_id, current);
  }
  for (const debt of debts) {
    const current = summary.get(debt.employee_id) ?? createSummary(debt.employee_id, relationLabel(debt.employee, "full_name"), relationLabel(debt.branch, "name"));
    current.debtRemaining = Number(current.debtRemaining) + money(debt.outstanding_amount);
    summary.set(debt.employee_id, current);
  }
  for (const settlement of settlements) {
    const current = summary.get(settlement.employee_id);
    if (!current) continue;
    current.debtDeductions = money(settlement.debt_deduction_total);
    current.commissionRate = money(settlement.commission_rate);
    current.grossPay = money(settlement.gross_pay_amount);
    current.netPay = money(settlement.net_pay_amount);
    current.settlementStatus = settlement.status;
  }

  const subtitle = `Período: ${period.start_date} al ${period.end_date} · Generado: ${new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Lima" }).format(new Date())}`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "La Bajadita";
  workbook.created = new Date();
  workbook.properties.date1904 = false;

  const summarySheet = workbook.addWorksheet("Resumen por empleado", { views: [{ showGridLines: false }] });
  const summaryHeaders = ["Empleado", "Sede", "Servicios", "Bruto servicios", "Descuentos", "Cobrado", "Aporte operativo", "Base comisionable", "Productos", "Bruto productos", "Bonos", "Rewards", "Comisión fija rewards", "Deducciones de deuda", "Deuda restante", "Bruto liquidación", "Neto liquidación", "Estado liquidación"];
  addSheetTitle(summarySheet, "Producción — Resumen por empleado", subtitle, summaryHeaders);
  for (const item of Array.from(summary.values()).sort((a, b) => String(a.employee).localeCompare(String(b.employee), "es"))) {
    summarySheet.addRow([item.employee, item.branch, item.services, item.serviceGross, item.discounts, item.collected, item.contribution, item.base, item.products, item.productGross, item.bonuses, item.rewards, item.fixedRewards, item.debtDeductions, item.debtRemaining, item.grossPay, item.netPay, item.settlementStatus]);
  }
  summarySheet.columns = [22, 22, 11, 16, 14, 14, 18, 18, 11, 16, 14, 11, 22, 20, 18, 18, 18, 18].map((width) => ({ width }));
  formatDataRows(summarySheet, [4, 5, 6, 7, 8, 10, 11, 13, 14, 15, 16, 17], []);

  const detailSheet = workbook.addWorksheet("Detalle de producción", { views: [{ showGridLines: false }] });
  const detailHeaders = ["Fecha contable", "Tipo", "Empleado", "Sede", "Venta", "Concepto", "Origen", "Estado", "Cantidad", "Bruto", "Descuentos", "Cobrado", "Aporte", "Base", "Comisión fija", "Bono unitario", "Bono total"];
  addSheetTitle(detailSheet, "Producción — Detalle", subtitle, detailHeaders);
  for (const row of rows) {
    detailSheet.addRow([toDate(row.accounting_date), "Servicio", relationLabel(row.employee, "full_name"), relationLabel(row.branch, "name"), `VTA-${row.sale_id.slice(0, 8).toUpperCase()}`, relationLabel(row.service, "name"), sourceLabel[row.production_source] ?? row.production_source, row.status, money(row.quantity), money(row.original_line_total), money(row.commercial_discount_amount) + money(row.reward_discount_amount) + money(row.courtesy_discount_amount), money(row.collected_amount), money(row.operational_contribution_amount), money(row.commissionable_amount), money(row.fixed_commission_amount), null, null]);
  }
  for (const bonus of bonuses) {
    detailSheet.addRow([toDate(bonus.accounting_date), "Producto", relationLabel(bonus.employee, "full_name"), relationLabel(bonus.branch, "name"), `VTA-${bonus.sale_id.slice(0, 8).toUpperCase()}`, relationLabel(bonus.product, "name") || single(bonus.sale_item)?.description_snapshot || "Producto", "Bono de producto", bonus.status, money(bonus.quantity), money(single(bonus.sale_item)?.total), 0, money(single(bonus.sale_item)?.total), 0, 0, 0, money(bonus.unit_bonus_amount), money(bonus.total_bonus_amount)]);
  }
  detailSheet.columns = [14, 12, 23, 22, 15, 28, 22, 16, 11, 14, 14, 14, 14, 14, 16, 16, 14].map((width) => ({ width }));
  formatDataRows(detailSheet, [10, 11, 12, 13, 14, 15, 16, 17], [1]);

  const simulationSheet = workbook.addWorksheet("Simulación de cobros", { views: [{ showGridLines: false }] });
  const simulationHeaders = ["Barbero / empleado", "Sede", "Base comisionable", "% comisión", "Comisión por producción", "Bonos", "Comisión fija", "Bruto a cobrar", "Deuda vigente", "Descuento por deuda", "Deducción adicional (%)", "Deducción adicional", "Cobro neto"];
  addSheetTitle(
    simulationSheet,
    "Simulación de cobros",
    `${subtitle} · Edita únicamente las celdas amarillas: % comisión, descuento por deuda y deducción adicional.`,
    simulationHeaders,
  );
  const simulationRows = Array.from(summary.values()).sort((a, b) => String(a.employee).localeCompare(String(b.employee), "es"));
  for (const item of simulationRows) {
    const rowNumber = simulationSheet.rowCount + 1;
    const base = Number(item.base);
    const commissionRate = Number(item.commissionRate);
    const productionCommission = base * commissionRate / 100;
    const bonusesAmount = Number(item.bonuses);
    const fixedPay = Number(item.fixedPay);
    const gross = productionCommission + bonusesAmount + fixedPay;
    const debtDeduction = Math.min(Number(item.debtDeductions), gross);
    simulationSheet.addRow([
      item.employee,
      item.branch,
      base,
      commissionRate / 100,
      { formula: `C${rowNumber}*D${rowNumber}`, result: productionCommission },
      bonusesAmount,
      fixedPay,
      { formula: `E${rowNumber}+F${rowNumber}+G${rowNumber}`, result: gross },
      Number(item.debtRemaining),
      debtDeduction,
      0,
      { formula: `H${rowNumber}*K${rowNumber}`, result: 0 },
      { formula: `MAX(H${rowNumber}-J${rowNumber}-L${rowNumber},0)`, result: Math.max(gross - debtDeduction, 0) },
    ]);
    for (const column of [4, 10, 11]) {
      const cell = simulationSheet.getCell(rowNumber, column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
      cell.note = column === 4
        ? "Editable. Porcentaje aplicado a la base comisionable."
        : column === 10
          ? "Editable. Monto que se /* descontar */á de la deuda en esta liquidación."
          : "Editable. Descuento adicional sobre el bruto a cobrar.";
    }
  }
  const totalsRowNumber = simulationSheet.rowCount + 1;
  const firstDataRow = 5;
  simulationSheet.addRow([
    "TOTALES", "", { formula: `SUM(C${firstDataRow}:C${totalsRowNumber - 1})` }, "",
    { formula: `SUM(E${firstDataRow}:E${totalsRowNumber - 1})` }, { formula: `SUM(F${firstDataRow}:F${totalsRowNumber - 1})` },
    { formula: `SUM(G${firstDataRow}:G${totalsRowNumber - 1})` }, { formula: `SUM(H${firstDataRow}:H${totalsRowNumber - 1})` },
    { formula: `SUM(I${firstDataRow}:I${totalsRowNumber - 1})` }, { formula: `SUM(J${firstDataRow}:J${totalsRowNumber - 1})` }, "",
    { formula: `SUM(L${firstDataRow}:L${totalsRowNumber - 1})` }, { formula: `SUM(M${firstDataRow}:M${totalsRowNumber - 1})` },
  ]);
  simulationSheet.columns = [24, 22, 18, 14, 22, 14, 16, 18, 18, 20, 24, 20, 18].map((width) => ({ width }));
  formatDataRows(simulationSheet, [3, 5, 6, 7, 8, 9, 10, 12, 13], []);
  for (let rowIndex = 5; rowIndex <= totalsRowNumber; rowIndex += 1) {
    simulationSheet.getCell(rowIndex, 4).numFmt = "0.00%";
    simulationSheet.getCell(rowIndex, 11).numFmt = "0.00%";
  }
  const totalsRow = simulationSheet.getRow(totalsRowNumber);
  totalsRow.font = { bold: true, color: { argb: "FF0F172A" } };
  totalsRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };

  const debtsSheet = workbook.addWorksheet("Deudas vigentes", { views: [{ showGridLines: false }] });
  const debtsHeaders = ["Empleado", "Sede", "Tipo", "Descripción", "Fecha de registro", "Monto original", "Descontado / pagado", "Saldo restante", "Estado"];
  addSheetTitle(debtsSheet, "Deudas de empleados — Saldos vigentes", subtitle, debtsHeaders);
  for (const debt of debts) {
    const original = money(debt.original_amount);
    const remaining = money(debt.outstanding_amount);
    debtsSheet.addRow([relationLabel(debt.employee, "full_name"), relationLabel(debt.branch, "name"), debtTypeLabel[debt.debt_type] ?? debt.debt_type, debt.description ?? "", toDate(debt.created_at), original, original - remaining, remaining, debt.status]);
  }
  debtsSheet.columns = [24, 22, 18, 42, 18, 16, 20, 18, 14].map((width) => ({ width }));
  formatDataRows(debtsSheet, [6, 7, 8], [5]);

  for (const sheet of workbook.worksheets) {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `produccion-${period.start_date}-${period.end_date}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
