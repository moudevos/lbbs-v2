import { NextResponse } from "next/server";

import type { PosCourtesySessionSummary } from "@/features/pos/pos-types";
import { createClient } from "@/lib/supabase/server";
import { requirePosWriteSession } from "@/lib/supabase/route-auth";

type CourtesyItemRow = {
  product_id: string | null;
  description_snapshot: string | null;
  quantity: number | string | null;
};

export async function GET(request: Request) {
  const auth = await requirePosWriteSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "Falta la sesion POS." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: session, error: sessionError } = await supabase
    .from("pos_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "La sesion POS no esta disponible." },
      { status: 404 },
    );
  }

  const { data: completedSales, error: salesError } = await supabase
    .from("sales")
    .select("id")
    .eq("pos_session_id", sessionId)
    .eq("status", "completed");

  if (salesError) {
    console.error("[pos/cortesias] Error al cargar ventas", {
      sessionId,
      message: salesError.message,
      code: salesError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las cortesias entregadas." },
      { status: 500 },
    );
  }

  const saleIds = (completedSales ?? []).map((sale) => sale.id);
  if (saleIds.length === 0) {
    const empty: PosCourtesySessionSummary = {
      sessionId,
      totalQuantity: 0,
      products: [],
    };
    return NextResponse.json({ data: empty });
  }

  const { data: rawItems, error: itemsError } = await supabase
    .from("sale_items")
    .select("product_id,description_snapshot,quantity")
    .in("sale_id", saleIds)
    .eq("item_type", "product")
    .eq("is_courtesy", true);

  if (itemsError) {
    console.error("[pos/cortesias] Error al cargar items", {
      sessionId,
      message: itemsError.message,
      code: itemsError.code,
    });
    return NextResponse.json(
      { error: "No se pudieron cargar las cortesias entregadas." },
      { status: 500 },
    );
  }

  const grouped = new Map<
    string,
    { productId: string | null; productName: string; quantity: number }
  >();

  for (const item of (rawItems ?? []) as CourtesyItemRow[]) {
    const productName = item.description_snapshot?.trim() || "Producto";
    const key = item.product_id ?? `snapshot:${productName.toLowerCase()}`;
    const quantity = Number(item.quantity ?? 0);
    const current = grouped.get(key);

    if (current) {
      current.quantity += Number.isFinite(quantity) ? quantity : 0;
    } else {
      grouped.set(key, {
        productId: item.product_id,
        productName,
        quantity: Number.isFinite(quantity) ? quantity : 0,
      });
    }
  }

  const products = Array.from(grouped.values()).sort((left, right) => {
    if (right.quantity !== left.quantity) return right.quantity - left.quantity;
    return left.productName.localeCompare(right.productName, "es");
  });

  const data: PosCourtesySessionSummary = {
    sessionId,
    totalQuantity: products.reduce((total, product) => total + product.quantity, 0),
    products,
  };

  return NextResponse.json({ data });
}
