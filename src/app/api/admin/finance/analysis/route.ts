import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/supabase/route-auth";

type Relation = {
  name?: string | null;
  full_name?: string | null;
  cost_price?: number | string | null;
} | null;
type SaleItem = {
  item_type?: string | null;
  total?: number | string | null;
  quantity?: number | string | null;
  cost_snapshot?: number | string | null;
  is_courtesy?: boolean | null;
  barber?: Relation | Relation[];
  product?: Relation | Relation[];
};

const money = (value: unknown) => Number(value ?? 0) || 0;
const first = <T>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
const relationName = (value: unknown, fallback: string) => {
  const relation = first(value as Relation | Relation[]);
  return relation?.name?.trim() || relation?.full_name?.trim() || fallback;
};
const validDate = (value: string | null) =>
  Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T12:00:00Z`)),
  );

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const branchId = searchParams.get("branchId")?.trim() || "";
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom! > dateTo!)
    return NextResponse.json(
      { error: "Selecciona un rango de fechas válido." },
      { status: 400 },
    );

  const supabase = await createClient();
  let salesQuery = supabase
    .from("sales")
    .select(
      "id,branch_id,accounting_date,subtotal,discount_total,total,pos_session:pos_sessions!inner(status),branch:branches(name),barber:employees!sales_barber_id_fkey(full_name),sale_items(item_type,total,quantity,cost_snapshot,is_courtesy,barber:employees!sale_items_barber_id_fkey(full_name),product:products(cost_price))",
    )
    .eq("status", "completed")
    .eq("pos_session.status", "closed")
    .gte("accounting_date", dateFrom!)
    .lte("accounting_date", dateTo!);
  let entriesQuery = supabase
    .from("finance_manual_entries")
    .select(
      "id,branch_id,entry_date,direction,amount,description,branch:branches(name),category:finance_categories(name,code,financial_group,affects_profit)",
    )
    .eq("status", "active")
    .gte("entry_date", dateFrom!)
    .lte("entry_date", dateTo!);
  let contributionQuery = supabase
    .from("employee_service_production")
    .select(
      "branch_id,accounting_date,operational_contribution_amount,sale:sales!inner(status,pos_session:pos_sessions!inner(status))",
    )
    .eq("status", "active")
    .eq("sale.status", "completed")
    .eq("sale.pos_session.status", "closed")
    .gte("accounting_date", dateFrom!)
    .lte("accounting_date", dateTo!);
  if (branchId) {
    salesQuery = salesQuery.eq("branch_id", branchId);
    entriesQuery = entriesQuery.eq("branch_id", branchId);
    contributionQuery = contributionQuery.eq("branch_id", branchId);
  }
  const [salesResult, entriesResult, contributionsResult, branchesResult] =
    await Promise.all([
      salesQuery,
      entriesQuery,
      contributionQuery,
      supabase
        .from("branches")
        .select("id,name")
        .eq("is_active", true)
        .order("name"),
    ]);
  const error =
    salesResult.error ??
    entriesResult.error ??
    contributionsResult.error ??
    branchesResult.error;
  if (error) {
    console.error("[finance/analysis] Error", {
      message: error.message,
      code: error.code,
    });
    return NextResponse.json(
      { error: "No se pudo preparar el análisis financiero." },
      { status: 500 },
    );
  }

  type Bucket = {
    id: string;
    name: string;
    grossSales: number;
    clientDiscounts: number;
    netSales: number;
    serviceSales: number;
    otherCategorySales: number;
    productCost: number;
    courtesyCost: number;
    courtesyReserve: number;
    profitIncome: number;
    profitExpenses: number;
    cashOnlyIncome: number;
    cashOnlyOutflows: number;
    unknownCostItems: number;
  };
  const byBranch = new Map<string, Bucket>();
  const empty = (id: string, name: string): Bucket => ({
    id,
    name,
    grossSales: 0,
    clientDiscounts: 0,
    netSales: 0,
    serviceSales: 0,
    otherCategorySales: 0,
    productCost: 0,
    courtesyCost: 0,
    courtesyReserve: 0,
    profitIncome: 0,
    profitExpenses: 0,
    cashOnlyIncome: 0,
    cashOnlyOutflows: 0,
    unknownCostItems: 0,
  });
  for (const branch of branchesResult.data ?? [])
    if (!branchId || branch.id === branchId)
      byBranch.set(branch.id, empty(branch.id, branch.name));
  const bucket = (id: string | null, name: string) => {
    const key = id ?? "unassigned";
    const found = byBranch.get(key);
    if (found) return found;
    const created = empty(key, name);
    byBranch.set(key, created);
    return created;
  };
  type Daily = {
    date: string;
    grossSales: number;
    netSales: number;
    expenses: number;
  };
  const daily = new Map<string, Daily>();
  const day = (date: string) => {
    const found = daily.get(date);
    if (found) return found;
    const created = { date, grossSales: 0, netSales: 0, expenses: 0 };
    daily.set(date, created);
    return created;
  };
  const barberDaily = new Map<
    string,
    { date: string; barber: string; sales: number }
  >();
  const expenseDetails: {
    date: string;
    branchId: string;
    branch: string;
    category: string;
    group: string;
    description: string;
    amount: number;
    affectsProfit: boolean;
  }[] = [];

  for (const sale of salesResult.data ?? []) {
    const current = bucket(
      sale.branch_id,
      relationName(sale.branch, "Sede sin nombre"),
    );
    const currentDay = day(sale.accounting_date);
    current.grossSales += money(sale.subtotal);
    current.clientDiscounts += money(sale.discount_total);
    current.netSales += money(sale.total);
    currentDay.grossSales += money(sale.subtotal);
    currentDay.netSales += money(sale.total);
    const saleBarber = relationName(sale.barber, "Sin barbero");
    for (const item of (sale.sale_items ?? []) as SaleItem[]) {
      const lineTotal = money(item.total);
      const quantity = money(item.quantity) || 1;
      if (item.item_type === "service") {
        current.serviceSales += lineTotal;
        const barber = relationName(item.barber, saleBarber);
        const key = `${sale.accounting_date}:${barber}`;
        const entry = barberDaily.get(key) ?? {
          date: sale.accounting_date,
          barber,
          sales: 0,
        };
        entry.sales += lineTotal;
        barberDaily.set(key, entry);
      } else current.otherCategorySales += lineTotal;
      if (item.item_type === "product") {
        const product = first(item.product);
        const unitCost =
          item.cost_snapshot === null || item.cost_snapshot === undefined
            ? money(product?.cost_price)
            : money(item.cost_snapshot);
        if (unitCost <= 0) current.unknownCostItems += quantity;
        else if (item.is_courtesy) current.courtesyCost += unitCost * quantity;
        else current.productCost += unitCost * quantity;
      }
    }
  }
  for (const row of contributionsResult.data ?? [])
    bucket(row.branch_id, "Sede sin nombre").courtesyReserve += money(
      row.operational_contribution_amount,
    );
  for (const entry of entriesResult.data ?? []) {
    const current = bucket(
      entry.branch_id,
      relationName(entry.branch, "Movimientos sin sede"),
    );
    const amount = money(entry.amount);
    const category = first(entry.category as Relation | Relation[]);
    const affectsProfit = Boolean(
      (category as { affects_profit?: boolean } | null)?.affects_profit,
    );
    const group = String(
      (category as { financial_group?: string } | null)?.financial_group ??
        "operating_expense",
    );
    if (affectsProfit) {
      if (entry.direction === "income") current.profitIncome += amount;
      else {
        current.profitExpenses += amount;
        day(entry.entry_date).expenses += amount;
      }
    } else if (entry.direction === "income") current.cashOnlyIncome += amount;
    else current.cashOnlyOutflows += amount;
    if (entry.direction === "expense")
      expenseDetails.push({
        date: entry.entry_date,
        branchId: current.id,
        branch: current.name,
        category: category?.name ?? "Sin categoría",
        group,
        description: entry.description,
        amount,
        affectsProfit,
      });
  }
  const branches = [...byBranch.values()]
    .map((item) => ({
      ...item,
      courtesyReserveBalance: item.courtesyReserve - item.courtesyCost,
      operatingResult:
        item.netSales +
        item.profitIncome -
        item.productCost -
        item.courtesyCost -
        item.profitExpenses,
    }))
    .sort((a, b) => b.netSales - a.netSales || a.name.localeCompare(b.name));
  const totals = branches.reduce(
    (sum, item) => {
      for (const key of Object.keys(sum) as (keyof typeof sum)[])
        sum[key] += item[key] as number;
      return sum;
    },
    {
      grossSales: 0,
      clientDiscounts: 0,
      netSales: 0,
      serviceSales: 0,
      otherCategorySales: 0,
      productCost: 0,
      courtesyCost: 0,
      courtesyReserve: 0,
      profitIncome: 0,
      profitExpenses: 0,
      cashOnlyIncome: 0,
      cashOnlyOutflows: 0,
      unknownCostItems: 0,
      courtesyReserveBalance: 0,
      operatingResult: 0,
    },
  );
  const expensesByCategory = Object.values(
    expenseDetails
      .filter((item) => item.affectsProfit)
      .reduce<Record<string, { name: string; amount: number }>>(
        (result, item) => {
          const current = result[item.category] ?? {
            name: item.category,
            amount: 0,
          };
          current.amount += item.amount;
          result[item.category] = current;
          return result;
        },
        {},
      ),
  ).sort((a, b) => b.amount - a.amount);
  return NextResponse.json({
    dateFrom,
    dateTo,
    branchId: branchId || null,
    totals,
    branches,
    dailySales: [...daily.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    barberDaily: [...barberDaily.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || b.sales - a.sales,
    ),
    expensesByCategory,
    expenseDetails: expenseDetails.sort((a, b) => b.date.localeCompare(a.date)),
  });
}
