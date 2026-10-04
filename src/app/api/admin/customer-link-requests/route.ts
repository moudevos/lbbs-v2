import { NextRequest, NextResponse } from "next/server";

import { requireCustomerWriteSession } from "@/lib/supabase/route-auth";
import { createClient } from "@/lib/supabase/server";

const statusFilters = {
  pending: ["pending", "approved"],
  active: ["code_generated"],
  finished: ["linked", "rejected", "expired"],
  all: ["pending", "approved", "code_generated", "linked", "rejected", "expired"],
} as const;

export async function GET(request: NextRequest) {
  const auth = await requireCustomerWriteSession();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const requestedFilter = request.nextUrl.searchParams.get("filter") ?? "pending";
  const filter = requestedFilter in statusFilters ? requestedFilter as keyof typeof statusFilters : "pending";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_link_requests")
    .select("id,status,requested_document_type,requested_document_number,requested_phone,requested_email,requested_name,requested_at,code_expires_at,attempt_count,customers(id,full_name,document_type,document_number,phone,email)")
    .in("status", statusFilters[filter])
    .order("requested_at", { ascending: filter === "finished" ? false : true });

  if (error) return NextResponse.json({ error: "No se pudieron cargar las vinculaciones." }, { status: 400 });
  return NextResponse.json({ data: data ?? [] });
}
