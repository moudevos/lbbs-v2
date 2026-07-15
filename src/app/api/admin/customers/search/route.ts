import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { normalizeSearchText } from "@/lib/utils/search";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? "8");
  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 20) : 8;
  const digits = rawQuery.replace(/\D/g, "");
  const normalizedQuery = normalizeSearchText(rawQuery).replace(/,/g, " ");

  let query = supabase
    .from("customers")
    .select(
      "id, full_name, first_name, last_name, business_name, phone, phone_normalized, email, document_type, document_number, is_active",
    )
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (rawQuery) {
    const escapedQuery = rawQuery.replace(/,/g, " ");
    query = query.or(
      [
        `search_normalized.ilike.%${normalizedQuery}%`,
        `phone.ilike.%${escapedQuery}%`,
        digits ? `phone_normalized.ilike.%${digits}%` : "",
        `document_number.ilike.%${escapedQuery}%`,
      ]
        .filter(Boolean)
        .join(","),
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[customers/search] Error al buscar clientes", {
      message: error.message,
      code: error.code,
      query: rawQuery,
    });
    return NextResponse.json(
      { error: "No se pudieron buscar los clientes." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}
