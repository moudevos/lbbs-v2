import type { SupabaseClient } from "@supabase/supabase-js";

import { formatSaleReference } from "@/app/api/admin/pos/route-helpers";

type Row = Record<string, unknown>;

const debtTypeLabels: Record<string, string> = {
  loan: "Préstamo",
  advance: "Adelanto",
  supply: "Insumo",
  internal_credit: "Consumo POS",
  penalty: "Penalidad",
  other: "Otro cargo",
};

const uuidPattern =
  /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

function relation(value: unknown) {
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object" ? (item as Row) : null;
}

function debtTypeOf(row: Row) {
  const debt = relation(row.debt);
  return String(row.debt_type_snapshot ?? row.debt_type ?? debt?.debt_type ?? "other");
}

function descriptionOf(row: Row) {
  const debt = relation(row.debt);
  return String(
    row.debt_description_snapshot ??
      row.description ??
      debt?.description ??
      "Sin detalle",
  );
}

function saleIdOf(row: Row) {
  const directCandidates = [
    row.sale_id,
    row.source_sale_id,
    row.saleId,
    relation(row.debt)?.sale_id,
    relation(row.debt)?.source_sale_id,
  ];
  for (const candidate of directCandidates) {
    const value = String(candidate ?? "").trim();
    if (uuidPattern.test(value)) return value.match(uuidPattern)?.[1] ?? null;
  }
  return descriptionOf(row).match(uuidPattern)?.[1] ?? null;
}

export async function enrichEmployeeDebtDisplay(
  supabase: SupabaseClient,
  rows: Row[],
) {
  const saleIds = Array.from(
    new Set(
      rows
        .filter((row) => debtTypeOf(row) === "internal_credit")
        .map(saleIdOf)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const itemsBySale = new Map<string, Array<{ description_snapshot: string }>>();

  if (saleIds.length) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id,description_snapshot,created_at")
      .in("sale_id", saleIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[employee-debt-display] No se pudieron enriquecer items POS", {
        message: error.message,
        code: error.code,
      });
    } else {
      for (const item of (data ?? []) as Array<{
        sale_id: string;
        description_snapshot: string;
      }>) {
        const current = itemsBySale.get(item.sale_id) ?? [];
        current.push({ description_snapshot: item.description_snapshot });
        itemsBySale.set(item.sale_id, current);
      }
    }
  }

  return rows.map((row) => {
    const debtType = debtTypeOf(row);
    const description = descriptionOf(row);
    const saleId = debtType === "internal_credit" ? saleIdOf(row) : null;

    if (saleId) {
      const items = itemsBySale.get(saleId) ?? [];
      return {
        ...row,
        display_type_label: "Consumo POS",
        display_description:
          items[0]?.description_snapshot || "Consumo registrado en POS",
        display_sale_reference: formatSaleReference(saleId),
        display_extra_item_count: Math.max(items.length - 1, 0),
      };
    }

    return {
      ...row,
      display_type_label: debtTypeLabels[debtType] ?? debtType,
      display_description: description,
      display_sale_reference: null,
      display_extra_item_count: 0,
    };
  });
}

export function getDebtTypeLabel(debtType: string) {
  return debtTypeLabels[debtType] ?? debtType;
}
