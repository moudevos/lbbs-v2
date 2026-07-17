import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function findCustomerDuplicate(
  supabase: SupabaseClient,
  input: {
    phoneNormalized: string;
    documentType: string | null;
    documentNumber: string | null;
    excludeId?: string;
  },
) {
  let phoneQuery = supabase
    .from("customers")
    .select("id")
    .eq("phone_normalized", input.phoneNormalized);
  if (input.excludeId) phoneQuery = phoneQuery.neq("id", input.excludeId);
  const phoneResult = await phoneQuery.limit(1).maybeSingle();
  if (phoneResult.error) throw phoneResult.error;
  if (phoneResult.data) return "phone" as const;

  if (!input.documentType || !input.documentNumber) return null;

  let documentQuery = supabase
    .from("customers")
    .select("id")
    .eq("document_type", input.documentType)
    .eq("document_number", input.documentNumber);
  if (input.excludeId) documentQuery = documentQuery.neq("id", input.excludeId);
  const documentResult = await documentQuery.limit(1).maybeSingle();
  if (documentResult.error) throw documentResult.error;

  return documentResult.data ? "document" as const : null;
}

export function getCustomerDuplicateMessage(field: "phone" | "document") {
  return field === "phone"
    ? "Ya existe un cliente con ese celular."
    : "Ya existe un cliente con ese tipo y numero de documento.";
}
