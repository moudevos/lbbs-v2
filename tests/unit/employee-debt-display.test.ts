import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  enrichEmployeeDebtDisplay,
  getDebtTypeLabel,
} from "@/lib/employee-debts/debt-display";

function mockSupabase(items: Array<{ sale_id: string; description_snapshot: string }>) {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          order: async () => ({ data: items, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("presentación enriquecida de deudas", () => {
  it("muestra tipo y descripción sin alterar deudas manuales", async () => {
    const [row] = await enrichEmployeeDebtDisplay(mockSupabase([]), [
      {
        id: "debt-1",
        debt_type: "advance",
        description: "Pago producción domingo",
      },
    ]);

    expect(getDebtTypeLabel("advance")).toBe("Adelanto");
    expect(row.display_type_label).toBe("Adelanto");
    expect(row.display_description).toBe("Pago producción domingo");
    expect(row.display_sale_reference).toBeNull();
  });

  it("resuelve consumo POS con primer item y referencia VTA derivada del sales.id", async () => {
    const saleId = "b554f8dd-6cc1-4a05-a96d-4ed8f0c5e432";
    const [row] = await enrichEmployeeDebtDisplay(
      mockSupabase([
        { sale_id: saleId, description_snapshot: "Agua San Luis 500ml" },
        { sale_id: saleId, description_snapshot: "Segundo producto" },
      ]),
      [
        {
          id: "debt-pos",
          debt_type: "internal_credit",
          description: `Compra a crédito desde POS: ${saleId}`,
        },
      ],
    );

    expect(row.display_type_label).toBe("Consumo POS");
    expect(row.display_description).toBe("Agua San Luis 500ml");
    expect(row.display_sale_reference).toBe("VTA-B554F8DD");
    expect(row.display_extra_item_count).toBe(1);
  });

  it("conserva la descripción legacy si un consumo POS antiguo no tiene sale id recuperable", async () => {
    const [row] = await enrichEmployeeDebtDisplay(mockSupabase([]), [
      {
        id: "legacy-pos",
        debt_type: "internal_credit",
        description: "Consumo POS legacy sin vínculo de venta",
      },
    ]);

    expect(row.display_type_label).toBe("Consumo POS");
    expect(row.display_description).toBe("Consumo POS legacy sin vínculo de venta");
    expect(row.display_sale_reference).toBeNull();
  });
});
